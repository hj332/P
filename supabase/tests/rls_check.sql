-- =====================================================================
-- 온담 AI — 실제 Supabase 권한(RLS) 점검
--
-- 사용법: Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 [Run].
--   - 0001_init.sql, 0002_parent_messages_only.sql, 0003_replies_escalation.sql, 0004_manager_escalation.sql,
--     0005_manager_forward_notes.sql, 0006_risk_repeat_stats.sql, 0007_levels_admin_notes_grade_stats.sql,
--     seed_test.sql, seed_admin.sql 을 먼저 실행해 둘 것.
--   - 테스트 계정(parent1/2, teacher1/2, admin1 교장·교감, admin2 3학년 부장)으로 "로그인한 것처럼" 바꿔 가며 확인한다.
--     비밀번호는 필요 없다.
--   - 테스트 중에 만든 상담·메시지·Case 는 마지막에 전부 되돌린다. 실제 데이터는 바뀌지 않는다.
--   - 시연·브라우저 확인으로 이미 들어 있는 데이터가 있어도 되도록, 테스트가 만든 Case 만 세거나
--     테스트 전에 각 계정이 보던 수(기준값)와 비교한다.
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
  v_ad uuid := (select id from auth.users where email = 'admin1@example.com');
  v_mg uuid := (select id from auth.users where email = 'admin2@example.com');
  v_school uuid; v_st1 uuid; v_st2 uuid;
  v_conv uuid; v_conv2 uuid; v_conv3 uuid; v_conv4 uuid; v_case uuid; v_case2 uuid; v_case3 uuid;
  v_before_cases int; v_before_convs int; v_before_audit int; v_before_replies int;
  -- 테스트 전에 관리자·학년부장이 이미 보고 있던 것 (실제 공유된 문의가 있을 수 있음)
  b_ad_st int; b_ad_st2 int; b_ad_cls int; b_ad_cls1 int; b_ad_pb int;
  b_mg_st2 int;
begin
  if v_pa is null or v_pb is null or v_t1 is null or v_t2 is null then
    raise exception '테스트 계정 4개가 없습니다. seed_test.sql 안내대로 먼저 만들어 주세요.';
  end if;
  if to_regclass('public.case_replies') is null then
    raise exception '0003_replies_escalation.sql 이 아직 실행되지 않았습니다.';
  end if;
  if to_regprocedure('public.add_case_note(uuid,text,text)') is null then
    raise exception '0007_levels_admin_notes_grade_stats.sql 이 아직 실행되지 않았습니다.';
  end if;
  if to_regclass('public.risk_assessments') is null then
    raise exception '0006_risk_repeat_stats.sql 이 아직 실행되지 않았습니다.';
  end if;
  if to_regclass('public.case_share_notes') is null then
    raise exception '0005_manager_forward_notes.sql 이 아직 실행되지 않았습니다.';
  end if;
  if to_regclass('public.manager_grades') is null then
    raise exception '0004_manager_escalation.sql 이 아직 실행되지 않았습니다.';
  end if;
  if v_mg is null or not exists (select 1 from public.manager_grades where manager_id = v_mg and grade = 3) then
    raise exception '학년부장 테스트 계정이 없습니다. seed_admin.sql 안내대로 admin2@example.com 을 먼저 만들어 주세요.';
  end if;
  if v_ad is null or not exists (select 1 from public.profiles where id = v_ad and role = 'ADMIN') then
    raise exception '관리자 테스트 계정이 없습니다. seed_admin.sql 안내대로 admin1@example.com 을 먼저 만들어 주세요.';
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
  select count(*) into v_before_replies from public.case_replies;

  begin  -- ===== 여기부터 끝까지 마지막에 통째로 되돌린다 =====

    -- ---------- 기준값: 테스트 전 관리자·학년부장이 보던 것 ----------
    reset role; perform pg_temp.login(v_ad);
    select count(*) into b_ad_st from public.students;
    select count(*) into b_ad_st2 from public.students where id = v_st2;
    select count(*) into b_ad_cls from public.classes;
    select count(*) into b_ad_cls1 from public.classes where id = (select class_id from public.students where id = v_st1);
    select count(*) into b_ad_pb from public.profiles where id = v_pb;
    reset role; perform pg_temp.login(v_mg);
    select count(*) into b_mg_st2 from public.students where id = v_st2;

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

    select count(*) into n from public.conversations where id = v_conv;
    r := r || jsonb_build_object('t','학부모B: 학부모A의 상담은 안 보임','want','0','got',n::text);
    select count(*) into n from public.messages where conversation_id = v_conv;
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
    select count(*) into n from public.cases where id = v_case;
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
    select count(*) into n from public.cases where id = v_case;
    r := r || jsonb_build_object('t','담임2: 다른 반 Case 는 안 보임','want','0','got',n::text);
    select count(*) into n from public.students where id = v_st1;
    r := r || jsonb_build_object('t','담임2: 다른 반 학생(박하늘)은 안 보임','want','0','got',n::text);
    begin
      perform public.open_case(v_case);
      r := r || jsonb_build_object('t','담임2: 다른 반 Case 열람','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','담임2: 다른 반 Case 열람','want','막힘','got','막힘','d',sqlerrm);
    end;

    -- =========== 0003: 선생님 답변 → 학부모 확인 ===========

    -- ---------- 관리자 : 이관 전 ----------
    reset role; perform pg_temp.login(v_ad);
    select count(*) into n from public.cases where id = v_case;
    r := r || jsonb_build_object('t','관리자: 이관 전에는 Case 가 안 보임','want','0','got',n::text);
    select count(*) into n from public.students;
    r := r || jsonb_build_object('t','관리자: 이관 전에는 새로 보이는 학생이 없음','want',b_ad_st::text,'got',n::text);
    begin
      perform public.open_case(v_case);
      r := r || jsonb_build_object('t','관리자: 이관 안 된 Case 열람','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','관리자: 이관 안 된 Case 열람','want','막힘','got','막힘','d',sqlerrm);
    end;

    reset role; perform pg_temp.login(v_mg);
    select count(*) into n from public.cases where id = v_case;
    r := r || jsonb_build_object('t','학년부장: 공유받기 전에는 Case 가 안 보임','want','0','got',n::text);

    -- ---------- 학부모A : 답변 오기 전 ----------
    reset role; perform pg_temp.login(v_pa);
    begin
      perform public.confirm_case_reply(v_case);
      r := r || jsonb_build_object('t','학부모A: 답변 오기 전에 [답변 잘 받았어요]','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학부모A: 답변 오기 전에 [답변 잘 받았어요]','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      insert into public.case_replies (case_id, author_id, author_name, body) values (v_case, v_t1, '3학년 2반 담임', '[점검] 가짜 선생님 답변');
      r := r || jsonb_build_object('t','학부모A: 선생님 답변인 척 직접 넣기','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학부모A: 선생님 답변인 척 직접 넣기','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      perform public.reply_to_case(v_case, '[점검] 학부모가 답변 함수 호출');
      r := r || jsonb_build_object('t','학부모A: 답변 보내기 함수 호출','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학부모A: 답변 보내기 함수 호출','want','막힘','got','막힘','d',sqlerrm);
    end;

    -- ---------- 담임2 : 다른 반 문의에 답변·공유 ----------
    reset role; perform pg_temp.login(v_t2);
    begin
      perform public.reply_to_case(v_case, '[점검] 다른 반 답변');
      r := r || jsonb_build_object('t','담임2: 다른 반 문의에 답변','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','담임2: 다른 반 문의에 답변','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      perform public.escalate_case(v_case, 'ADMIN');
      r := r || jsonb_build_object('t','담임2: 다른 반 문의를 관리자와 공유','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','담임2: 다른 반 문의를 관리자와 공유','want','막힘','got','막힘','d',sqlerrm);
    end;

    -- ---------- 담임1 : 답변 보내기 ----------
    reset role; perform pg_temp.login(v_t1);
    begin
      insert into public.case_replies (case_id, author_id, author_name, body) values (v_case, v_t1, '3학년 2반 담임', '[점검] 함수 없이 답변');
      r := r || jsonb_build_object('t','담임1: 함수를 거치지 않고 답변 직접 넣기','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','담임1: 함수를 거치지 않고 답변 직접 넣기','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      perform public.reply_to_case(v_case, '   ');
      r := r || jsonb_build_object('t','담임1: 빈 답변 보내기','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','담임1: 빈 답변 보내기','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      perform public.reply_to_case(v_case, '[점검] 안녕하세요, 담임입니다. 말씀 감사합니다.');
      r := r || jsonb_build_object('t','담임1: 답변 보내기','want','성공','got','성공');
    exception when others then
      r := r || jsonb_build_object('t','담임1: 답변 보내기','want','성공','got','실패','d',sqlerrm);
    end;
    select count(*) into n from public.cases where id = v_case and status = 'RESOLVED';
    r := r || jsonb_build_object('t','담임1: 답변 후 Case 상태가 "답변 완료"','want','1','got',n::text);
    select count(*) into n from public.case_replies where case_id = v_case;
    r := r || jsonb_build_object('t','담임1: 보낸 답변이 보임','want','1','got',n::text);
    begin
      perform public.reply_to_case(v_case, '[점검] 두 번째 답변');
      r := r || jsonb_build_object('t','담임1: 같은 문의에 두 번 답변','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','담임1: 같은 문의에 두 번 답변','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      perform public.escalate_case(v_case, 'ADMIN');
      r := r || jsonb_build_object('t','담임1: 답변한 문의를 나중에 관리자와 공유','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','담임1: 답변한 문의를 나중에 관리자와 공유','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      update public.case_replies set body = '[점검] 몰래 고친 답변' where case_id = v_case;
      get diagnostics n = row_count;
      r := r || jsonb_build_object('t','담임1: 보낸 답변을 직접 고치기','want','막힘','got', case when n = 0 then '막힘' else '통과됨' end);
    exception when others then
      r := r || jsonb_build_object('t','담임1: 보낸 답변을 직접 고치기','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      update public.cases set status = 'CLOSED' where id = v_case;
      get diagnostics n = row_count;
      r := r || jsonb_build_object('t','담임1: Case 상태를 직접 바꾸기','want','막힘','got', case when n = 0 then '막힘' else '통과됨' end);
    exception when others then
      r := r || jsonb_build_object('t','담임1: Case 상태를 직접 바꾸기','want','막힘','got','막힘','d',sqlerrm);
    end;

    reset role; perform pg_temp.login(v_t2);
    select count(*) into n from public.case_replies where case_id = v_case;
    r := r || jsonb_build_object('t','담임2: 다른 반 답변은 안 보임','want','0','got',n::text);

    -- ---------- 학부모B : 남의 답변 ----------
    reset role; perform pg_temp.login(v_pb);
    select count(*) into n from public.case_replies where case_id = v_case;
    r := r || jsonb_build_object('t','학부모B: 학부모A가 받은 답변은 안 보임','want','0','got',n::text);
    begin
      perform public.confirm_case_reply(v_case);
      r := r || jsonb_build_object('t','학부모B: 남의 답변에 [답변 잘 받았어요]','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학부모B: 남의 답변에 [답변 잘 받았어요]','want','막힘','got','막힘','d',sqlerrm);
    end;

    -- ---------- 학부모A : 답변 확인 ----------
    reset role; perform pg_temp.login(v_pa);
    select count(*) into n from public.case_replies where case_id = v_case and author_name <> '';
    r := r || jsonb_build_object('t','학부모A: 선생님 답변이 보임 (보낸 선생님 이름 포함)','want','1','got',n::text);
    begin
      update public.cases set status = 'CLOSED' where id = v_case;
      get diagnostics n = row_count;
      r := r || jsonb_build_object('t','학부모A: Case 상태를 직접 바꾸기','want','막힘','got', case when n = 0 then '막힘' else '통과됨' end);
    exception when others then
      r := r || jsonb_build_object('t','학부모A: Case 상태를 직접 바꾸기','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      perform public.confirm_case_reply(v_case);
      select count(*) into n from public.cases where id = v_case and status = 'CLOSED' and parent_confirmed_at is not null;
      r := r || jsonb_build_object('t','학부모A: [답변 잘 받았어요] → 마무리','want','1','got',n::text);
    exception when others then
      r := r || jsonb_build_object('t','학부모A: [답변 잘 받았어요] → 마무리','want','1','got','실패','d',sqlerrm);
    end;
    begin
      perform public.confirm_case_reply(v_case);
      r := r || jsonb_build_object('t','학부모A: [답변 잘 받았어요] 두 번','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학부모A: [답변 잘 받았어요] 두 번','want','막힘','got','막힘','d',sqlerrm);
    end;

    reset role; perform pg_temp.login(v_ad);
    select count(*) into n from public.case_replies where case_id = v_case;
    r := r || jsonb_build_object('t','관리자: 이관 안 된 문의의 답변은 안 보임','want','0','got',n::text);

    -- =========== 0003: 관리자 이관 ===========

    -- ---------- 학부모A : 두 번째 문의 전달 ----------
    reset role; perform pg_temp.login(v_pa);
    begin
      insert into public.conversations (school_id, parent_id, student_id)
      values (v_school, v_pa, v_st1) returning id into v_conv3;
      perform public.set_conversation_status(v_conv3, 'CONSENT_PENDING');
      v_case2 := public.consent_and_create_case(v_conv3, '{"topic":"[점검] 이관용 요약","facts":["점검용"]}');
      r := r || jsonb_build_object('t','학부모A: 두 번째 문의 전달','want','성공','got', case when v_case2 is not null then '성공' else '실패' end);
    exception when others then
      r := r || jsonb_build_object('t','학부모A: 두 번째 문의 전달','want','성공','got','실패','d',sqlerrm);
    end;

    -- ---------- 담임1 : 공유 대상 고르기 (0004) ----------
    reset role; perform pg_temp.login(v_t1);
    begin
      insert into public.assignments (case_id, assignee_id, kind) values (v_case2, v_ad, 'ESCALATION');
      r := r || jsonb_build_object('t','담임1: 함수를 거치지 않고 관리자 배정 직접 넣기','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','담임1: 함수를 거치지 않고 관리자 배정 직접 넣기','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      perform public.escalate_case(v_case2, 'TEACHER');
      r := r || jsonb_build_object('t','담임1: 정해진 대상(학년부장·교장교감) 말고 다른 곳에 공유','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','담임1: 정해진 대상(학년부장·교장교감) 말고 다른 곳에 공유','want','막힘','got','막힘','d',sqlerrm);
    end;

    -- 학년부장이 다른 학년(4학년)만 맡고 있으면 3학년 문의는 공유되지 않아야 한다
    reset role; update public.manager_grades set grade = 4 where manager_id = v_mg;
    perform pg_temp.login(v_t1);
    begin
      perform public.escalate_case(v_case2, 'MANAGER');
      r := r || jsonb_build_object('t','담임1: 이 학년 담당이 아닌 학년부장에게 공유','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','담임1: 이 학년 담당이 아닌 학년부장에게 공유','want','막힘','got','막힘','d',sqlerrm);
    end;
    reset role; update public.manager_grades set grade = 3 where manager_id = v_mg;
    perform pg_temp.login(v_t1);

    begin
      perform public.open_case(v_case2);
      perform public.escalate_case(v_case2, 'MANAGER', '[점검] 담임 메모: 비슷한 문의가 학년에 더 있는지 봐 주세요');
      select count(*) into n from public.cases
      where id = v_case2 and status = 'ESCALATED' and shared_manager_at is not null and shared_admin_at is null;
      r := r || jsonb_build_object('t','담임1: [학년부장 선생님께] 메모와 함께 공유 → 관리자 공유 상태','want','1','got',n::text);
    exception when others then
      r := r || jsonb_build_object('t','담임1: [학년부장 선생님께] 메모와 함께 공유 → 관리자 공유 상태','want','1','got','실패','d',sqlerrm);
    end;
    begin
      perform public.escalate_case(v_case2, 'MANAGER');
      r := r || jsonb_build_object('t','담임1: 학년부장에게 두 번 공유','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','담임1: 학년부장에게 두 번 공유','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      insert into public.case_share_notes (case_id, author_id, author_name, target, note)
      values (v_case2, v_t1, '3학년 2반 담임', 'ADMIN', '[점검] 함수 없이 메모');
      r := r || jsonb_build_object('t','담임1: 함수를 거치지 않고 공유 메모 직접 넣기','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','담임1: 함수를 거치지 않고 공유 메모 직접 넣기','want','막힘','got','막힘','d',sqlerrm);
    end;

    -- ---------- 학년부장 : 공유받은 뒤 ----------
    reset role; perform pg_temp.login(v_mg);
    select count(*) into n from public.cases where id in (v_case, v_case2);
    r := r || jsonb_build_object('t','학년부장: 공유받은 Case 만 보임 (테스트 2건 중 1건)','want','1','got',n::text);
    select count(*) into n from public.cases where id = v_case;
    r := r || jsonb_build_object('t','학년부장: 공유받지 않은 Case 는 안 보임','want','0','got',n::text);
    select count(*) into n from public.students where id = v_st1;
    r := r || jsonb_build_object('t','학년부장: 공유받은 문의의 학생은 보임','want','1','got',n::text);
    select count(*) into n from public.students where id = v_st2;
    r := r || jsonb_build_object('t','학년부장: 관계없는 학생(김바다)은 새로 보이지 않음','want',b_mg_st2::text,'got',n::text);
    select count(*) into n from public.conversations;
    r := r || jsonb_build_object('t','학년부장: 상담 원문(대화)은 못 봄','want','0','got',n::text);
    select count(*) into n from public.messages;
    r := r || jsonb_build_object('t','학년부장: 상담 원문(메시지)은 못 봄','want','0','got',n::text);
    select count(*) into n from public.case_share_notes where case_id = v_case2;
    r := r || jsonb_build_object('t','학년부장: 담임이 남긴 공유 메모가 보임','want','1','got',n::text);
    begin
      perform public.open_case(v_case2);
      select count(*) into n from public.assignments where case_id = v_case2 and assignee_id = v_mg and viewed_at is not null;
      r := r || jsonb_build_object('t','학년부장: 열면 내 배정에 열람 시각이 남음','want','1','got',n::text);
    exception when others then
      r := r || jsonb_build_object('t','학년부장: 열면 내 배정에 열람 시각이 남음','want','1','got','실패','d',sqlerrm);
    end;
    begin
      perform public.reply_to_case(v_case2, '[점검] 학년부장 답변');
      r := r || jsonb_build_object('t','학년부장: 답변 보내기 (답변은 담임만)','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학년부장: 답변 보내기 (답변은 담임만)','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      perform public.escalate_case(v_case2, 'MANAGER');
      r := r || jsonb_build_object('t','학년부장: 다른 학년부장에게 공유 (교장·교감에게만 가능)','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학년부장: 다른 학년부장에게 공유 (교장·교감에게만 가능)','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      perform public.escalate_case(v_case, 'ADMIN');
      r := r || jsonb_build_object('t','학년부장: 공유받지 않은 문의를 교장·교감에게 공유','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학년부장: 공유받지 않은 문의를 교장·교감에게 공유','want','막힘','got','막힘','d',sqlerrm);
    end;

    reset role; perform pg_temp.login(v_ad);
    select count(*) into n from public.cases where id in (v_case, v_case2);
    r := r || jsonb_build_object('t','관리자: 학년부장에게만 공유된 문의는 안 보임','want','0','got',n::text);

    -- ---------- 학년부장 : [교장·교감 선생님께] 메모와 함께 공유 (0005) ----------
    reset role; perform pg_temp.login(v_mg);
    begin
      perform public.escalate_case(v_case2, 'ADMIN', '[점검] 학년부장 메모: 학교 차원의 확인이 필요해 보여요');
      select count(*) into n from public.cases
      where id = v_case2 and status = 'ESCALATED' and shared_manager_at is not null and shared_admin_at is not null;
      r := r || jsonb_build_object('t','학년부장: [교장·교감 선생님께] 메모와 함께 공유 (둘 다 공유됨)','want','1','got',n::text);
    exception when others then
      r := r || jsonb_build_object('t','학년부장: [교장·교감 선생님께] 메모와 함께 공유 (둘 다 공유됨)','want','1','got','실패','d',sqlerrm);
    end;

    -- ---------- 담임1 : 이미 공유된 대상에게 다시 ----------
    reset role; perform pg_temp.login(v_t1);
    begin
      perform public.escalate_case(v_case2, 'ADMIN');
      r := r || jsonb_build_object('t','담임1: 학년부장이 이미 공유한 교장·교감에게 또 공유','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','담임1: 학년부장이 이미 공유한 교장·교감에게 또 공유','want','막힘','got','막힘','d',sqlerrm);
    end;
    select count(*) into n from public.case_share_notes where case_id = v_case2;
    r := r || jsonb_build_object('t','담임1: 내 메모와 학년부장 메모가 모두 보임','want','2','got',n::text);

    -- ---------- 공유 메모는 교직원만 ----------
    reset role; perform pg_temp.login(v_pa);
    select count(*) into n from public.case_share_notes where case_id = v_case2;
    r := r || jsonb_build_object('t','학부모A: 내 문의라도 교직원 공유 메모는 안 보임','want','0','got',n::text);
    select count(*) into n from public.cases where id = v_case2 and shared_manager_at is not null and shared_admin_at is not null;
    r := r || jsonb_build_object('t','학부모A: 누구와 공유됐는지(학년부장·교장교감)는 보임','want','1','got',n::text);
    reset role; perform pg_temp.login(v_t2);
    select count(*) into n from public.case_share_notes where case_id = v_case2;
    r := r || jsonb_build_object('t','담임2: 다른 반 공유 메모는 안 보임','want','0','got',n::text);

    -- ---------- 관리자 : 이관 후 ----------
    reset role; perform pg_temp.login(v_ad);
    select count(*) into n from public.cases where id in (v_case, v_case2);
    r := r || jsonb_build_object('t','관리자: 이관된 Case 만 보임 (테스트 2건 중 1건)','want','1','got',n::text);
    select count(*) into n from public.assignments where case_id = v_case2 and assignee_id = v_ad and viewed_at is null;
    r := r || jsonb_build_object('t','관리자: 학년부장이 먼저 열었어도 내 열람 기록은 따로 (아직 안 염)','want','1','got',n::text);
    select count(*) into n from public.case_share_notes where case_id = v_case2;
    r := r || jsonb_build_object('t','관리자: 담임·학년부장 공유 메모 2개가 보임','want','2','got',n::text);
    select count(*) into n from public.cases where id = v_case;
    r := r || jsonb_build_object('t','관리자: 이관 안 된 Case 는 계속 안 보임','want','0','got',n::text);
    select count(*) into n from public.students where id = v_st1;
    r := r || jsonb_build_object('t','관리자: 이관된 문의의 학생은 보임','want','1','got',n::text);
    select count(*) into n from public.students where id = v_st2;
    r := r || jsonb_build_object('t','관리자: 관계없는 학생(김바다)은 새로 보이지 않음','want',b_ad_st2::text,'got',n::text);
    select count(*) into n from public.classes;
    r := r || jsonb_build_object('t','관리자: 이관된 문의 학생의 학급만 새로 보임','want',(b_ad_cls + 1 - b_ad_cls1)::text,'got',n::text);
    select count(*) into n from public.profiles where id = v_pa;
    r := r || jsonb_build_object('t','관리자: 이관된 문의의 학부모 이름은 보임','want','1','got',n::text);
    select count(*) into n from public.profiles where id = v_pb;
    r := r || jsonb_build_object('t','관리자: 관계없는 학부모B 는 새로 보이지 않음','want',b_ad_pb::text,'got',n::text);
    select count(*) into n from public.conversations;
    r := r || jsonb_build_object('t','관리자: 상담 원문(대화)은 못 봄','want','0','got',n::text);
    select count(*) into n from public.messages;
    r := r || jsonb_build_object('t','관리자: 상담 원문(메시지)은 못 봄','want','0','got',n::text);
    begin
      perform public.open_case(v_case2);
      select count(*) into n from public.cases where id = v_case2 and status = 'ADMIN_REVIEWING';
      r := r || jsonb_build_object('t','관리자: 이관된 Case 열람 → 관리자 확인 중','want','1','got',n::text);
    exception when others then
      r := r || jsonb_build_object('t','관리자: 이관된 Case 열람 → 관리자 확인 중','want','1','got','실패','d',sqlerrm);
    end;
    select count(*) into n from public.audit_logs;
    r := r || jsonb_build_object('t','관리자: 열람 기록(audit_logs)을 직접 볼 수 없음','want','0','got',n::text);
    begin
      perform public.reply_to_case(v_case2, '[점검] 관리자 답변');
      r := r || jsonb_build_object('t','관리자: 답변 보내기 (A 단계는 담임만)','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','관리자: 답변 보내기 (A 단계는 담임만)','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      update public.cases set final_summary = '{"topic":"관리자가 고침"}' where id = v_case2;
      get diagnostics n = row_count;
      r := r || jsonb_build_object('t','관리자: 학부모가 확인한 요약을 고치기','want','막힘','got', case when n = 0 then '막힘' else '통과됨' end);
    exception when others then
      r := r || jsonb_build_object('t','관리자: 학부모가 확인한 요약을 고치기','want','막힘','got','막힘','d',sqlerrm);
    end;

    reset role; perform pg_temp.login(v_t2);
    select count(*) into n from public.cases where id = v_case2;
    r := r || jsonb_build_object('t','담임2: 이관된 다른 반 Case 도 안 보임','want','0','got',n::text);

    -- ---------- 담임1 : 이관된 문의에 답변 ----------
    reset role; perform pg_temp.login(v_t1);
    select count(*) into n from public.cases where id = v_case2;
    r := r || jsonb_build_object('t','담임1: 이관한 뒤에도 Case 가 보임','want','1','got',n::text);
    begin
      perform public.reply_to_case(v_case2, '[점검] 교감 선생님과 함께 확인한 답변입니다.');
      select count(*) into n from public.cases where id = v_case2 and status = 'RESOLVED';
      r := r || jsonb_build_object('t','담임1: 이관된 문의에 답변 → 답변 완료','want','1','got',n::text);
    exception when others then
      r := r || jsonb_build_object('t','담임1: 이관된 문의에 답변 → 답변 완료','want','1','got','실패','d',sqlerrm);
    end;

    reset role; perform pg_temp.login(v_ad);
    select count(*) into n from public.case_replies where case_id = v_case2;
    r := r || jsonb_build_object('t','관리자: 이관된 문의의 답변은 보임','want','1','got',n::text);
    reset role; perform pg_temp.login(v_mg);
    select count(*) into n from public.case_replies where case_id = v_case2;
    r := r || jsonb_build_object('t','학년부장: 공유받은 문의의 답변은 보임','want','1','got',n::text);
    select count(*) into n from public.case_replies where case_id = v_case;
    r := r || jsonb_build_object('t','학년부장: 공유받지 않은 문의의 답변은 안 보임','want','0','got',n::text);

    -- ---------- 담임이 [교장·교감 선생님께] 바로 공유 (세 번째 문의) ----------
    reset role; perform pg_temp.login(v_pa);
    begin
      insert into public.conversations (school_id, parent_id, student_id)
      values (v_school, v_pa, v_st1) returning id into v_conv4;
      perform public.set_conversation_status(v_conv4, 'CONSENT_PENDING');
      v_case3 := public.consent_and_create_case(v_conv4, '{"topic":"[점검] 교장교감 바로 공유용"}');
    exception when others then
      r := r || jsonb_build_object('t','(준비) 세 번째 문의 전달','want','성공','got','실패','d',sqlerrm);
    end;
    reset role; perform pg_temp.login(v_t1);
    begin
      perform public.open_case(v_case3);
      perform public.escalate_case(v_case3, 'ADMIN');
      select count(*) into n from public.cases
      where id = v_case3 and status = 'ESCALATED' and shared_admin_at is not null and shared_manager_at is null;
      r := r || jsonb_build_object('t','담임1: 메모 없이 [교장·교감 선생님께] 바로 공유','want','1','got',n::text);
    exception when others then
      r := r || jsonb_build_object('t','담임1: 메모 없이 [교장·교감 선생님께] 바로 공유','want','1','got','실패','d',sqlerrm);
    end;
    reset role; perform pg_temp.login(v_ad);
    select count(*) into n from public.cases where id = v_case3;
    r := r || jsonb_build_object('t','관리자: 담임이 바로 공유한 문의가 보임','want','1','got',n::text);
    reset role; perform pg_temp.login(v_mg);
    select count(*) into n from public.cases where id = v_case3;
    r := r || jsonb_build_object('t','학년부장: 교장·교감에게만 공유된 문의는 안 보임','want','0','got',n::text);

    reset role;
    select count(*) into n from public.audit_logs where target_id = v_case2 and actor_id = v_mg and action = 'ESCALATE_CASE_ADMIN';
    r := r || jsonb_build_object('t','(관리자 확인) 학년부장의 교장·교감 공유가 audit_logs 에 기록됨','want','1','got',n::text);
    select count(*) into n from public.audit_logs
    where target_id in (v_case, v_case2) and (action in ('REPLY_CASE', 'CONFIRM_REPLY') or action like 'ESCALATE_CASE%');
    r := r || jsonb_build_object('t','(관리자 확인) 답변 2·공유 2(학년부장·교장교감)·학부모 확인 1 이 audit_logs 에 기록됨','want','5','got',n::text);
    select count(*) into n from public.audit_logs where target_id = v_case2 and actor_id = v_ad and action = 'VIEW_CASE';
    r := r || jsonb_build_object('t','(관리자 확인) 관리자 열람이 audit_logs 에 기록됨','want','1','got',n::text);
    select count(*) into n from public.audit_logs where target_id = v_case2 and actor_id = v_mg and action = 'VIEW_CASE';
    r := r || jsonb_build_object('t','(관리자 확인) 학년부장 열람이 audit_logs 에 기록됨','want','1','got',n::text);

    -- =========== 0006: AI 분류(위험도·반복) + 학교 익명 통계 ===========
    -- 분류는 서버(secret 키)만 쓴다 → 여기서는 관리자 권한(reset role)으로 넣어 두고 누가 볼 수 있는지 본다
    reset role;
    insert into public.risk_assessments (case_id, level, llm_level, category, high_risk, rule_signals, reason)
    values (v_case, 2, 2, 'COMPLAINT', false, '{}', '[점검] 불만 제기'),
           (v_case2, 3, 2, 'ADMIN_REVIEW', true, '{VIOLENCE}', '[점검] 신체 폭력 주장');

    reset role; perform pg_temp.login(v_pa);
    select count(*) into n from public.risk_assessments where case_id in (v_case, v_case2);
    r := r || jsonb_build_object('t','학부모A: 내 문의라도 AI 분류(위험도)는 안 보임','want','0','got',n::text);
    begin
      insert into public.risk_assessments (case_id, level, category) values (v_case, 1, 'GENERAL')
      on conflict (case_id) do update set level = 1;
      get diagnostics n = row_count;
      r := r || jsonb_build_object('t','학부모A: AI 분류를 직접 고치기','want','막힘','got', case when n = 0 then '막힘' else '통과됨' end);
    exception when others then
      r := r || jsonb_build_object('t','학부모A: AI 분류를 직접 고치기','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      perform public.school_stats();
      r := r || jsonb_build_object('t','학부모A: 학교 통계 보기','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학부모A: 학교 통계 보기','want','막힘','got','막힘','d',sqlerrm);
    end;

    reset role; perform pg_temp.login(v_t1);
    select count(*) into n from public.risk_assessments where case_id in (v_case, v_case2);
    r := r || jsonb_build_object('t','담임1: 우리 반 문의 2건의 AI 분류가 보임','want','2','got',n::text);
    begin
      update public.risk_assessments set level = 1 where case_id = v_case2;
      get diagnostics n = row_count;
      r := r || jsonb_build_object('t','담임1: AI 분류를 직접 고치기','want','막힘','got', case when n = 0 then '막힘' else '통과됨' end);
    exception when others then
      r := r || jsonb_build_object('t','담임1: AI 분류를 직접 고치기','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      perform public.school_stats();
      r := r || jsonb_build_object('t','담임1: 학교 통계 보기 (교장·교감만)','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','담임1: 학교 통계 보기 (교장·교감만)','want','막힘','got','막힘','d',sqlerrm);
    end;

    reset role; perform pg_temp.login(v_t2);
    select count(*) into n from public.risk_assessments where case_id in (v_case, v_case2);
    r := r || jsonb_build_object('t','담임2: 다른 반 AI 분류는 안 보임','want','0','got',n::text);

    reset role; perform pg_temp.login(v_ad);
    select count(*) into n from public.risk_assessments where case_id = v_case2;
    r := r || jsonb_build_object('t','관리자: 공유받은 문의의 AI 분류는 보임','want','1','got',n::text);
    select count(*) into n from public.risk_assessments where case_id = v_case;
    r := r || jsonb_build_object('t','관리자: 공유받지 않은 문의의 AI 분류는 안 보임','want','0','got',n::text);
    begin
      select (public.school_stats() -> 'all' ->> 'highRisk')::int into n;
      r := r || jsonb_build_object('t','관리자: 학교 통계에 고위험 후보 건수가 들어 있음 (1건 이상)','want','true','got',(n >= 1)::text);
    exception when others then
      r := r || jsonb_build_object('t','관리자: 학교 통계에 고위험 후보 건수가 들어 있음 (1건 이상)','want','true','got','실패','d',sqlerrm);
    end;

    reset role; perform pg_temp.login(v_mg);
    select count(*) into n from public.risk_assessments where case_id = v_case2;
    r := r || jsonb_build_object('t','학년부장: 공유받은 문의의 AI 분류는 보임','want','1','got',n::text);
    begin
      perform public.school_stats();
      r := r || jsonb_build_object('t','학년부장: 학교 통계 보기 (교장·교감만)','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학년부장: 학교 통계 보기 (교장·교감만)','want','막힘','got','막힘','d',sqlerrm);
    end;

    -- =========== 0007: 교장·교감 메모 · 학년별 통계 ===========
    reset role; perform pg_temp.login(v_ad);
    begin
      perform public.add_case_note(v_case2, 'TEACHER', '[점검] 교장·교감 → 담임 메모');
      r := r || jsonb_build_object('t','관리자: 공유받은 문의에 담임 앞 메모 남기기','want','성공','got','성공');
    exception when others then
      r := r || jsonb_build_object('t','관리자: 공유받은 문의에 담임 앞 메모 남기기','want','성공','got','실패','d',sqlerrm);
    end;
    begin
      perform public.add_case_note(v_case, 'TEACHER', '[점검] 공유 안 된 문의에 메모');
      r := r || jsonb_build_object('t','관리자: 공유받지 않은 문의에 메모','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','관리자: 공유받지 않은 문의에 메모','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      perform public.add_case_note(v_case2, 'TEACHER', '   ');
      r := r || jsonb_build_object('t','관리자: 빈 메모','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','관리자: 빈 메모','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      perform public.add_case_note(v_case3, 'MANAGER', '[점검] 교장·교감 → 학년부장 메모 (공유도 같이)');
      select count(*) into n from public.cases where id = v_case3 and shared_manager_at is not null;
      r := r || jsonb_build_object('t','관리자: 학년부장 앞 메모 → 학년부장에게도 공유됨','want','1','got',n::text);
    exception when others then
      r := r || jsonb_build_object('t','관리자: 학년부장 앞 메모 → 학년부장에게도 공유됨','want','1','got','실패','d',sqlerrm);
    end;
    begin
      select jsonb_array_length(public.school_stats() -> 'grades') into n;
      r := r || jsonb_build_object('t','관리자: 학교 통계에 학년별 통계가 들어 있음','want','true','got',(n >= 1)::text);
      select (public.school_stats() -> 'all' ->> 'sentToSchool')::int into n;
      r := r || jsonb_build_object('t','관리자: 학교 전체 통계의 전달 건수 (테스트 3건 이상)','want','true','got',(n >= 3)::text);
    exception when others then
      r := r || jsonb_build_object('t','관리자: 학교 통계에 학년별 통계가 들어 있음','want','true','got','실패','d',sqlerrm);
    end;

    reset role; perform pg_temp.login(v_mg);
    select count(*) into n from public.cases where id = v_case3;
    r := r || jsonb_build_object('t','학년부장: 교장·교감 메모로 공유된 문의가 보임','want','1','got',n::text);
    select count(*) into n from public.case_share_notes where case_id = v_case3 and target = 'MANAGER';
    r := r || jsonb_build_object('t','학년부장: 교장·교감이 남긴 메모가 보임','want','1','got',n::text);
    begin
      perform public.add_case_note(v_case3, 'TEACHER', '[점검] 학년부장 메모');
      r := r || jsonb_build_object('t','학년부장: 메모 남기기 함수 (교장·교감만)','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','학년부장: 메모 남기기 함수 (교장·교감만)','want','막힘','got','막힘','d',sqlerrm);
    end;

    reset role; perform pg_temp.login(v_t1);
    select count(*) into n from public.case_share_notes where case_id = v_case2 and target = 'TEACHER';
    r := r || jsonb_build_object('t','담임1: 교장·교감이 남긴 담임 앞 메모가 보임','want','1','got',n::text);
    begin
      perform public.add_case_note(v_case2, 'MANAGER', '[점검] 담임 메모');
      r := r || jsonb_build_object('t','담임1: 메모 남기기 함수 (교장·교감만)','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','담임1: 메모 남기기 함수 (교장·교감만)','want','막힘','got','막힘','d',sqlerrm);
    end;

    reset role; perform pg_temp.login(v_pa);
    select count(*) into n from public.case_share_notes where case_id in (v_case2, v_case3);
    r := r || jsonb_build_object('t','학부모A: 교장·교감 메모도 안 보임','want','0','got',n::text);

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
    begin
      perform public.reply_to_case(v_case, '[점검] 비로그인 답변');
      r := r || jsonb_build_object('t','비로그인: 답변 함수 호출','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','비로그인: 답변 함수 호출','want','막힘','got','막힘','d',sqlerrm);
    end;
    begin
      perform public.escalate_case(v_case, 'ADMIN');
      r := r || jsonb_build_object('t','비로그인: 관리자 공유 함수 호출','want','막힘','got','통과됨');
    exception when others then
      r := r || jsonb_build_object('t','비로그인: 관리자 공유 함수 호출','want','막힘','got','막힘','d',sqlerrm);
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
  select count(*) into n from public.case_replies;
  r := r || jsonb_build_object('t','(뒷정리) 테스트 답변이 남지 않음','want',v_before_replies::text,'got',n::text);

  insert into _rls_result (no, test, want, got, ok, detail)
  select i, e->>'t', e->>'want', e->>'got', (e->>'want') = (e->>'got'), e->>'d'
  from jsonb_array_elements(r) with ordinality as x(e, i);
end;
$$;

select no, ok, test, want, got, detail from _rls_result order by ok, no;
