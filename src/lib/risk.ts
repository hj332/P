// 위험도·반복 문의 표시 (교직원 화면). DB: risk_assessments (0006, 3단계는 0007). 학부모에게는 보이지 않는다.
import { SIGNAL_LABEL, type RiskSignal } from "@/lib/ai/risk-rules";

export type Risk = {
  level: number; // 1 일반 문의·상담 / 2 불만·민원 / 3 관리자 검토 필요
  aiDone: boolean; // false = AI 분류 실패, 규칙(표현) 감지 결과만 있음
  highRisk: boolean;
  signals: RiskSignal[];
  reason: string;
  repeatOf: string | null;
  repeatHasReply: boolean;
  repeatNewFacts: boolean | null;
};

export const LEVEL_LABEL: Record<number, string> = {
  1: "일반 문의·상담",
  2: "불만·민원",
  3: "관리자 검토 필요",
};

// DESIGN.md 3장: 상태색은 항상 아이콘·라벨과 함께. 고위험=danger(따로 칩), 불만·민원·관리자 검토=warn, 일반=ok
export function levelChip(r: Risk) {
  const tone = r.level >= 2 ? "bg-warn-bg text-warn-fg" : "bg-ok-bg text-ok-fg";
  return { text: `Level ${r.level} · ${LEVEL_LABEL[r.level] ?? ""}`, tone };
}

export function signalLabels(r: Risk) {
  return r.signals.map((s) => SIGNAL_LABEL[s] ?? s);
}

// 반복 문의 때문에 Level 3 이 된 경우 (이전 답변이 있었고 새로운 사실이 없음)
export function repeatEscalated(r: Risk) {
  return !!r.repeatOf && r.repeatHasReply && r.repeatNewFacts === false;
}

export function parseRisk(row: unknown): Risk | null {
  const r = (Array.isArray(row) ? row[0] : row) as Record<string, unknown> | null | undefined;
  if (!r || typeof r.level !== "number") return null;
  return {
    level: Math.min(3, Math.max(1, r.level)),
    aiDone: r.llm_level !== null && r.llm_level !== undefined,
    highRisk: !!r.high_risk,
    signals: (r.rule_signals as RiskSignal[]) ?? [],
    reason: (r.reason as string) ?? "",
    repeatOf: (r.repeat_of as string | null) ?? null,
    repeatHasReply: !!r.repeat_has_reply,
    repeatNewFacts: (r.repeat_new_facts as boolean | null) ?? null,
  };
}
