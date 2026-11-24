-- =====================================================================
-- 온담 AI — 0006: 위험도 표시 + 반복 문의 표시 + 학교 익명 통계 (v2 B 단계)
--
-- 사용자 결정 (2026-11-24)
--   - 위험도는 학부모가 학교에 "전달한" 문의(Case)만 분류한다. 전달 안 된 상담은 분류하지 않는다.
--   - 분류는 "표시"만 한다. 알림·자동 배정·관리자 동시 확인 없음 (긴급 안전 프로토콜은 제외하기로 함).
--   - 반복 문의(이미 학교 답변을 받은 같은 사안을 다시 전달)는 담임에게 표시하고,
--     교장·교감에게는 익명 건수만 보인다. 학부모를 '악성 민원인'으로 분류하지 않는다.
--
-- 분류 결과는 서버(secret 키)만 쓴다. 학부모에게는 보이지 않는다 (기획안 10-B "분석·분류 AI 는 학부모에게 보이지 않는다").
-- 0005 다음에 실행한다. Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 실행. 여러 번 실행해도 된다.
-- =====================================================================

create table if not exists public.risk_assessments (
  case_id uuid primary key references public.cases (id) on delete cascade,
  -- 최종 위험도 (기획안 7장 Level 0~3) = AI 문맥 분류와 규칙(표현) 감지 중 높은 쪽
  level int not null check (level between 0 and 3),
  -- AI 가 판단한 위험도. AI 호출이 실패해 규칙 결과만 있으면 null (나중에 다시 분류한다)
  llm_level int check (llm_level between 0 and 3),
  -- 문의 유형: INFO 정보 / STUDENT 개별 학생 상담 / COMPLAINT 불만·민원 / ADMIN_REVIEW 관리자 검토
  category text not null check (category in ('INFO', 'STUDENT', 'COMPLAINT', 'ADMIN_REVIEW')),
  -- 안전 관련 고위험 후보 (자해·자살, 신체 폭력, 성폭력, 위해·협박, 아동학대 주장)
  high_risk boolean not null default false,
  -- 규칙(표현) 감지 결과 — 종류 이름만 저장한다 (예: VIOLENCE, LEGAL). 원문은 저장하지 않는다.
  rule_signals text[] not null default '{}',
  -- 분류 근거 한두 문장 (요약에 있는 내용만 바탕으로)
  reason text not null default '',
  -- 반복 문의: 같은 학부모·같은 자녀의 이전 문의 중 같은 사안
  repeat_of uuid references public.cases (id) on delete set null,
  repeat_has_reply boolean not null default false, -- 그 이전 문의에 학교 답변이 있었는지
  repeat_new_facts boolean,                        -- 이번 문의에 새로운 사실이 있는지 (AI 판단)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.risk_assessments enable row level security;

-- 볼 수 있는 Case 의 분류만, 그리고 교직원만 (학부모는 자기 Case 라도 못 본다)
-- insert·update·delete 정책은 없다 → 서버(secret 키)만 쓴다.
drop policy if exists risk_assessments_select on public.risk_assessments;
create policy risk_assessments_select on public.risk_assessments for select to authenticated
  using (
    public.my_role() in ('TEACHER', 'MANAGER', 'ADMIN')
    and exists (select 1 from public.cases c where c.id = risk_assessments.case_id)
  );

-- ---------- 학교 익명 통계 (교장·교감만) ----------
-- 건수만 돌려준다. 학생·학부모·학급·내용은 돌려주지 않는다.
-- 상담(conversations)은 학부모 본인만 보는 표라서, 건수를 세려면 security definer 가 필요하다.
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
    -- 학부모가 한마디라도 한 상담만 센다 (빈 상담 제외)
    select c.id, c.status from public.conversations c
    where c.school_id = v_school
      and exists (select 1 from public.messages m where m.conversation_id = c.id and m.role = 'parent')
  ),
  cs as (
    select c.id, c.status, c.escalated_at, r.level, r.high_risk, r.repeat_of, r.case_id as classified
    from public.cases c left join public.risk_assessments r on r.case_id = c.id
    where c.school_id = v_school
  )
  select jsonb_build_object(
    'consultations', (select count(*) from conv),
    'closedByAi', (select count(*) from conv where status = 'CLOSED_AI'),
    'inProgress', (select count(*) from conv where status in ('ACTIVE', 'WAITING_FOR_PARENT', 'SUMMARY_READY', 'CONSENT_PENDING')),
    'sentToSchool', (select count(*) from cs),
    'shared', (select count(*) from cs where escalated_at is not null),
    'replied', (select count(*) from cs where status in ('RESOLVED', 'CLOSED')),
    'level0', (select count(*) from cs where level = 0),
    'level1', (select count(*) from cs where level = 1),
    'level2', (select count(*) from cs where level = 2),
    'level3', (select count(*) from cs where level = 3),
    'highRisk', (select count(*) from cs where high_risk),
    'repeats', (select count(*) from cs where repeat_of is not null),
    'unclassified', (select count(*) from cs where classified is null)
  ) into v;
  return v;
end;
$$;

revoke execute on function public.school_stats() from public, anon;
grant execute on function public.school_stats() to authenticated;
