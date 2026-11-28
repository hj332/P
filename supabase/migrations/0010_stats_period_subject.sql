-- v2 D: 통계 고도화 (2026-11-28) — 여러 번 실행해도 된다.
-- 1) risk_assessments.subject : 문의 주제 분야 (분류 AI 가 함께 정함, 통계용)
--      PEER 교우관계 / GUIDANCE 생활지도·훈육 / LEARNING 학습·숙제·평가 / SAFETY 안전·건강 / SCHOOL_LIFE 학교 행사·행정 / OTHER 기타
-- 2) school_stats(p_from, p_to) : 기간을 정해서 센다 (null 이면 전체 기간). 상담은 시작 시각, 문의는 전달 시각 기준.
--      주제 분야별 건수(subjects)를 함께 돌려준다.
--      학년별 숫자는 그대로 보여 준다 (반 단위 통계는 없으므로 작은 숫자도 가리지 않는다 — 2026-11-28 사용자 결정).
-- 여전히 교장·교감(ADMIN)만 부를 수 있고, 건수만 돌려준다.

alter table public.risk_assessments add column if not exists subject text;
alter table public.risk_assessments drop constraint if exists risk_assessments_subject_check;
alter table public.risk_assessments add constraint risk_assessments_subject_check
  check (subject is null or subject in ('PEER', 'GUIDANCE', 'LEARNING', 'SAFETY', 'SCHOOL_LIFE', 'OTHER'));

-- (처음 버전에 있던 학년별 1~2건 가림 함수는 쓰지 않는다)
drop function if exists public.stat_mask(bigint, int);

-- 예전 함수(인자 없음)를 지우고 기간 인자를 받는 함수로 바꾼다 (school_stats() 로 부르면 전체 기간)
drop function if exists public.school_stats();

create or replace function public.school_stats(p_from timestamptz default null, p_to timestamptz default null) returns jsonb
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
      and (p_from is null or c.created_at >= p_from)
      and (p_to is null or c.created_at < p_to)
      and exists (select 1 from public.messages m where m.conversation_id = c.id and m.role = 'parent')
  ),
  cs as (
    select c.id, c.status, c.escalated_at, cl.grade, r.level, r.high_risk, r.repeat_of, r.subject, r.case_id as classified
    from public.cases c
    join public.students s on s.id = c.student_id
    join public.classes cl on cl.id = s.class_id
    left join public.risk_assessments r on r.case_id = c.id
    where c.school_id = v_school
      and (p_from is null or c.created_at >= p_from)
      and (p_to is null or c.created_at < p_to)
  ),
  grades as (
    select distinct grade from public.classes where school_id = v_school
  ),
  raw as (
    -- grade = null 은 학교 전체
    select g.grade,
      (select count(*) from conv where g.grade is null or conv.grade = g.grade) as consultations,
      (select count(*) from conv where (g.grade is null or conv.grade = g.grade) and status = 'CLOSED_AI') as closed_by_ai,
      (select count(*) from conv where (g.grade is null or conv.grade = g.grade)
         and status in ('ACTIVE', 'WAITING_FOR_PARENT', 'SUMMARY_READY', 'CONSENT_PENDING')) as in_progress,
      (select count(*) from cs where g.grade is null or cs.grade = g.grade) as sent,
      (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and escalated_at is not null) as shared,
      (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and status in ('RESOLVED', 'CLOSED')) as replied,
      (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and level = 1) as l1,
      (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and level = 2) as l2,
      (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and level = 3) as l3,
      (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and high_risk) as high_risk,
      (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and repeat_of is not null) as repeats,
      (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and classified is null) as unclassified,
      (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and subject = 'PEER') as s_peer,
      (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and subject = 'GUIDANCE') as s_guidance,
      (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and subject = 'LEARNING') as s_learning,
      (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and subject = 'SAFETY') as s_safety,
      (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and subject = 'SCHOOL_LIFE') as s_school_life,
      (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and subject = 'OTHER') as s_other,
      (select count(*) from cs where (g.grade is null or cs.grade = g.grade) and subject is null) as s_none
    from (select null::int as grade union all select grade from grades) g
  ),
  stat as (
    select grade,
      jsonb_build_object(
        'grade', grade,
        'consultations', consultations, 'closedByAi', closed_by_ai, 'inProgress', in_progress,
        'sentToSchool', sent, 'shared', shared, 'replied', replied,
        'level1', l1, 'level2', l2, 'level3', l3,
        'highRisk', high_risk, 'repeats', repeats, 'unclassified', unclassified,
        'subjects', jsonb_build_object(
          'PEER', s_peer, 'GUIDANCE', s_guidance, 'LEARNING', s_learning,
          'SAFETY', s_safety, 'SCHOOL_LIFE', s_school_life, 'OTHER', s_other,
          'NONE', s_none)
      ) as j
    from raw
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'all', (select j from stat where grade is null),
    'grades', coalesce((select jsonb_agg(j order by grade) from stat where grade is not null), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

revoke execute on function public.school_stats(timestamptz, timestamptz) from public, anon;
grant execute on function public.school_stats(timestamptz, timestamptz) to authenticated;
