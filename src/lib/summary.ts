// 상담 요약의 모양. 화면(학부모 수정), 서버(AI 생성·검증), 교사 업무함이 함께 쓴다.
// DB: conversations.summary_draft (학부모만), cases.final_summary (전달 동의 후 교사에게).
// 기획안 15장 "사실 / 해석 / 요구사항 분리" + design/screens/ParentSummary.html 의 행 구성.

export type Summary = {
  topic: string;          // 상담 주제 (한 줄)
  facts: string;          // 있었던 일 — 학부모·아이가 말한 사실
  interpretation: string; // 학부모님이 느끼신 점 — 감정·해석
  unknowns: string;       // 아직 확인되지 않은 부분
  requests: string;       // 학부모님이 원하는 것
};

export type SummaryKey = keyof Summary;

export const SUMMARY_ROWS: { key: SummaryKey; label: string; tag?: "사실" | "해석" | "요구" }[] = [
  { key: "topic", label: "상담 주제" },
  { key: "facts", label: "있었던 일", tag: "사실" },
  { key: "interpretation", label: "학부모님이 느끼신 점", tag: "해석" },
  { key: "unknowns", label: "아직 확인되지 않은 부분" },
  { key: "requests", label: "학부모님이 원하는 것", tag: "요구" },
];

export const SUMMARY_KEYS = SUMMARY_ROWS.map((r) => r.key);
export const SUMMARY_MAX = { topic: 80, other: 1000 };

// 바깥(브라우저·AI)에서 온 값을 요약 모양으로 정리한다. 모양이 틀리면 null.
export function parseSummary(input: unknown): Summary | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const out = {} as Summary;
  for (const k of SUMMARY_KEYS) {
    const v = o[k];
    if (typeof v !== "string") return null;
    const max = k === "topic" ? SUMMARY_MAX.topic : SUMMARY_MAX.other;
    out[k] = v.trim().slice(0, max);
  }
  if (!out.topic) return null;
  return out;
}

// 상담 AI 가 "정리 단계"에 왔다고 알리는 표시. AI 답변 맨 끝에 붙고, DB 에는 그대로 저장된다.
// 화면·AI 대화 기록·요약 AI 에 넘길 때는 splitSummaryMarker 로 떼어 낸다.
export const SUMMARY_MARKER = "[[정리제안]]";
const MARKER_SOURCE = String.raw`\[\[\s*정리\s*제안\s*\]\]`;

export function splitSummaryMarker(content: string): { text: string; suggestSummary: boolean } {
  const suggestSummary = new RegExp(MARKER_SOURCE).test(content);
  if (!suggestSummary) return { text: content, suggestSummary };
  return { text: content.replace(new RegExp(MARKER_SOURCE, "g"), "").trimEnd(), suggestSummary };
}

// DB 메시지 → 화면용: 표시를 떼어 내고 suggestSummary 로 바꾼다.
// AI 가 지침을 어기고 마크다운(**굵게**, # 제목)을 쓰면 기호만 지워서 보여 준다.
export function withSummaryFlag<T extends { content: string }>(row: T): T & { suggestSummary: boolean } {
  const { text, suggestSummary } = splitSummaryMarker(row.content);
  const plain = text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, "");
  return { ...row, content: plain, suggestSummary };
}

// 상담 상태 → 화면 표시 (design/DESIGN.md 2장)
export const OPEN_STATUSES = ["ACTIVE", "WAITING_FOR_PARENT", "SUMMARY_READY", "CONSENT_PENDING"] as const;
export type ConversationStatus =
  | (typeof OPEN_STATUSES)[number]
  | "CLOSED_AI"
  | "CONSENTED"
  | "CASE_CREATED";

export function isOpen(status: string) {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}

export function statusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
    case "WAITING_FOR_PARENT":
      return "상담 중";
    case "SUMMARY_READY":
    case "CONSENT_PENDING":
      return "요약 확인 중";
    case "CLOSED_AI":
      return "상담만 종료";
    case "CONSENTED":
    case "CASE_CREATED":
      return "학교 전달 완료";
    default:
      return status;
  }
}
