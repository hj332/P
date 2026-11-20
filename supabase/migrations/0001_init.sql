-- =====================================================================
-- 온담 AI MVP — 초기 스키마 + RLS
-- Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 실행한다.
--
-- 핵심 원칙 (기획안 2장, 11-2, 11-6, 15장)
--  1. 상담 ≠ 민원 접수: 상담(conversations)은 학부모 본인만 볼 수 있다.
--     교사는 학부모가 동의해서 만들어진 cases 만 볼 수 있다.
--  2. Case 는 학부모가 동의했을 때만, consent_and_create_case() 함수로만 생긴다.
--  3. 권한은 화면이 아니라 DB(RLS)에서 막는다.
-- =====================================================================

-- ---------- 열거형 ----------
create type public.user_role as enum ('PARENT', 'TEACHER', 'MANAGER', 'ADMIN');

create type public.conversation_status as enum (
  'ACTIVE',              -- AI 상담 진행 중
  'WAITING_FOR_PARENT',  -- 학부모 추가 답변 대기
  'SUMMARY_READY',       -- AI 가 상담 내용 정리 완료
  'CONSENT_PENDING',     -- 학부모가 요약 확인/수정, 전달 여부 결정 중
  'CLOSED_AI',           -- 상담만 하고 종료 (학교에 전달 안 됨)
  'CONSENTED',           -- 전달 동의
  'CASE_CREATED'         -- Case 생성, 교사 업무함 등록
);

create type public.case_status as enum (
  'NEW', 'TEACHER_REVIEWING', 'RESOLVED', 'ESCALATED', 'ADMIN_REVIEWING', 'CLOSED'
);

create type public.message_role as enum ('parent', 'assistant');
create type public.consent_decision as enum ('CONSENTED', 'DECLINED');

-- ---------- 테이블 ----------
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- 기획안의 User. Supabase 로그인 계정(auth.users)과 1:1.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  school_id uuid not null references public.schools (id),
  role public.user_role not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- StudentRelation / TeacherClass 를 표현하려면 학급과 학생이 필요해서 추가한 테이블.
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  grade int not null,
  class_no int not null,
  unique (school_id, grade, class_no)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  class_id uuid not null references public.classes (id),
  name text not null
);

create table public.student_relations (
  parent_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  primary key (parent_id, student_id)
);

create table public.teacher_classes (
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  is_homeroom boolean not null default true,
  primary key (teacher_id, class_id)
);

-- 하나의 AI 상담 세션. 학부모 본인만 볼 수 있다.
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  parent_id uuid not null references public.profiles (id),
  student_id uuid references public.students (id),
  status public.conversation_status not null default 'ACTIVE',
  -- AI 가 만든 요약 초안 / 학부모가 수정 중인 요약 (학부모만 볼 수 있음)
  summary_draft jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role public.message_role not null,
  content text not null,
  created_at timestamptz not null default now()
);

-- 실제로 학교에 전달된 사안. 원문 대화가 아니라 학부모가 확인한 요약만 담는다.
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  conversation_id uuid not null unique references public.conversations (id),
  parent_id uuid not null references public.profiles (id),
  student_id uuid not null references public.students (id),
  -- { topic, facts, parent_concerns, requests, ai_guidance }
  final_summary jsonb not null,
  status public.case_status not null default 'NEW',
  created_at timestamptz not null default now()
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  assignee_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (case_id, assignee_id)
);

create table public.consent_logs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id),
  parent_id uuid not null references public.profiles (id),
  decision public.consent_decision not null,
  summary_snapshot jsonb,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles (id),
  action text not null,
  target_table text not null,
  target_id uuid not null,
  created_at timestamptz not null default now()
);

create index on public.conversations (parent_id);
create index on public.messages (conversation_id, created_at);
create index on public.assignments (assignee_id);
create index on public.students (class_id);

-- ---------- 권한 확인용 함수 ----------
-- security definer: RLS 정책끼리 서로를 참조해 무한 반복되는 것을 막기 위해
-- 관계 확인은 이 함수들에서 한다. 모두 auth.uid() (현재 로그인 사용자) 기준.

create function public.my_school_id() returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from public.profiles where id = auth.uid()
$$;

create function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create function public.is_parent_of(p_student_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.student_relations
    where parent_id = auth.uid() and student_id = p_student_id
  )
$$;

create function public.teaches_class(p_class_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.teacher_classes
    where teacher_id = auth.uid() and class_id = p_class_id
  )
$$;

create function public.teaches_student(p_student_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.students s
    join public.teacher_classes tc on tc.class_id = s.class_id
    where s.id = p_student_id and tc.teacher_id = auth.uid()
  )
$$;

create function public.is_assigned_to(p_case_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assignments
    where case_id = p_case_id and assignee_id = auth.uid()
  )
$$;

create function public.owns_conversation(p_conversation_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversations
    where id = p_conversation_id and parent_id = auth.uid()
  )
$$;

-- ---------- RLS 켜기 ----------
alter table public.schools           enable row level security;
alter table public.profiles          enable row level security;
alter table public.classes           enable row level security;
alter table public.students          enable row level security;
alter table public.student_relations enable row level security;
alter table public.teacher_classes   enable row level security;
alter table public.conversations     enable row level security;
alter table public.messages          enable row level security;
alter table public.cases             enable row level security;
alter table public.assignments       enable row level security;
alter table public.consent_logs      enable row level security;
alter table public.audit_logs        enable row level security;

-- ---------- 정책 ----------
-- 정책이 없는 동작(insert/update/delete)은 모두 막힌다.

-- 학교: 내 학교만
create policy schools_select on public.schools for select to authenticated
  using (id = public.my_school_id());

-- 프로필: 나 자신 + (교사) 나에게 배정된 Case 의 학부모
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.cases c
      where c.parent_id = profiles.id and public.is_assigned_to(c.id)
    )
  );

-- 학급: 내가 맡은 학급, 또는 내 자녀의 학급
create policy classes_select on public.classes for select to authenticated
  using (
    public.teaches_class(id)
    or exists (
      select 1 from public.students s
      where s.class_id = classes.id and public.is_parent_of(s.id)
    )
  );

-- 학생: 내 자녀, 또는 내가 맡은 학급 학생
create policy students_select on public.students for select to authenticated
  using (public.is_parent_of(id) or public.teaches_class(class_id));

create policy student_relations_select on public.student_relations for select to authenticated
  using (parent_id = auth.uid());

create policy teacher_classes_select on public.teacher_classes for select to authenticated
  using (teacher_id = auth.uid());

-- 상담: 학부모 본인만. 교사·관리자 정책은 일부러 만들지 않는다. (상담 ≠ 민원 접수)
create policy conversations_select on public.conversations for select to authenticated
  using (parent_id = auth.uid());

create policy conversations_insert on public.conversations for insert to authenticated
  with check (
    parent_id = auth.uid()
    and public.my_role() = 'PARENT'
    and school_id = public.my_school_id()
    and status = 'ACTIVE'
    and (student_id is null or public.is_parent_of(student_id))
  );

-- 학부모는 요약 초안만 직접 고칠 수 있다. 상태 변경은 아래 함수로만 한다.
create policy conversations_update on public.conversations for update to authenticated
  using (parent_id = auth.uid() and status not in ('CLOSED_AI', 'CONSENTED', 'CASE_CREATED'))
  with check (parent_id = auth.uid());
revoke update on public.conversations from authenticated, anon;
grant update (summary_draft, updated_at) on public.conversations to authenticated;

-- 메시지: 내 상담의 메시지만. 이미 끝난 상담에는 새 메시지를 넣을 수 없다.
create policy messages_select on public.messages for select to authenticated
  using (public.owns_conversation(conversation_id));

create policy messages_insert on public.messages for insert to authenticated
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.parent_id = auth.uid()
        and c.status in ('ACTIVE', 'WAITING_FOR_PARENT', 'SUMMARY_READY', 'CONSENT_PENDING')
    )
  );

-- Case: 학부모 본인, 또는 배정받은 담임(담당 학급 학생일 때만)
create policy cases_select on public.cases for select to authenticated
  using (
    parent_id = auth.uid()
    or (public.is_assigned_to(id) and public.teaches_student(student_id))
  );

create policy assignments_select on public.assignments for select to authenticated
  using (assignee_id = auth.uid());

create policy consent_logs_select on public.consent_logs for select to authenticated
  using (parent_id = auth.uid());

-- 감사 로그: 아무도 직접 읽거나 쓰지 않는다. 함수로만 기록한다.
-- (관리자 열람 화면은 MVP 이후)

-- ---------- 상태 변경 함수 ----------

-- 학부모가 상담 진행 중 상태를 바꿀 때. 종료/동의 상태로는 이 함수로 갈 수 없다.
create function public.set_conversation_status(
  p_conversation_id uuid,
  p_status public.conversation_status
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_current public.conversation_status;
begin
  if p_status not in ('ACTIVE', 'WAITING_FOR_PARENT', 'SUMMARY_READY', 'CONSENT_PENDING') then
    raise exception '이 상태로는 직접 바꿀 수 없습니다: %', p_status;
  end if;

  select status into v_current from public.conversations
  where id = p_conversation_id and parent_id = auth.uid()
  for update;

  if v_current is null then
    raise exception '상담을 찾을 수 없습니다';
  end if;
  if v_current in ('CLOSED_AI', 'CONSENTED', 'CASE_CREATED') then
    raise exception '이미 끝난 상담입니다';
  end if;

  update public.conversations
  set status = p_status, updated_at = now()
  where id = p_conversation_id;
end;
$$;

-- [아니요, 상담만 하고 마칠게요] → 교사에게 전달하지 않고 종료
create function public.decline_and_close(p_conversation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_conv public.conversations;
begin
  select * into v_conv from public.conversations
  where id = p_conversation_id and parent_id = auth.uid()
  for update;

  if v_conv.id is null then
    raise exception '상담을 찾을 수 없습니다';
  end if;
  if v_conv.status in ('CLOSED_AI', 'CONSENTED', 'CASE_CREATED') then
    raise exception '이미 끝난 상담입니다';
  end if;

  insert into public.consent_logs (conversation_id, parent_id, decision, summary_snapshot)
  values (v_conv.id, auth.uid(), 'DECLINED', null);

  update public.conversations
  set status = 'CLOSED_AI', updated_at = now()
  where id = v_conv.id;
end;
$$;

-- [네, 전달해 주세요] / [내용을 수정해서 전달할게요]
-- 학부모가 확인한 최종 요약으로 Case 를 만들고 담임에게 배정한다.
-- Case 를 만드는 유일한 방법이다.
create function public.consent_and_create_case(
  p_conversation_id uuid,
  p_final_summary jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_conv public.conversations;
  v_case_id uuid;
  v_class_id uuid;
  v_assigned int;
begin
  select * into v_conv from public.conversations
  where id = p_conversation_id and parent_id = auth.uid()
  for update;

  if v_conv.id is null then
    raise exception '상담을 찾을 수 없습니다';
  end if;
  if v_conv.status <> 'CONSENT_PENDING' then
    raise exception '요약을 확인하는 단계에서만 전달할 수 있습니다 (현재: %)', v_conv.status;
  end if;
  if v_conv.student_id is null or not public.is_parent_of(v_conv.student_id) then
    raise exception '전달할 자녀 정보가 없습니다';
  end if;
  if p_final_summary is null or jsonb_typeof(p_final_summary) <> 'object' then
    raise exception '요약 형식이 올바르지 않습니다';
  end if;

  insert into public.consent_logs (conversation_id, parent_id, decision, summary_snapshot)
  values (v_conv.id, auth.uid(), 'CONSENTED', p_final_summary);

  insert into public.cases (school_id, conversation_id, parent_id, student_id, final_summary)
  values (v_conv.school_id, v_conv.id, auth.uid(), v_conv.student_id, p_final_summary)
  returning id into v_case_id;

  select class_id into v_class_id from public.students where id = v_conv.student_id;

  insert into public.assignments (case_id, assignee_id)
  select v_case_id, tc.teacher_id
  from public.teacher_classes tc
  where tc.class_id = v_class_id and tc.is_homeroom;
  get diagnostics v_assigned = row_count;

  if v_assigned = 0 then
    raise exception '담임 선생님이 등록되어 있지 않아 전달할 수 없습니다';
  end if;

  update public.conversations
  set status = 'CASE_CREATED', summary_draft = p_final_summary, updated_at = now()
  where id = v_conv.id;

  return v_case_id;
end;
$$;

-- 교사가 Case 를 열어볼 때 호출: 열람 기록(AuditLog)을 남기고 확인 중 상태로 바꾼다.
create function public.open_case(p_case_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid;
begin
  select student_id into v_student from public.cases where id = p_case_id;

  if v_student is null
     or not public.is_assigned_to(p_case_id)
     or not public.teaches_student(v_student) then
    raise exception '열람 권한이 없습니다';
  end if;

  insert into public.audit_logs (actor_id, action, target_table, target_id)
  values (auth.uid(), 'VIEW_CASE', 'cases', p_case_id);

  update public.cases set status = 'TEACHER_REVIEWING'
  where id = p_case_id and status = 'NEW';
end;
$$;

-- 함수는 로그인한 사용자만 호출할 수 있게 한다.
revoke execute on function
  public.set_conversation_status(uuid, public.conversation_status),
  public.decline_and_close(uuid),
  public.consent_and_create_case(uuid, jsonb),
  public.open_case(uuid)
from public, anon;
grant execute on function
  public.set_conversation_status(uuid, public.conversation_status),
  public.decline_and_close(uuid),
  public.consent_and_create_case(uuid, jsonb),
  public.open_case(uuid)
to authenticated;
