import "server-only";
import { embedTexts, toPgVector } from "@/lib/ai/embed";
import { LEGAL_QUERIES, pickRelevant, type DocScope, type LegalNeed } from "@/lib/documents";
import type { requireRole } from "@/lib/auth";

// 학교 자료 검색 (기획안 11-3). 부르는 사람의 권한(RLS)으로 match_document_chunks 를 부르므로
// 학부모는 우리 학교 자료 + 자녀 반 자료에서만, 교사는 자기가 볼 수 있는 자료에서만 찾는다.

type Supa = Awaited<ReturnType<typeof requireRole>>["supabase"];

export type FoundDoc = {
  documentId: string;
  title: string;
  source: string;
  scope: DocScope;
  isSample: boolean;
  content: string;
  similarity: number;
};

// 검색이 실패해도(임베딩 혼잡 등) 상담은 계속되어야 하므로 빈 목록을 돌려준다.
export async function searchDocuments(supabase: Supa, text: string, classId: string | null, max = 3): Promise<FoundDoc[]> {
  const q = text.trim().slice(0, 2000);
  if (!q) return [];
  try {
    const [vec] = await embedTexts([q], "QUERY");
    return pickRelevant(await matchChunks(supabase, vec, classId), max);
  } catch (e) {
    console.error("[doc search]", e instanceof Error ? e.message.slice(0, 160) : e);
    return [];
  }
}

// 신고·고소 이야기에 꼭 함께 보여 줄 교육·법률 자료 (documents.ts LEGAL_QUERIES / legalNeeds).
// 고정 검색 문장마다 1등 교육·법률 자료 하나. 2026-11-25 측정: 맞는 자료 0.79~0.81, 다른 자료 0.69 이하 → 0.72 이상만.
const LEGAL_MIN = 0.72;
export async function searchLegalDocs(supabase: Supa, needs: LegalNeed[]): Promise<FoundDoc[]> {
  if (!needs.length) return [];
  try {
    const vecs = await embedTexts(needs.map((n) => LEGAL_QUERIES[n]), "QUERY");
    const out: FoundDoc[] = [];
    for (const vec of vecs) {
      const top = (await matchChunks(supabase, vec, null)).find((r) => r.scope === "LEGAL");
      if (top && top.similarity >= LEGAL_MIN && !out.some((d) => d.documentId === top.documentId)) out.push(top);
    }
    return out;
  } catch (e) {
    console.error("[legal doc search]", e instanceof Error ? e.message.slice(0, 160) : e);
    return [];
  }
}

async function matchChunks(supabase: Supa, vec: number[], classId: string | null): Promise<FoundDoc[]> {
  const { data, error } = await supabase.rpc("match_document_chunks", {
    p_query: toPgVector(vec),
    p_class_id: classId,
    p_count: 8,
  });
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as {
    document_id: string;
    title: string;
    source: string;
    scope: DocScope;
    is_sample: boolean;
    content: string;
    similarity: number;
  }[]).map((r) => ({
    documentId: r.document_id,
    title: r.title,
    source: r.source,
    scope: r.scope,
    isSample: r.is_sample,
    content: r.content,
    similarity: Number(r.similarity),
  }));
  return rows;
}
