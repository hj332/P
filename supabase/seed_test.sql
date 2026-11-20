-- =====================================================================
-- 온담 AI — 테스트 데이터 (내부 테스트·시연용, 가상 인물)
--
-- 실행 전에 Supabase 대시보드 → Authentication → Users → "Add user" 에서
-- 아래 4개 이메일로 사용자를 만든다. ("Auto Confirm User" 체크)
--   parent1@example.com   학부모A  (자녀: 박하늘, 3학년 2반)
--   parent2@example.com   학부모B  (자녀: 김바다, 3학년 3반)
--   teacher1@example.com  3학년 2반 담임
--   teacher2@example.com  3학년 3반 담임
-- 그다음 이 파일 전체를 SQL Editor 에서 실행한다. 한 번만 실행할 것.
-- =====================================================================

do $$
declare
  v_school uuid;
  v_c32 uuid;
  v_c33 uuid;
  v_st1 uuid;
  v_st2 uuid;
  v_pa uuid := (select id from auth.users where email = 'parent1@example.com');
  v_pb uuid := (select id from auth.users where email = 'parent2@example.com');
  v_t1 uuid := (select id from auth.users where email = 'teacher1@example.com');
  v_t2 uuid := (select id from auth.users where email = 'teacher2@example.com');
begin
  if v_pa is null or v_pb is null or v_t1 is null or v_t2 is null then
    raise exception '먼저 Authentication → Users 에서 테스트 사용자 4명을 만들어 주세요.';
  end if;

  if exists (select 1 from public.profiles where id in (v_pa, v_pb, v_t1, v_t2)) then
    raise exception '테스트 데이터가 이미 들어가 있습니다.';
  end if;

  insert into public.schools (name) values ('온담초등학교') returning id into v_school;

  insert into public.classes (school_id, grade, class_no) values (v_school, 3, 2) returning id into v_c32;
  insert into public.classes (school_id, grade, class_no) values (v_school, 3, 3) returning id into v_c33;

  insert into public.students (school_id, class_id, name) values (v_school, v_c32, '박하늘') returning id into v_st1;
  insert into public.students (school_id, class_id, name) values (v_school, v_c33, '김바다') returning id into v_st2;

  insert into public.profiles (id, school_id, role, display_name) values
    (v_pa, v_school, 'PARENT',  '박하늘 학부모'),
    (v_pb, v_school, 'PARENT',  '김바다 학부모'),
    (v_t1, v_school, 'TEACHER', '3학년 2반 담임'),
    (v_t2, v_school, 'TEACHER', '3학년 3반 담임');

  insert into public.student_relations (parent_id, student_id) values (v_pa, v_st1), (v_pb, v_st2);

  insert into public.teacher_classes (teacher_id, class_id, is_homeroom) values (v_t1, v_c32, true), (v_t2, v_c33, true);

  raise notice '테스트 데이터를 넣었습니다.';
end;
$$;
