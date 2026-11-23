-- =====================================================================
-- 온담 AI — 0005: 학년부장 → 교장·교감 공유 + 공유 메모
--
-- 0004 에서는 담임만 공유할 수 있었다. 이제
--   - 학년부장(MANAGER)이 자신에게 공유된 문의를 교장·교감(ADMIN)에게 다시 공유할 수 있다.
--   - 공유할 때 받는 사람에게 남기는 메모(선택, 1000자 이하)를 적을 수 있다. (담임·학년부장 모두)
-- 메모는 그 문의를 볼 수 있는 교직원(담임, 공유받은 학년부장·교장·교감)만 본다. 학부모에게는 보이지 않는다.
-- 답변은 계속 담임만 보낸다.
--
-- 0004 다음에 실행한다. Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 실행. 여러 번 실행해도 된다.
-- =====================================================================

-- 0004 전에 이미 열어 본 공유(관리자 열람)는 열람 시각이 비어 있다 → 열람 기록(audit_logs)에서 채운다
update public.assignments a
set viewed_at = l.first_view
from (
  select actor_id, target_id, min(created_at) as first_view
  from public.audit_logs where action = 'VIEW_CASE'
  group by actor_id, target_id
) l
where a.viewed_at is null and l.actor_id = a.assignee_id and l.target_id = a.case_id;

create table if not exists public.case_share_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  author_name text not null,          -- 쓸 때의 표시 이름 (예: 3학년 2반 담임, 3학년 부장 선생님)
  target text not null check (target in ('MANAGER', 'ADMIN')),
  note text not null check (char_length(note) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists case_share_notes_case_id_idx on public.case_share_notes (case_id, created_at);

alter table public.case_share_notes enable row level security;

-- 볼 수 있는 Case 의 메모만, 그리고 교직원만 (학부모는 자기 Case 를 볼 수 있지만 메모는 못 본다)
-- insert·update·delete 정책은 없다 → escalate_case() 로만 쓴다.
drop policy if exists case_share_notes_select on public.case_share_notes;
create policy case_share_notes_select on public.case_share_notes for select to authenticated
  using (
    public.my_role() in ('TEACHER', 'MANAGER', 'ADMIN')
    and exists (select 1 from public.cases c where c.id = case_share_notes.case_id)
  );

-- ---------- [공유] 담임: 학년부장·교장교감 / 학년부장: 교장교감 ----------
drop function if exists public.escalate_case(uuid);
drop function if exists public.escalate_case(uuid, text);
create or replace function public.escalate_case(p_case_id uuid, p_target text, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_case public.cases;
  v_grade int;
  v_added int;
  v_note text := btrim(coalesce(p_note, ''));
  v_name text;
begin
  if p_target is null or p_target not in ('MANAGER', 'ADMIN') then
    raise exception '공유 대상이 올바르지 않습니다';
  end if;

  select * into v_case from public.cases where id = p_case_id for update;
  if v_case.id is null then
    raise exception '공유 권한이 없습니다';
  end if;

  if public.is_assigned_to(p_case_id) and public.teaches_student(v_case.student_id) then
    null;  -- 담임: 두 대상 모두 가능
  elsif public.is_escalated_to_me(p_case_id) and public.my_role() = 'MANAGER' then
    if p_target <> 'ADMIN' then
      raise exception '학년부장은 교장·교감 선생님께만 공유할 수 있습니다';
    end if;
  else
    raise exception '공유 권한이 없습니다';
  end if;

  if v_case.status not in ('NEW', 'TEACHER_REVIEWING', 'ESCALATED', 'ADMIN_REVIEWING') then
    raise exception '이미 답변한 문의입니다';
  end if;
  if (p_target = 'MANAGER' and v_case.shared_manager_at is not null)
     or (p_target = 'ADMIN' and v_case.shared_admin_at is not null) then
    raise exception '이미 공유한 문의입니다';
  end if;
  if char_length(v_note) > 1000 then
    raise exception '메모는 1000자까지 쓸 수 있습니다';
  end if;

  if p_target = 'MANAGER' then
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
      raise exception '이 학년의 학년부장 계정이 없어 공유할 수 없습니다';
    end if;
  else
    insert into public.assignments (case_id, assignee_id, kind)
    select p_case_id, p.id, 'ESCALATION'
    from public.profiles p
    where p.school_id = v_case.school_id and p.role = 'ADMIN'
    on conflict (case_id, assignee_id) do nothing;
    get diagnostics v_added = row_count;
    if v_added = 0 then
      raise exception '학교 관리자 계정이 없어 공유할 수 없습니다';
    end if;
  end if;

  if char_length(v_note) > 0 then
    select display_name into v_name from public.profiles where id = auth.uid();
    insert into public.case_share_notes (case_id, author_id, author_name, target, note)
    values (p_case_id, auth.uid(), coalesce(v_name, '선생님'), p_target, v_note);
  end if;

  -- 새로 받은 사람이 아직 안 열었으므로 "공유됨"으로 둔다 (받은 사람별 열람은 assignments.viewed_at)
  update public.cases
  set status = 'ESCALATED',
      escalated_at = coalesce(escalated_at, now()),
      shared_manager_at = case when p_target = 'MANAGER' then now() else shared_manager_at end,
      shared_admin_at = case when p_target = 'ADMIN' then now() else shared_admin_at end
  where id = p_case_id;

  insert into public.audit_logs (actor_id, action, target_table, target_id)
  values (auth.uid(), 'ESCALATE_CASE_' || p_target, 'cases', p_case_id);
end;
$$;

revoke execute on function public.escalate_case(uuid, text, text) from public, anon;
grant execute on function public.escalate_case(uuid, text, text) to authenticated;
