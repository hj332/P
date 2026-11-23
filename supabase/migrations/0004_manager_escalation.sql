-- =====================================================================
-- 온담 AI — 0004: 학년부장 선생님 + 공유 대상 선택 (v2 A 단계 보완)
--
-- 0003 에서는 [관리자와 공유] 하면 교장·교감(ADMIN)에게만 갔다. 이제 교사가 대상을 고른다.
--   [학년부장 선생님께]  → 그 학생 학년을 맡은 학년부장(MANAGER, manager_grades)에게 배정
--   [교장·교감 선생님께] → 같은 학교 ADMIN 에게 배정
-- 답변하기 전이면 둘 다(따로따로, 각각 한 번) 공유할 수 있다. 답변은 계속 담임이 보낸다.
-- "확인 전/확인 중"은 받은 사람마다 따로 기록한다 (assignments.viewed_at).
--
-- 0003 다음에 실행한다. Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 실행. 여러 번 실행해도 된다.
-- =====================================================================

-- ---------- 학년부장이 맡은 학년 ----------
create table if not exists public.manager_grades (
  manager_id uuid not null references public.profiles (id) on delete cascade,
  grade int not null,
  primary key (manager_id, grade)
);
alter table public.manager_grades enable row level security;
drop policy if exists manager_grades_select on public.manager_grades;
create policy manager_grades_select on public.manager_grades for select to authenticated
  using (manager_id = auth.uid());

-- ---------- 누구와 언제 공유했는지 / 받은 사람이 언제 열었는지 ----------
alter table public.cases add column if not exists shared_manager_at timestamptz; -- 학년부장과 공유한 때
alter table public.cases add column if not exists shared_admin_at timestamptz;   -- 교장·교감과 공유한 때
-- (escalated_at 은 처음 공유한 때로 그대로 쓴다)
update public.cases set shared_admin_at = escalated_at
where escalated_at is not null and shared_admin_at is null and shared_manager_at is null;

alter table public.assignments add column if not exists viewed_at timestamptz;   -- 배정받은 사람이 처음 연 때
-- 학부모·교사가 assignments 를 고칠 수는 없다 (0001: insert/update 정책 없음)

-- ---------- 권한 확인용 함수: 관리자(ADMIN) + 학년부장(MANAGER) ----------
create or replace function public.is_escalated_to_me(p_case_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.assignments a
    join public.profiles p on p.id = a.assignee_id
    where a.case_id = p_case_id
      and a.assignee_id = auth.uid()
      and a.kind = 'ESCALATION'
      and p.role in ('ADMIN', 'MANAGER')
  )
$$;

create or replace function public.has_escalated_case_of(p_student_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.cases c
    join public.assignments a on a.case_id = c.id
    join public.profiles p on p.id = a.assignee_id
    where c.student_id = p_student_id
      and a.assignee_id = auth.uid()
      and a.kind = 'ESCALATION'
      and p.role in ('ADMIN', 'MANAGER')
  )
$$;

-- ---------- 열람: 받은 사람마다 열람 시각을 남긴다 ----------
create or replace function public.open_case(p_case_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid;
begin
  select student_id into v_student from public.cases where id = p_case_id;
  if v_student is null then
    raise exception '열람 권한이 없습니다';
  end if;

  if public.is_assigned_to(p_case_id) and public.teaches_student(v_student) then
    update public.cases
    set status = case when status = 'NEW' then 'TEACHER_REVIEWING'::public.case_status else status end,
        teacher_viewed_at = coalesce(teacher_viewed_at, now())
    where id = p_case_id;

  elsif public.is_escalated_to_me(p_case_id) then
    update public.cases set status = 'ADMIN_REVIEWING'
    where id = p_case_id and status = 'ESCALATED';

  else
    raise exception '열람 권한이 없습니다';
  end if;

  update public.assignments set viewed_at = coalesce(viewed_at, now())
  where case_id = p_case_id and assignee_id = auth.uid();

  insert into public.audit_logs (actor_id, action, target_table, target_id)
  values (auth.uid(), 'VIEW_CASE', 'cases', p_case_id);
end;
$$;

-- ---------- [관리자와 공유] 대상 선택 ----------
-- p_target: 'MANAGER' = 학년부장 선생님, 'ADMIN' = 교장·교감 선생님
drop function if exists public.escalate_case(uuid);
create or replace function public.escalate_case(p_case_id uuid, p_target text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_case public.cases;
  v_grade int;
  v_added int;
begin
  if p_target is null or p_target not in ('MANAGER', 'ADMIN') then
    raise exception '공유 대상이 올바르지 않습니다';
  end if;

  select * into v_case from public.cases where id = p_case_id for update;

  if v_case.id is null
     or not public.is_assigned_to(p_case_id)
     or not public.teaches_student(v_case.student_id) then
    raise exception '공유 권한이 없습니다';
  end if;
  if v_case.status not in ('NEW', 'TEACHER_REVIEWING', 'ESCALATED', 'ADMIN_REVIEWING') then
    raise exception '이미 답변한 문의입니다';
  end if;
  if (p_target = 'MANAGER' and v_case.shared_manager_at is not null)
     or (p_target = 'ADMIN' and v_case.shared_admin_at is not null) then
    raise exception '이미 공유한 문의입니다';
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

  -- 새로 받은 사람이 아직 안 열었으므로, 누가 먼저 열어 "확인 중"이었어도 다시 "공유됨"으로 둔다
  update public.cases
  set status = 'ESCALATED',
      escalated_at = coalesce(escalated_at, now()),
      shared_manager_at = case when p_target = 'MANAGER' then now() else shared_manager_at end,
      shared_admin_at = case when p_target = 'ADMIN' then now() else shared_admin_at end,
      teacher_viewed_at = coalesce(teacher_viewed_at, now())
  where id = p_case_id;

  insert into public.audit_logs (actor_id, action, target_table, target_id)
  values (auth.uid(), 'ESCALATE_CASE_' || p_target, 'cases', p_case_id);
end;
$$;

revoke execute on function public.escalate_case(uuid, text), public.open_case(uuid) from public, anon;
grant execute on function public.escalate_case(uuid, text), public.open_case(uuid) to authenticated;
