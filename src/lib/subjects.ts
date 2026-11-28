// 문의 주제 분야 (v2 D 통계, 0010) — 분류 AI 가 정하고 교장·교감 통계에서 건수만 센다.
// 화면·서버·평가가 같이 쓰므로 server-only 가 아니다.
export const SUBJECTS = ["PEER", "GUIDANCE", "LEARNING", "SAFETY", "SCHOOL_LIFE", "OTHER"] as const;
export type Subject = (typeof SUBJECTS)[number];

export const SUBJECT_LABEL: Record<Subject, string> = {
  PEER: "교우관계",
  GUIDANCE: "생활지도·훈육",
  LEARNING: "학습·숙제·평가",
  SAFETY: "안전·건강",
  SCHOOL_LIFE: "학교 행사·행정",
  OTHER: "기타",
};

export const isSubject = (v: unknown): v is Subject => typeof v === "string" && (SUBJECTS as readonly string[]).includes(v);
