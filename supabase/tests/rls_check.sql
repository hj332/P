-- =====================================================================
-- 온담 AI — 실제 Supabase 권한(RLS) 점검
--
-- 사용법: Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 [Run].
--   - 0001_init.sql, 0002_parent_messages_only.sql, seed_test.sql 을 먼저 실행해 둘 것.
--   - 테스트 계정(parent1/2, teacher1/2)으로 "로그인한 것처럼" 바꿔 가며 확인한다.
--     비밀번호는 필요 없다.
--   - 테스트 중에 만든 상담·메시지·Case 는 마지막에 전부 되돌린다. 실제 데이터는 바뀌지 않는다.
--   - 결과 표의 ok 열이 모두 true 면 통과. false 인 줄이 있으면 그 줄을 알려 주세요.
-- =====================================================================

create temp table if not exists _rls_result (no int, test text, want text, got text, ok boolean, detail text);
truncate _rls_result;

-- 테스트 계정으로 "로그인한 것처럼" 바꾸는 도우미 (이 SQL 실행 중에만 존재)
create or replace function pg_temp.login(p_uid uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  perform set_config('request.jwt.claims',
    case when p_uid is null then '{"role":"anon"}'
         else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
  if p_uid is null then
    execute 'set local role anon';
  else
    execute 'set local role authenticated';
  end if;
end;
$f$;

do $$
declare
  r jsonb := '[]';
  n int;
  v_id uuid;
  v_pa uuid := (select id from auth.users where email = 'parent1@example.com');
  v_pb uuid := (select id from auth.users where email = 'parent2@example.com');
  v_t1 uuid := (select id from auth.users where email = 'teacher1@example.com');
  v_t2 uuid := (select id from auth.users where email = 'teacher2@example.com');
  v_school uuid; v_st1 uuid; v_st2 uuid;
  v_conv uuid; v_conv2 uuid; v_case uuid;
  v_before_cases int; v_before_convs int; v_before_audit int;
begin
  if v_pa is null or v_pb is null or v_t1 is null or v_t2 is null then
    raise exception '테스트 계정 4개가 없습니다. seed_test.sql 안내대로 먼저 만들어 주세요.';
  end if;
  select school_id into v_school from public.profiles where id = v_pa;
  select student_id into v_st1 from public.student_relations where parent_id = v_pa;
  select student_id into v_st2 from public.student_relations where parent_id = v_pb;
  if v_school is null or v_st1 is null or v_st2 is null then
    raise exception 'seed_test.sql 이 아직 실행되지 않았습니다.';
  end if;
  select count(*) into v_before_cases from public.cases;
  select count(*) into v_before_convs from public.conversations;
  select count(*) into v_before_audit from public.audit_logs;

  begin  -- ===== 여기부터 끝까지 마지막에 통째로 되돌린다 =====

    -- ---------- 학부모A (박하늘 학부모) ----------
    reset role; perform pg_temp.login(v_pa);

    select count(*) into n from public.profiles;
    r := r || jsonb_build_object('t','학부모A: 프로필은 내 것만 보임','want','1','got',n::text);
    select count(*) into n from public.students;
    r := r || jsonb_build_object('t','학부모A: 학생은 내 자녀만 보임','want','1','got',n::text);
    select count(*) into n from public.students where id = v_st2;
    r := r || jsonb_build_object('t','학부모A: 다른 집 아이(김바다)는 안 보임','want','0','got',n::text);
    select count(*) into n from public.classes;
    r := r || jsonb_build_object('t','학부모A: 학급은 내 자녀 반만 보임','want','1','got',n::text);

    begin
      update public.profiles set role = 'TEACHER' where id = v_pa;
      get diagnostics n = row_count;
      r := r || jsonb_build_object('t','학부모A: 내 역할을 교사로 바꾸기','want','막힘','got', case when n = 0 then '막힘' else '통과됨' end);
    exception when others then
      r := r || jsonb_build_object('t','학부모A: 내 역할을 교사로 바꾸기','want','막힘','got','막힘','d',sqlerrm);
    end;

    begin
      insert into public.student_relations (parent_id, student_id) values (v_pa, v_st2);
      r := r || jsonb_build_object('t','학부모A: 다른 집 아이를 내 자녀로 등록','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학부모A: 다른 집 아이를 내 자녀로 등록','want','막힘','got','막힘','d',sqlerrm);
    end;

    begin
      insert into public.conversations (school_id, parent_id, student_id)
      values (v_school, v_pa, v_st1) returning id into v_conv;
      r := r || jsonb_build_object('t','학부모A: 내 자녀 상담 시작','want','성공','got','성공');
    exception when others then
      r := r || jsonb_build_object('t','학부모A: 내 자녀 상담 시작','want','성공','got','실패','d',sqlerrm);
    end;

    begin
      insert into public.conversations (school_id, parent_id, student_id) values (v_school, v_pa, v_st2);
      r := r || jsonb_build_object('t','학부모A: 다른 집 아이로 상담 시작','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학부모A: 다른 집 아이로 상담 시작','want','막힘','got','막힘','d',sqlerrm);
    end;

    begin
      insert into public.conversations (school_id, parent_id, student_id, status)
      values (v_school, v_pa, v_st1, 'CASE_CREATED');
      r := r || jsonb_build_object('t','학부모A: 처음부터 "전달됨" 상태로 상담 만들기','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학부모A: 처음부터 "전달됨" 상태로 상담 만들기','want','막힘','got','막힘','d',sqlerrm);
    end;

    begin
      insert into public.messages (conversation_id, role, content) values (v_conv, 'parent', '[점검] 아이가 혼났대요');
      r := r || jsonb_build_object('t','학부모A: 내 상담에 메시지 쓰기','want','성공','got','성공');
    exception when others then
      r := r || jsonb_build_object('t','학부모A: 내 상담에 메시지 쓰기','want','성공','got','실패','d',sqlerrm);
    end;

    begin
      insert into public.messages (conversation_id, role, content) values (v_conv, 'assistant', '[점검] 가짜 AI 답변');
      r := r || jsonb_build_object('t','학부모A: AI 답변인 척 메시지 넣기 (0002)','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학부모A: AI 답변인 척 메시지 넣기 (0002)','want','막힘','got','막힘','d',sqlerrm);
    end;

    begin
      update public.conversations set summary_draft = '{"topic":"[점검]"}' where id = v_conv;
      get diagnostics n = row_count;
      r := r || jsonb_build_object('t','학부모A: 요약 초안 고치기','want','성공','got', case when n = 1 then '성공' else '실패' end);
    exception when others then
      r := r || jsonb_build_object('t','학부모A: 요약 초안 고치기','want','성공','got','실패','d',sqlerrm);
    end;

    begin
      update public.conversations set status = 'CASE_CREATED' where id = v_conv;
      r := r || jsonb_build_object('t','학부모A: 상담 상태를 직접 바꾸기','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학부모A: 상담 상태를 직접 바꾸기','want','막힘','got','막힘','d',sqlerrm);
    end;

    begin
      insert into public.cases (school_id, conversation_id, parent_id, student_id, final_summary)
      values (v_school, v_conv, v_pa, v_st1, '{}');
      r := r || jsonb_build_object('t','학부모A: 동의 절차 없이 Case 직접 만들기','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학부모A: 동의 절차 없이 Case 직접 만들기','want','막힘','got','막힘','d',sqlerrm);
    end;

    begin
      perform public.consent_and_create_case(v_conv, '{"topic":"[점검]"}');
      r := r || jsonb_build_object('t','학부모A: 요약 확인 단계 전에 전달하기','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학부모A: 요약 확인 단계 전에 전달하기','want','막힘','got','막힘','d',sqlerrm);
    end;

    -- ---------- 학부모B (김바다 학부모) ----------
    reset role; perform pg_temp.login(v_pb);

    select count(*) into n from public.conversations;
    r := r || jsonb_build_object('t','학부모B: 학부모A의 상담은 안 보임','want','0','got',n::text);
    select count(*) into n from public.messages;
    r := r || jsonb_build_object('t','학부모B: 학부모A의 메시지는 안 보임','want','0','got',n::text);
    begin
      insert into public.messages (conversation_id, role, content) values (v_conv, 'parent', '[점검] 끼어들기');
      r := r || jsonb_build_object('t','학부모B: 남의 상담에 메시지 쓰기','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학부모B: 남의 상담에 메시지 쓰기','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      perform public.set_conversation_status(v_conv, 'CONSENT_PENDING');
      r := r || jsonb_build_object('t','학부모B: 남의 상담 상태 바꾸기','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학부모B: 남의 상담 상태 바꾸기','want','막힘','got','막힘','d',sqlerrm);
    end;

    -- ---------- 담임1 (3학년 2반) : 동의 전 ----------
    reset role; perform pg_temp.login(v_t1);

    select count(*) into n from public.conversations;
    r := r || jsonb_build_object('t','담임1: 동의 전 상담은 담임도 못 봄','want','0','got',n::text);
    select count(*) into n from public.messages;
    r := r || jsonb_build_object('t','담임1: 동의 전 메시지는 담임도 못 봄','want','0','got',n::text);
    select count(*) into n from public.students;
    r := r || jsonb_build_object('t','담임1: 학생은 우리 반만 보임','want','1','got',n::text);

    -- ---------- 학부모A : 요약 확인 → 전달 동의 ----------
    reset role; perform pg_temp.login(v_pa);
    begin
      perform public.set_conversation_status(v_conv, 'CONSENT_PENDING');
      v_case := public.consent_and_create_case(v_conv, '{"topic":"[점검] 테스트 요약","facts":["점검용"]}');
      r := r || jsonb_build_object('t','학부모A: 요약 확인 후 [전달] → Case 생성','want','성공','got', case when v_case is not null then '성공' else '실패' end);
    exception when others then
      r := r || jsonb_build_object('t','학부모A: 요약 확인 후 [전달] → Case 생성','want','성공','got','실패','d',sqlerrm);
    end;
    begin
      insert into public.messages (conversation_id, role, content) values (v_conv, 'parent', '[점검] 전달 후 추가');
      r := r || jsonb_build_object('t','학부모A: 이미 전달된 상담에 메시지 쓰기','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학부모A: 이미 전달된 상담에 메시지 쓰기','want','막힘','got','막힘','d',sqlerrm);
    end;
    select count(*) into n from public.cases where id = v_case;
    r := r || jsonb_build_object('t','학부모A: 내가 전달한 Case 는 보임','want','1','got',n::text);

    -- ---------- 학부모B : 남의 Case ----------
    reset role; perform pg_temp.login(v_pb);
    select count(*) into n from public.cases;
    r := r || jsonb_build_object('t','학부모B: 학부모A의 Case 는 안 보임','want','0','got',n::text);

    -- ---------- 담임1 : 동의 후 ----------
    reset role; perform pg_temp.login(v_t1);
    select count(*) into n from public.cases where id = v_case;
    r := r || jsonb_build_object('t','담임1: 전달된 Case 는 보임','want','1','got',n::text);
    select count(*) into n from public.conversations;
    r := r || jsonb_build_object('t','담임1: 전달 후에도 원래 대화는 못 봄','want','0','got',n::text);
    select count(*) into n from public.messages;
    r := r || jsonb_build_object('t','담임1: 전달 후에도 원래 메시지는 못 봄','want','0','got',n::text);
    select count(*) into n from public.profiles where id = v_pa;
    r := r || jsonb_build_object('t','담임1: Case 를 보낸 학부모 이름은 보임','want','1','got',n::text);
    select count(*) into n from public.profiles where id = v_pb;
    r := r || jsonb_build_object('t','담임1: 관계없는 학부모B 는 안 보임','want','0','got',n::text);

    begin
      perform public.open_case(v_case);
      r := r || jsonb_build_object('t','담임1: Case 열람','want','성공','got','성공');
    exception when others then
      r := r || jsonb_build_object('t','담임1: Case 열람','want','성공','got','실패','d',sqlerrm);
    end;
    select count(*) into n from public.audit_logs;
    r := r || jsonb_build_object('t','담임1: 열람 기록(audit_logs)을 직접 볼 수 없음','want','0','got',n::text);
    begin
      update public.cases set final_summary = '{"topic":"교사가 고침"}' where id = v_case;
      get diagnostics n = row_count;
      r := r || jsonb_build_object('t','담임1: 학부모가 확인한 요약을 고치기','want','막힘','got', case when n = 0 then '막힘' else '통과됨' end);
    exception when others then
      r := r || jsonb_build_object('t','담임1: 학부모가 확인한 요약을 고치기','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      delete from public.audit_logs;
      get diagnostics n = row_count;
      r := r || jsonb_build_object('t','담임1: 열람 기록 지우기','want','막힘','got', case when n = 0 then '막힘' else '통과됨' end);
    exception when others then
      r := r || jsonb_build_object('t','담임1: 열람 기록 지우기','want','막힘','got','막힘','d',sqlerrm);
    end;

    reset role;
    select count(*) into n from public.audit_logs where target_id = v_case and actor_id = v_t1 and action = 'VIEW_CASE';
    r := r || jsonb_build_object('t','(관리자 확인) 담임1 열람이 audit_logs 에 기록됨','want','1','got',n::text);
    select count(*) into n from public.cases where id = v_case and status = 'TEACHER_REVIEWING';
    r := r || jsonb_build_object('t','(관리자 확인) 열람 후 Case 상태가 "확인 중"','want','1','got',n::text);

    -- ---------- 담임2 (3학년 3반) ----------
    reset role; perform pg_temp.login(v_t2);
    select count(*) into n from public.cases;
    r := r || jsonb_build_object('t','담임2: 다른 반 Case 는 안 보임','want','0','got',n::text);
    select count(*) into n from public.students where id = v_st1;
    r := r || jsonb_build_object('t','담임2: 다른 반 학생(박하늘)은 안 보임','want','0','got',n::text);
    begin
      perform public.open_case(v_case);
      r := r || jsonb_build_object('t','담임2: 다른 반 Case 열람','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','담임2: 다른 반 Case 열람','want','막힘','got','막힘','d',sqlerrm);
    end;

    -- ---------- 학부모A : [상담만 종료] ----------
    reset role; perform pg_temp.login(v_pa);
    begin
      insert into public.conversations (school_id, parent_id, student_id)
      values (v_school, v_pa, v_st1) returning id into v_conv2;
      perform public.decline_and_close(v_conv2);
      select count(*) into n from public.conversations where id = v_conv2 and status = 'CLOSED_AI';
      r := r || jsonb_build_object('t','학부모A: [상담만 종료] → 종료 상태','want','1','got',n::text);
    exception when others then
      r := r || jsonb_build_object('t','학부모A: [상담만 종료] → 종료 상태','want','1','got','실패','d',sqlerrm);
    end;
    begin
      perform public.consent_and_create_case(v_conv2, '{"topic":"[점검]"}');
      r := r || jsonb_build_object('t','학부모A: 종료한 상담을 나중에 전달하기','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학부모A: 종료한 상담을 나중에 전달하기','want','막힘','got','막힘','d',sqlerrm);
    end;

    reset role; perform pg_temp.login(v_t1);
    select count(*) into n from public.cases where conversation_id = v_conv2;
    r := r || jsonb_build_object('t','담임1: [상담만 종료]한 상담은 Case 로 안 옴','want','0','got',n::text);

    -- ---------- 로그인 안 한 사람 ----------
    reset role; perform pg_temp.login(null);
    select count(*) into n from public.profiles;
    r := r || jsonb_build_object('t','비로그인: 프로필 안 보임','want','0','got',n::text);
    select count(*) into n from public.students;
    r := r || jsonb_build_object('t','비로그인: 학생 안 보임','want','0','got',n::text);
    begin
      perform public.consent_and_create_case(v_conv, '{}');
      r := r || jsonb_build_object('t','비로그인: 전달 함수 호출','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','비로그인: 전달 함수 호출','want','막힘','got','막힘','d',sqlerrm);
    end;

    reset role;
    raise exception 'ROLLBACK_TEST_DATA';
  exception when others then
    if sqlerrm <> 'ROLLBACK_TEST_DATA' then
      r := r || jsonb_build_object('t','(점검 스크립트가 중간에 멈춤)','want','-','got','오류','d',sqlerrm);
    end if;
  end;

  -- 되돌려졌는지 확인
  select count(*) into n from public.cases;
  r := r || jsonb_build_object('t','(뒷정리) 테스트 Case 가 남지 않음','want',v_before_cases::text,'got',n::text);
  select count(*) into n from public.conversations;
  r := r || jsonb_build_object('t','(뒷정리) 테스트 상담이 남지 않음','want',v_before_convs::text,'got',n::text);
  select count(*) into n from public.audit_logs;
  r := r || jsonb_build_object('t','(뒷정리) 테스트 열람 기록이 남지 않음','want',v_before_audit::text,'got',n::text);

  insert into _rls_result (no, test, want, got, ok, detail)
  select i, e->>'t', e->>'want', e->>'got', (e->>'want') = (e->>'got'), e->>'d'
  from jsonb_array_elements(r) with ordinality as x(e, i);
end;
$$;

select no, ok, test, want, got, detail from _rls_result order by ok, no;
