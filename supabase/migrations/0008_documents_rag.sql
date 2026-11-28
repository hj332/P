-- =====================================================================
-- 온담 AI — 0008: 학교 자료 근거 답변 (v2 C 단계, 기획안 11-3·13장)
--
-- 학교 자료(documents)를 조각(document_chunks)으로 나누고 임베딩(pgvector, 768차원)을 저장한다.
-- 학부모 상담 AI 는 질문과 비슷한 조각만 받아 근거 있는 답을 하고, 화면에 "근거 · 문서명 · 원문 보기" 를 보여 준다.
--
-- 누가 무엇을 (사용자 결정 2026-11-25, 기획안 13장)
--   - 교장·교감(ADMIN): 학교 자료(SCHOOL), 교육·법률 자료(LEGAL, 검증된 공식 자료만) 등록·삭제
--   - 담임(TEACHER): 자기 반 학급 자료(CLASS) 등록·삭제
--   - 학부모: 우리 학교 학교 자료·교육·법률 자료 + 자녀 반 학급 자료만 읽기
--   - 교사: 학교 자료·교육·법률 자료 + 맡은 반 학급 자료 / 학년부장: + 맡은 학년 학급 자료 / 교장·교감: 학교 전체
-- 문서 조각과 임베딩은 서버가 계산하지만, 쓰기는 로그인한 사람의 권한(RLS)으로 한다 (secret 키 안 씀).
-- 상담 AI 답변의 근거 목록은 messages.sources 에 저장한다 (AI 답변은 원래대로 서버가 secret 키로 저장).
--
-- 0007 다음에 실행한다. Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 실행. 여러 번 실행해도 된다.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  scope text not null check (scope in ('SCHOOL', 'CLASS', 'LEGAL')),
  class_id uuid references public.classes (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  source text not null default '' check (char_length(source) <= 150), -- 출처 (예: 가정통신문 제2026-31호)
  body text not null check (char_length(body) between 1 and 20000),
  is_sample boolean not null default false,                         -- 시연용 가상 자료 표시
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((scope = 'CLASS') = (class_id is not null))
);
create index if not exists documents_school_idx on public.documents (school_id, scope);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding extensions.vector(768) not null,
  unique (document_id, chunk_index)
);
create index if not exists document_chunks_embedding_idx
  on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- AI 답변이 근거로 쓴 자료 [{documentId, title, source}] — 서버가 AI 답변과 함께 저장
alter table public.messages add column if not exists sources jsonb;

-- ---------- 권한 확인용 함수 ----------

-- 이 문서를 읽을 수 있는가
create or replace function public.can_read_document(p_school uuid, p_scope text, p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_school = public.my_school_id() and (
    p_scope in ('SCHOOL', 'LEGAL')
    or public.my_role() = 'ADMIN'
    or public.teaches_class(p_class)
    or exists (select 1 from public.students s where s.class_id = p_class and public.is_parent_of(s.id))
    or exists (
      select 1 from public.classes cl
      join public.manager_grades mg on mg.grade = cl.grade and mg.manager_id = auth.uid()
      where cl.id = p_class
    )
  )
$$;

-- 이 문서를 등록·삭제할 수 있는가: 교장·교감은 학교·교육법률 자료, 담임은 자기 반 학급 자료
create or replace function public.can_manage_document(p_school uuid, p_scope text, p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_school = public.my_school_id() and (
    (p_scope in ('SCHOOL', 'LEGAL') and public.my_role() = 'ADMIN')
    or (p_scope = 'CLASS' and public.my_role() = 'TEACHER' and exists (
      select 1 from public.teacher_classes tc
      where tc.teacher_id = auth.uid() and tc.class_id = p_class and tc.is_homeroom
    ))
  )
$$;

alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (public.can_read_document(school_id, scope, class_id));

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (created_by = auth.uid() and public.can_manage_document(school_id, scope, class_id));

drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete to authenticated
  using (
    public.can_manage_document(school_id, scope, class_id)
    -- 교장·교감은 학급 자료도 지울 수 있다 (잘못 올린 자료 정리)
    or (public.my_role() = 'ADMIN' and school_id = public.my_school_id())
  );
-- 수정 정책은 없다: 고치려면 지우고 다시 등록한다 (조각·임베딩을 새로 만들어야 하므로)

drop policy if exists document_chunks_select on public.document_chunks;
create policy document_chunks_select on public.document_chunks for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_chunks.document_id));

drop policy if exists document_chunks_insert on public.document_chunks;
create policy document_chunks_insert on public.document_chunks for insert to authenticated
  with check (exists (
    select 1 from public.documents d
    where d.id = document_chunks.document_id and public.can_manage_document(d.school_id, d.scope, d.class_id)
  ));

-- ---------- 비슷한 조각 찾기 ----------
-- security invoker: 부르는 사람의 RLS 가 그대로 적용된다 → 학부모는 자기가 읽을 수 있는 자료에서만 찾는다.
-- p_class_id 를 주면 학급 자료는 그 반 것만 (자녀가 둘일 때 다른 반 자료가 섞이지 않게)
create or replace function public.match_document_chunks(
  p_query extensions.vector(768),
  p_class_id uuid default null,
  p_count int default 5
) returns table (
  chunk_id uuid, document_id uuid, title text, source text, scope text, is_sample boolean, content text, similarity float
)
language sql stable security invoker set search_path = public, extensions as $$
  select c.id, d.id, d.title, d.source, d.scope, d.is_sample, c.content,
         1 - (c.embedding <=> p_query) as similarity
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  where d.scope <> 'CLASS' or p_class_id is null or d.class_id = p_class_id
  order by c.embedding <=> p_query
  limit least(greatest(coalesce(p_count, 5), 1), 20)
$$;

revoke execute on function public.match_document_chunks(extensions.vector, uuid, int) from public, anon;
grant execute on function public.match_document_chunks(extensions.vector, uuid, int) to authenticated;
