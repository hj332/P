-- =====================================================================
-- 온담 AI — 테스트 관리자 계정 (가상 인물)
--
-- 실행 전에 Supabase 대시보드 → Authentication → Users → "Add user" 에서 ("Auto Confirm User" 체크)
--   admin1@example.com   교장·교감 선생님 공동 계정 (ADMIN)
--   admin2@example.com   3학년 부장 선생님 (MANAGER, 3학년 담당)
-- 를 만든다. 그다음 seed_test.sql, 0003, 0004 를 실행한 뒤 이 파일 전체를 SQL Editor 에서 실행한다.
-- 여러 번 실행해도 된다. (이미 있으면 이름·역할만 아래 값으로 맞춘다)
-- 결과 표에 두 계정이 나오면 성공.
-- =====================================================================

do $$
declare
  v_admin uuid := (select id from auth.users where email = 'admin1@example.com');
  v_manager uuid := (select id from auth.users where email = 'admin2@example.com');
  v_school uuid := (
    select p.school_id from public.profiles p
    join auth.users u on u.id = p.id
    where u.email = 'teacher1@example.com'
  );
begin
  if v_admin is null or v_manager is null then
    raise exception '먼저 Authentication → Users 에서 admin1@example.com, admin2@example.com 사용자를 만들어 주세요.';
  end if;
  if v_school is null then
    raise exception 'seed_test.sql 을 먼저 실행해 주세요.';
  end if;
  if to_regclass('public.manager_grades') is null then
    raise exception '0004_manager_escalation.sql 을 먼저 실행해 주세요.';
  end if;

  insert into public.profiles (id, school_id, role, display_name)
  values (v_admin, v_school, 'ADMIN', '교장·교감 선생님')
  on conflict (id) do update set role = excluded.role, display_name = excluded.display_name;

  insert into public.profiles (id, school_id, role, display_name)
  values (v_manager, v_school, 'MANAGER', '3학년 부장 선생님')
  on conflict (id) do update set role = excluded.role, display_name = excluded.display_name;

  insert into public.manager_grades (manager_id, grade) values (v_manager, 3)
  on conflict do nothing;
end;
$$;

select u.email as "계정", p.role as "역할", p.display_name as "이름",
       (select string_agg(grade::text || '학년', ', ') from public.manager_grades where manager_id = p.id) as "담당 학년"
from public.profiles p join auth.users u on u.id = p.id
where u.email in ('admin1@example.com', 'admin2@example.com')
order by u.email;
