// 학교 자료(문서) — 종류·조각 나누기. 서버·브라우저·스크립트가 함께 쓴다 (기획안 11-3, 13장).
// DB: documents / document_chunks (0008_documents_rag.sql)

export type DocScope = "SCHOOL" | "CLASS" | "LEGAL";

export const SCOPE_LABEL: Record<DocScope, string> = {
  SCHOOL: "학교 자료",
  CLASS: "학급 자료",
  LEGAL: "교육·법률 자료",
};

export const DOC_TITLE_MAX = 100;
export const DOC_SOURCE_MAX = 150;
export const DOC_BODY_MAX = 20_000;

// 검색용 조각: 문단 단위로 묶어 400~700자 정도로 나눈다. 조각마다 문서 제목을 앞에 붙여 검색이 잘 되게 한다.
// (문서 전체를 AI 에 넣지 않고, 질문과 비슷한 조각만 넣기 위해 — 기획안 11-3)
const TARGET = 600;
const HARD_MAX = 900;

export function chunkDocument(title: string, body: string): string[] {
  const paras = body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const pieces: string[] = [];
  for (const p of paras) {
    if (p.length <= HARD_MAX) {
      pieces.push(p);
      continue;
    }
    // 아주 긴 문단은 줄 단위로, 그래도 길면 글자 수로 자른다
    let buf = "";
    for (const line of p.split("\n")) {
      for (let i = 0; i < line.length; i += HARD_MAX) {
        const part = line.slice(i, i + HARD_MAX);
        if (buf && buf.length + part.length + 1 > TARGET) {
          pieces.push(buf);
          buf = "";
        }
        buf = buf ? `${buf}\n${part}` : part;
      }
    }
    if (buf) pieces.push(buf);
  }

  const chunks: string[] = [];
  let cur = "";
  for (const piece of pieces) {
    if (cur && cur.length + piece.length + 2 > TARGET) {
      chunks.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n\n${piece}` : piece;
  }
  if (cur) chunks.push(cur);
  return chunks.map((c) => `[${title}]\n${c}`);
}

// 조각 앞에 붙인 "[제목]" 줄을 떼고 본문만 (화면 표시용)
export function chunkBody(content: string) {
  return content.replace(/^\[[^\]\n]*\]\n/, "");
}

// 검색 결과 중 AI 에 넘길 조각 고르기 (2026-11-25 보정: gemini-embedding-001 768차원, 가상 학교 자료 10개 기준)
//   맞는 문서 0.72~0.80 / 관계없는 문서 0.63~0.69 / 인사("안녕하세요") 최고 0.65
//   → 0.70 이상은 최대 3개. 없으면 1등이 0.64 이상이고 2등보다 0.03 이상 높을 때만 1등 하나.
// (2026-11-25 법률 자료 4개 추가 후 다시 보정) 관련 자료 둘이 0.68 근처에서 비등하면 아무것도 못 고르고,
//   1등이 0.75 이상일 때 0.70 짜리 엉뚱한 자료가 따라 붙는 문제 → 1등이 0.68 이상이면 "1등 - 0.03" 이상만 (최대 3개).
//   인사·감정 이야기는 최고 0.65 라 영향 없음.
export const MATCH_STRONG = 0.68;
export const MATCH_WINDOW = 0.03;
export const MATCH_WEAK = 0.64;
export const MATCH_MARGIN = 0.03;

// docOf: 조각이 어느 문서 것인지 (같은 문서의 다른 조각은 "2등 경쟁 상대"로 치지 않는다)
export function pickRelevant<T extends { similarity: number }>(
  rows: T[],
  max = 3,
  docOf: (r: T) => string = (r) => String((r as { documentId?: string; key?: string }).documentId ?? (r as { key?: string }).key ?? ""),
): T[] {
  const sorted = [...rows].sort((a, b) => b.similarity - a.similarity);
  // 1등이 MATCH_STRONG 이상이면: 1등과 MATCH_WINDOW 안쪽인 것만 (뒤따라 붙는 엉뚱한 자료를 빼려고)
  const top = sorted[0]?.similarity ?? 0;
  if (top >= MATCH_STRONG) {
    const cut = Math.max(MATCH_STRONG, top - MATCH_WINDOW);
    return sorted.filter((r) => r.similarity >= cut).slice(0, max);
  }
  const [first] = sorted;
  const second = sorted.find((r) => docOf(r) !== docOf(first));
  if (first && first.similarity >= MATCH_WEAK && first.similarity - (second?.similarity ?? 0) >= MATCH_MARGIN) return [first];
  return [];
}

// 신고·고소 이야기에 꼭 함께 보여 줄 교육·법률 자료 (2026-11-25 사용자 요청 — 온담의 목표는 교권 보호)
//   - 선생님·학교 관계자를 신고·고소하는 이야기 → 허위 신고(무고) 자료
//   - 아동학대 신고·고소 이야기 → 아동학대 기준 자료도 함께
// 자료 제목이 바뀌어도 찾을 수 있게 고정된 검색 문장으로 찾는다 (doc-search.ts searchLegalDocs).
export const LEGAL_QUERIES = {
  FALSE_REPORT: "허위 신고 무고죄 형사처분 징계처분 목적 교육활동 침해 교원 보호",
  CHILD_ABUSE: "아동학대의 뜻 아동복지법 신체적 정서적 학대 금지행위 수사기관 지방자치단체 조사 판단",
} as const;
export type LegalNeed = keyof typeof LEGAL_QUERIES;

export function legalNeeds(text: string): LegalNeed[] {
  const report = /신고|고소|고발/.test(text);
  if (!report) return [];
  const abuse = /학대/.test(text);
  // "학교폭력 신고"(친구 사이 일)는 무고 안내 대상이 아니므로 "학교" 는 넣지 않는다
  const aboutStaff = abuse || /선생님|교사|담임|교장|교감|교직원/.test(text);
  const needs: LegalNeed[] = [];
  if (abuse) needs.push("CHILD_ABUSE");
  if (aboutStaff) needs.push("FALSE_REPORT");
  return needs;
}

// AI 답변이 근거로 쓴 자료 (messages.sources). 학부모 화면의 근거 카드에 쓴다.
export type SourceRef = { documentId: string; title: string; source: string; isSample: boolean };

// 상담 AI 가 답변 끝에 붙이는 근거 표시: [[근거:1,2]] → 몇 번째 자료를 썼는지 (1부터)
const SOURCE_MARKER = /\[\[\s*근거\s*[:：]\s*([\d,\s]+)\]\]/g;

export function extractSourceMarker(content: string): { text: string; indices: number[] } {
  const indices = new Set<number>();
  for (const m of content.matchAll(SOURCE_MARKER)) {
    for (const n of m[1].split(",")) {
      const i = Number(n.trim());
      if (Number.isInteger(i) && i >= 1) indices.add(i);
    }
  }
  return { text: content.replace(SOURCE_MARKER, "").trimEnd(), indices: [...indices].sort((a, b) => a - b) };
}

// 답변이 근거로 쓴 자료 고르기: [[근거:n]] 표시가 우선, 표시가 없으면 답변에 자료 제목이 그대로 나온 자료.
// (2026-11-25 브라우저 확인: AI 가 표시 대신 "(2026학년도 교외체험학습 운영 안내)" 처럼 제목만 쓴 경우가 있었음)
export function citedDocs<T extends { documentId: string; title: string }>(reply: string, indices: number[], docs: T[]): T[] {
  const byMarker = indices.map((i) => docs[i - 1]).filter((d): d is T => !!d);
  // 제목 끝의 괄호 부분은 빼고 말하는 경우가 많다 ("아동학대 관련 법률 기준 요약 (아동복지법·…)" → "아동학대 관련 법률 기준 요약")
  const mentioned = (title: string) => {
    const short = title.replace(/\s*[(（][^)）]*[)）]\s*$/, "").trim();
    return (title.length >= 4 && reply.includes(title)) || (short.length >= 8 && reply.includes(short));
  };
  const picked = byMarker.length ? byMarker : docs.filter((d) => mentioned(d.title));
  const seen = new Set<string>();
  return picked.filter((d) => !seen.has(d.documentId) && !!seen.add(d.documentId));
}
