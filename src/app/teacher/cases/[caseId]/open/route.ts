import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /teacher/cases/[caseId]/open — 교사가 Case 상세를 실제로 열었을 때 브라우저가 부른다.
// DB 함수 open_case() 가 (1) 배정받은 담임 + 담당 학급 학생인지 확인하고
// (2) audit_logs 에 열람 기록(VIEW_CASE)을 남기고 (3) NEW → TEACHER_REVIEWING 으로 바꾼다.
// (서버 함수(Server Action)는 화면이 막 뜬 순간에 부르면 Next.js 가 버리는 경우가 있어 일반 요청으로 받는다)
export async function POST(_req: Request, ctx: RouteContext<"/teacher/cases/[caseId]/open">) {
  const { caseId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(caseId)) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ ok: false }, { status: 401 });

  // 권한 확인은 open_case() 안에서 RLS 와 같은 기준으로 한다 (배정 + 담당 학급이 아니면 오류)
  const { error } = await supabase.rpc("open_case", { p_case_id: caseId });
  if (error) {
    console.error("[open_case]", error.message);
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
