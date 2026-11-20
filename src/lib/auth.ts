import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type Role = "PARENT" | "TEACHER" | "MANAGER" | "ADMIN";

// 로그인 사용자와 프로필을 가져온다. 역할이 맞지 않으면 알맞은 화면으로 보낸다.
// (화면 이동용 확인일 뿐, 데이터 접근은 DB의 RLS가 막는다.)
export async function requireRole(allowed: Role[]) {
  // 로그인 화면은 요청마다 새로 그린다. (Supabase 가 내부에서 Date.now() 를 써서,
  //  이게 없으면 Next.js 16 이 미리 그리기(prerender) 중 오류를 낸다.)
  await connection();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, display_name, school_id")
    .eq("id", auth.user.id)
    .single();
  if (!profile) redirect("/login");

  if (!allowed.includes(profile.role as Role)) {
    redirect(profile.role === "PARENT" ? "/parent" : "/teacher");
  }

  return { supabase, profile };
}
