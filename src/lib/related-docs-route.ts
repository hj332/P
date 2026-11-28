import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchDocuments } from "@/lib/doc-search";
import { chunkBody } from "@/lib/documents";
import { parseSummary } from "@/lib/summary";
import { makeDocQuery } from "@/lib/ai/doc-query";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /teacher/cases/[caseId]/related, /admin/cases/[caseId]/related — 교사 업무함 상세의 "관련 학교 자료" (v2 C).
// 학부모가 확인한 요약(주제·있었던 일·요청)으로 학교 자료를 찾는다. 대화 원문은 쓰지 않는다.
// 문의도 자료도 부르는 사람의 권한(RLS)으로 읽는다 → 볼 수 없는 문의면 404, 볼 수 없는 자료는 결과에 안 나온다.
export async function handleRelatedDocs(caseId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(caseId)) return NextResponse.json({ docs: [] }, { status: 400 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ docs: [] }, { status: 401 });

  const { data: kase } = await supabase
    .from("cases")
    .select("final_summary, students(class_id)")
    .eq("id", caseId)
    .maybeSingle();
  const summary = parseSummary(kase?.final_summary);
  if (!kase || !summary) return NextResponse.json({ docs: [] }, { status: 404 });

  const classId = (kase.students as unknown as { class_id: string } | null)?.class_id ?? null;

  // 검색어: 분류 AI 가 만든 "규정 말투" 검색어(0009) → 없으면(예전 문의) 지금 만들어 저장 → 그것도 실패하면 요약 그대로
  const { data: risk } = await supabase.from("risk_assessments").select("doc_query").eq("case_id", caseId).maybeSingle();
  let query = risk?.doc_query ?? null;
  if (!query) {
    query = await makeDocQuery(summary);
    // 권한은 위에서 RLS 로 확인했다(이 사람이 볼 수 있는 문의). 분류 결과는 서버만 쓰므로 secret 키로 저장.
    if (query && risk) await createAdminClient().from("risk_assessments").update({ doc_query: query }).eq("case_id", caseId);
  }
  const found = await searchDocuments(supabase, query ?? `${summary.topic}\n${summary.facts}\n${summary.requests}`, classId, 3);
  return NextResponse.json({
    docs: found.map((d) => ({
      documentId: d.documentId,
      title: d.title,
      source: d.source,
      scope: d.scope,
      isSample: d.isSample,
      excerpt: chunkBody(d.content).slice(0, 360),
    })),
  });
}
