-- =====================================================================
-- 온담 AI — 0007: 위험도 3단계 · 교장교감 메모 · 학년별 통계 (2026-11-24 사용자 요청)
--
-- 1) 위험도는 학교에 전달된 문의만 분류하므로 Level 0(정보 문의)을 없애고 3단계로 바꾼다.
--      Level 1 일반 문의·상담 (GENERAL)   — 정보 문의 + 개별 학생 상담
--      Level 2 불만·민원 (COMPLAINT)
--      Level 3 관리자 검토 필요 (ADMIN_REVIEW) — 관리자 검토 사안, 안전 관련 고위험 후보,
--                                              이미 답변받은 같은 사안을 새 사실 없이 다시 전달한 반복 문의
-- 2) 교장·교감이 공유받은 문의에 담임·학년부장 앞으로 메모를 남길 수 있다 (add_case_note).
--    학년부장 앞 메모는 아직 학년부장과 공유되지 않은 문의라면 학년부장에게도 공유한다.
-- 3) 학교 통계를 학교 전체 + 학년별로 돌려준다.
--
-- 0006 다음에 실행한다. Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 실행. 여러 번 실행해도 된다.
-- =====================================================================

-- ---------- 1) 위험도 3단계 ----------
alter table public.risk_assessments drop constraint if exists risk_assessments_level_check;
alter table public.risk_assessments drop constraint if exists risk_assessments_llm_level_check;
alter table public.risk_assessments drop constraint if exists risk_assessments_category_check;

update public.risk_assessments set category = 'GENERAL' where category in ('INFO', 'STUDENT');
update public.risk_assessments set level = 1 where level < 1;
update public.risk_assessments set llm_level = 1 where llm_level < 1;
-- 고위험 후보는 항상 Level 3
update public.risk_assessments set level = 3, category = 'ADMIN_REVIEW' where high_risk and level < 3;

alter table public.risk_assessments add constraint risk_assessments_level_check check (level between 1 and 3);
alter table public.risk_assessments add constraint risk_assessments_llm_level_check check (llm_level between 1 and 3);
alter table public.risk_assessments add constraint risk_assessments_category_check
  check (category in ('GENERAL', 'COMPLAINT', 'ADMIN_REVIEW'));

-- ---------- 2) 교장·교감 메모 ----------
-- 공유 메모의 받는 사람에 담임(TEACHER)을 더한다.
alter table public.case_share_notes drop constraint if exists case_share_notes_target_check;
alter table public.case_share_notes add constraint case_share_notes_target_check
  check (target in ('TEACHER', 'MANAGER', 'ADMIN'));

-- [메모 남기기] 교장·교감(공유받은 사람)만. p_target: 'TEACHER' 담임 / 'MANAGER' 학년부장
create or replace function public.add_case_note(p_case_id uuid, p_target text, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_case public.cases;
  v_note text := btrim(coalesce(p_note, ''));
  v_name text;
  v_grade int;
  v_added int;
begin
  if p_target is null or p_target not in ('TEACHER', 'MANAGER') then
    raise exception '메모 받을 사람이 올바르지 않습니다';
  end if;
  if char_length(v_note) = 0 then
    raise exception '메모 내용을 입력해 주세요';
  end if;
  if char_length(v_note) > 1000 then
    raise exception '메모는 1000자까지 쓸 수 있습니다';
  end if;

  select * into v_case from public.cases where id = p_case_id for update;
  if v_case.id is null
     or public.my_role() is distinct from 'ADMIN'
     or not public.is_escalated_to_me(p_case_id) then
    raise exception '메모 권한이 없습니다';
  end if;

  -- 학년부장 앞 메모인데 아직 학년부장과 공유되지 않았으면 그 학년 학년부장에게 공유한다
  if p_target = 'MANAGER' and v_case.shared_manager_at is null then
    select cl.grade into v_grade
    from public.students s join public.classes cl on cl.id = s.class_id
    where s.id = v_case.student_id;

    insert into public.assignments (case_id, assignee_id, kind)
    select p_case_id, p.id, 'ESCALATION'
    from public.profiles p
    join public.manager_grades mg on mg.manager_id = p.id
    where p.school_id = v_case.school_id and p.role = 'MANAGER' and mg.grade = v_grade
    on conflict (case_id, assignee_id) do nothing;
    get diagnostics v_added = row_count;
    if v_added = 0 then
      raise exception '이 학년의 학년부장 계정이 없어 메모를 남길 수 없습니다';
    end if;

    update public.cases set shared_manager_at = now() where id = p_case_id;
    insert into public.audit_logs (actor_id, action, target_table, target_id)
    values (auth.uid(), 'ESCALATE_CASE_MANAGER', 'cases', p_case_id);
  end if;

  select display_name into v_name from public.profiles where id = auth.uid();
  insert into public.case_share_notes (case_id, author_id, author_name, target, note)
  values (p_case_id, auth.uid(), coalesce(v_name, '교장·교감 선생님'), p_target, v_note);

  insert into public.audit_logs (actor_id, action, target_table, target_id)
  values (auth.uid(), 'NOTE_CASE_' || p_target, 'cases', p_case_id);
end;
$$;

revoke execute on function public.add_case_note(uuid, text, text) from public, anon;
grant execute on function public.add_case_note(uuid, text, text) to authenticated;

-- ---------- 3) 학교 전체 + 학년별 통계 (교장·교감만, 건수만) ----------
create or replace function public.school_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_school uuid := public.my_school_id();
  v jsonb;
begin
  if public.my_role() is distinct from 'ADMIN' then
    raise exception '교장·교감 선생님만 볼 수 있습니다';
  end if;

  with conv as (
    -- 학부모가 한마디라도 한 상담만 센다. 학년은 상담한 자녀의 학급 기준 (자녀를 고르지 않은 상담은 학년 없음)
    select c.id, c.status, cl.grade
    from public.conversations c
    left join public.students s on s.id = c.student_id
    left join public.classes cl on cl.id = s.class_id
    where c.school_id = v_school
      and exists (select 1 from public.messages m where m.conversation_id = c.id and m.role = 'parent')
  ),
  cs as (
    select c.id, c.status, c.escalated_at, cl.grade, r.level, r.high_risk, r.repeat_of, r.case_id as classified
    from public.cases c
    join public.students s on s.id = c.student_id
    join public.classes cl on cl.id = s.class_id
    left join public.risk_assessments r on r.case_id = c.id
    where c.school_id = v_school
  ),
  grades as (
    select distinct grade from public.classes where school_id = v_school
  ),
  stat as (
    -- grade = null 은 학교 전체
    select g.grade,
      jsonb_build_object(
        'grade', g.grade,
        'consultations', (select count(*) from conv where g.grade is null or conv.grade = g.grade),
        'closedByAi', (select count(*) from conv where (g.grade is null or conv.grade = g.grade) and status = 'CLOSED_AI'),
        'inProgress', (select count(*) from conv where (g.grade is null or conv.grade = g.grade)
                         and status in ('ACTIVE', 'WAITING_FOR_PARENT', 'SUMMARY_READY', 'CONSENT_PENDING')),
        'sentToSchool', (select count(*) from cs where g.grade is null or cs.grade = g.grade),
        'shared', (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and escalated_at is not null),
        'replied', (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and status in ('RESOLVED', 'CLOSED')),
        'level1', (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and level = 1),
        'level2', (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and level = 2),
        'level3', (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and level = 3),
        'highRisk', (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and high_risk),
        'repeats', (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and repeat_of is not null),
        'unclassified', (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and classified is null)
      ) as j
    from (select null::int as grade union all select grade from grades) g
  )
  select jsonb_build_object(
    'all', (select j from stat where grade is null),
    'grades', coalesce((select jsonb_agg(j order by grade) from stat where grade is not null), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

revoke execute on function public.school_stats() from public, anon;
grant execute on function public.school_stats() to authenticated;
