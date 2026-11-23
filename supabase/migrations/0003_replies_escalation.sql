-- =====================================================================
-- 온담 AI — 0003: 선생님 답변 → 학부모 확인, 관리자 이관 (v2 A 단계)
--
-- 흐름
--   교사가 Case 를 연다(open_case)         → TEACHER_REVIEWING
--   교사가 [관리자와 공유](escalate_case)   → ESCALATED, 같은 학교 ADMIN 에게 배정
--   관리자가 Case 를 연다(open_case)        → ADMIN_REVIEWING
--   교사가 답변을 보낸다(reply_to_case)     → RESOLVED  (이관된 문의도 담임이 답변한다)
--   학부모가 [답변 잘 받았어요](confirm_case_reply) → CLOSED
--
-- 원칙 (MVP 와 같음)
--   - 상태 변경과 답변 저장은 아래 security definer 함수로만 한다. 표에 직접 쓰는 권한은 없다.
--   - 학부모는 본인 Case 의 답변만, 교사는 배정 + 담당 학급 Case 만, 관리자(ADMIN)는 이관된 Case 만 본다.
--   - 관리자도 상담 원문(conversations/messages)은 볼 수 없다.
--
-- Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 실행한다. 여러 번 실행해도 된다.
-- =====================================================================

-- ---------- 배정의 종류: 담임 자동 배정 / 관리자 이관 ----------
alter table public.assignments
  add column if not exists kind text not null default 'HOMEROOM';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assignments_kind_check') then
    alter table public.assignments
      add constraint assignments_kind_check check (kind in ('HOMEROOM', 'ESCALATION'));
  end if;
end;
$$;

-- ---------- Case 의 진행 시각 (학부모 화면의 진행 상황 표시용) ----------
alter table public.cases add column if not exists teacher_viewed_at timestamptz;   -- 담임이 처음 연 때
alter table public.cases add column if not exists escalated_at timestamptz;        -- 관리자와 공유한 때
alter table public.cases add column if not exists parent_confirmed_at timestamptz; -- 학부모가 답변을 확인한 때

-- ---------- 선생님 답변 ----------
-- author_name: 답변할 때의 교사 표시 이름을 저장해 둔다.
--   (학부모에게 교사 프로필 표 전체를 열어 주지 않기 위해)
create table if not exists public.case_replies (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  author_name text not null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists case_replies_case_id_idx on public.case_replies (case_id, created_at);

alter table public.case_replies enable row level security;

-- 볼 수 있는 Case 의 답변만 보인다. (cases 의 RLS 가 그대로 적용된다:
--  학부모 본인 / 배정된 담임 + 담당 학급 / 이관받은 관리자)
-- insert·update·delete 정책은 없다 → reply_to_case() 로만 쓴다.
drop policy if exists case_replies_select on public.case_replies;
create policy case_replies_select on public.case_replies for select to authenticated
  using (exists (select 1 from public.cases c where c.id = case_replies.case_id));

-- ---------- 권한 확인용 함수 ----------

-- 이 Case 가 나(관리자)에게 이관됐는가
create or replace function public.is_escalated_to_me(p_case_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.assignments a
    join public.profiles p on p.id = a.assignee_id
    where a.case_id = p_case_id
      and a.assignee_id = auth.uid()
      and a.kind = 'ESCALATION'
      and p.role = 'ADMIN'
  )
$$;

-- 이 학생의 Case 중 나(관리자)에게 이관된 것이 있는가 (학생 이름·학급 표시용)
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
      and p.role = 'ADMIN'
  )
$$;

-- ---------- 정책 갱신 ----------

-- Case: 학부모 본인 / 배정받은 담임(담당 학급 학생) / 이관받은 관리자
drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases for select to authenticated
  using (
    parent_id = auth.uid()
    or (public.is_assigned_to(id) and public.teaches_student(student_id))
    or public.is_escalated_to_me(id)
  );

-- 학생: 내 자녀 / 내가 맡은 학급 학생 / 나에게 이관된 Case 의 학생
drop policy if exists students_select on public.students;
create policy students_select on public.students for select to authenticated
  using (
    public.is_parent_of(id)
    or public.teaches_class(class_id)
    or public.has_escalated_case_of(id)
  );

-- 학급: 내가 맡은 학급 / 내 자녀의 학급 / 나에게 이관된 Case 학생의 학급
drop policy if exists classes_select on public.classes;
create policy classes_select on public.classes for select to authenticated
  using (
    public.teaches_class(id)
    or exists (
      select 1 from public.students s
      where s.class_id = classes.id
        and (public.is_parent_of(s.id) or public.has_escalated_case_of(s.id))
    )
  );
-- (프로필: 0001 정책 그대로. "나에게 배정된 Case 의 학부모" 이므로 이관받은 관리자도 학부모 이름은 본다)

-- ---------- 상태 변경 함수 ----------

-- 교사·관리자가 Case 를 열어볼 때: 열람 기록을 남기고 상태를 바꾼다.
--   담임: NEW → TEACHER_REVIEWING, 처음 연 시각 기록
--   관리자(이관받은 사람): ESCALATED → ADMIN_REVIEWING
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
    insert into public.audit_logs (actor_id, action, target_table, target_id)
    values (auth.uid(), 'VIEW_CASE', 'cases', p_case_id);

    update public.cases
    set status = case when status = 'NEW' then 'TEACHER_REVIEWING'::public.case_status else status end,
        teacher_viewed_at = coalesce(teacher_viewed_at, now())
    where id = p_case_id;

  elsif public.is_escalated_to_me(p_case_id) then
    insert into public.audit_logs (actor_id, action, target_table, target_id)
    values (auth.uid(), 'VIEW_CASE', 'cases', p_case_id);

    update public.cases set status = 'ADMIN_REVIEWING'
    where id = p_case_id and status = 'ESCALATED';

  else
    raise exception '열람 권한이 없습니다';
  end if;
end;
$$;

-- [답변 보내기] 배정받은 담임만. 아직 답변하지 않은 문의에만 한 번 보낼 수 있다.
create or replace function public.reply_to_case(p_case_id uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_case public.cases;
  v_body text := btrim(coalesce(p_body, ''));
  v_name text;
  v_reply_id uuid;
begin
  select * into v_case from public.cases where id = p_case_id for update;

  if v_case.id is null
     or not public.is_assigned_to(p_case_id)
     or not public.teaches_student(v_case.student_id) then
    raise exception '답변 권한이 없습니다';
  end if;
  if v_case.status not in ('NEW', 'TEACHER_REVIEWING', 'ESCALATED', 'ADMIN_REVIEWING') then
    raise exception '이미 답변한 문의입니다';
  end if;
  if char_length(v_body) = 0 then
    raise exception '답변 내용을 입력해 주세요';
  end if;
  if char_length(v_body) > 4000 then
    raise exception '답변은 4000자까지 쓸 수 있습니다';
  end if;

  select display_name into v_name from public.profiles where id = auth.uid();

  insert into public.case_replies (case_id, author_id, author_name, body)
  values (p_case_id, auth.uid(), coalesce(v_name, '담임 선생님'), v_body)
  returning id into v_reply_id;

  update public.cases
  set status = 'RESOLVED', teacher_viewed_at = coalesce(teacher_viewed_at, now())
  where id = p_case_id;

  insert into public.audit_logs (actor_id, action, target_table, target_id)
  values (auth.uid(), 'REPLY_CASE', 'cases', p_case_id);

  return v_reply_id;
end;
$$;

-- [관리자와 공유] 배정받은 담임만. 같은 학교의 관리자(ADMIN) 전원에게 배정한다.
create or replace function public.escalate_case(p_case_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_case public.cases;
  v_added int;
begin
  select * into v_case from public.cases where id = p_case_id for update;

  if v_case.id is null
     or not public.is_assigned_to(p_case_id)
     or not public.teaches_student(v_case.student_id) then
    raise exception '공유 권한이 없습니다';
  end if;
  if v_case.status not in ('NEW', 'TEACHER_REVIEWING') then
    raise exception '이미 공유했거나 답변한 문의입니다';
  end if;

  insert into public.assignments (case_id, assignee_id, kind)
  select p_case_id, p.id, 'ESCALATION'
  from public.profiles p
  where p.school_id = v_case.school_id and p.role = 'ADMIN'
  on conflict (case_id, assignee_id) do nothing;
  get diagnostics v_added = row_count;

  if v_added = 0 then
    raise exception '학교 관리자 계정이 없어 공유할 수 없습니다';
  end if;

  update public.cases
  set status = 'ESCALATED', escalated_at = now(), teacher_viewed_at = coalesce(teacher_viewed_at, now())
  where id = p_case_id;

  insert into public.audit_logs (actor_id, action, target_table, target_id)
  values (auth.uid(), 'ESCALATE_CASE', 'cases', p_case_id);
end;
$$;

-- [답변 잘 받았어요] 학부모 본인만, 답변이 도착한 뒤에만.
create or replace function public.confirm_case_reply(p_case_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_case public.cases;
begin
  select * into v_case from public.cases
  where id = p_case_id and parent_id = auth.uid()
  for update;

  if v_case.id is null then
    raise exception '문의를 찾을 수 없습니다';
  end if;
  if v_case.status <> 'RESOLVED' then
    raise exception '선생님 답변이 도착한 뒤에 확인할 수 있습니다 (현재: %)', v_case.status;
  end if;

  update public.cases
  set status = 'CLOSED', parent_confirmed_at = now()
  where id = p_case_id;

  insert into public.audit_logs (actor_id, action, target_table, target_id)
  values (auth.uid(), 'CONFIRM_REPLY', 'cases', p_case_id);
end;
$$;

-- 함수는 로그인한 사용자만 호출할 수 있게 한다.
revoke execute on function
  public.open_case(uuid),
  public.reply_to_case(uuid, text),
  public.escalate_case(uuid),
  public.confirm_case_reply(uuid)
from public, anon;
grant execute on function
  public.open_case(uuid),
  public.reply_to_case(uuid, text),
  public.escalate_case(uuid),
  public.confirm_case_reply(uuid)
to authenticated;
