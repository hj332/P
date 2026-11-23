-- =====================================================================
-- 온담 AI — 시연 전 테스트 데이터 초기화
--
-- 테스트 계정(parent1/2, teacher1/2, admin1/2 @example.com)이 만든
-- 상담·메시지·Case·배정(관리자 이관 포함)·선생님 답변·동의 기록·열람 기록을 모두 지운다.
-- 계정, 학교, 학급, 학생, 담임 배정(seed_test.sql·seed_admin.sql 내용)은 그대로 둔다.
--
-- ⚠ 지운 데이터는 되돌릴 수 없다. 테스트 계정 외의 데이터는 건드리지 않는다.
-- 사용법: Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 [Run].
--         결과 표에 지운 건수가 나온다. 여러 번 실행해도 된다.
-- =====================================================================

create temp table if not exists _demo_reset (what text, deleted int);
truncate _demo_reset;

do $$
declare
  v_parents uuid[] := array(
    select id from auth.users where email in ('parent1@example.com', 'parent2@example.com')
  );
  v_teachers uuid[] := array(
    select id from auth.users where email in ('teacher1@example.com', 'teacher2@example.com')
  );
  v_admins uuid[] := array(
    select id from auth.users where email in ('admin1@example.com', 'admin2@example.com')
  );
  v_convs uuid[];
  v_cases uuid[];
  n int;
begin
  if coalesce(array_length(v_parents, 1), 0) = 0 then
    raise exception '테스트 학부모 계정을 찾지 못했습니다. 아무것도 지우지 않았습니다.';
  end if;

  v_convs := array(select id from public.conversations where parent_id = any (v_parents));
  v_cases := array(select id from public.cases where parent_id = any (v_parents));

  delete from public.audit_logs
  where target_id = any (v_cases) or actor_id = any (v_parents || v_teachers || v_admins);
  get diagnostics n = row_count; insert into _demo_reset values ('열람·답변·공유 기록 (audit_logs)', n);

  -- 0003 을 실행한 뒤에만 있는 표
  if to_regclass('public.case_replies') is not null then
    execute 'delete from public.case_replies where case_id = any ($1)' using v_cases;
    get diagnostics n = row_count; insert into _demo_reset values ('선생님 답변 (case_replies)', n);
  end if;

  delete from public.assignments where case_id = any (v_cases);
  get diagnostics n = row_count; insert into _demo_reset values ('배정 (assignments)', n);

  delete from public.cases where id = any (v_cases);
  get diagnostics n = row_count; insert into _demo_reset values ('학교에 전달된 문의 (cases)', n);

  delete from public.consent_logs where conversation_id = any (v_convs);
  get diagnostics n = row_count; insert into _demo_reset values ('전달 동의·거부 기록 (consent_logs)', n);

  delete from public.messages where conversation_id = any (v_convs);
  get diagnostics n = row_count; insert into _demo_reset values ('대화 메시지 (messages)', n);

  delete from public.conversations where id = any (v_convs);
  get diagnostics n = row_count; insert into _demo_reset values ('상담 (conversations)', n);
end;
$$;

select what as "지운 것", deleted as "건수" from _demo_reset;
