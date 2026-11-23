import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /teacher/cases/[caseId]/open, /admin/cases/[caseId]/open 의 공통 처리.
// 교사·관리자가 Case 상세를 실제로 열었을 때 브라우저가 부른다.
// DB 함수 open_case() 가
//   담임(배정 + 담당 학급): 열람 기록(VIEW_CASE) + NEW → TEACHER_REVIEWING
//   관리자(이관받은 사람): 열람 기록(VIEW_CASE) + ESCALATED → ADMIN_REVIEWING
// 을 하고, 둘 다 아니면 오류를 낸다.
// (서버 함수(Server Action)는 화면이 막 뜬 순간에 부르면 Next.js 가 버리는 경우가 있어 일반 요청으로 받는다)
export async function handleOpenCase(caseId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(caseId)) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ ok: false }, { status: 401 });

  const { error } = await supabase.rpc("open_case", { p_case_id: caseId });
  if (error) {
    console.error("[open_case]", error.message);
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
