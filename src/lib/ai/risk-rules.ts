// 위험 표현 규칙 감지 (기획안 11-5 Rule Engine).
// AI 분류가 위험도를 낮게 잘못 판단할 때를 대비해, 학교에 전달된 요약에서 표현을 따로 찾는다.
// 단어만으로 확정하지 않는다: 결과는 "고위험 후보" 표시일 뿐이고, 정보성 표현(예방교육 등)은 뺀다.
// (학부모 채팅의 긴급 연락처 안내는 safety.ts 가 따로 맡는다 — 바꾸면 eval 의 R 문항이 흔들리므로 분리)

export type RiskSignal =
  | "SELF_HARM" // 자해·자살
  | "VIOLENCE" // 신체 폭력
  | "SEXUAL" // 성폭력·성희롱
  | "THREAT" // 위해·협박 예고
  | "ABUSE_CLAIM" // 아동학대 주장
  | "LEGAL" // 법적 조치·언론 제보 언급
  | "DISCIPLINE"; // 교사 징계·교체 요구

export const SIGNAL_LABEL: Record<RiskSignal, string> = {
  SELF_HARM: "자해·자살 표현",
  VIOLENCE: "신체 폭력 표현",
  SEXUAL: "성폭력·성희롱 표현",
  THREAT: "위해·협박 표현",
  ABUSE_CLAIM: "아동학대 주장",
  LEGAL: "법적 조치·언론 언급",
  DISCIPLINE: "징계·교체 요구",
};

// 안전 관련 신호 → 고위험 후보 (Level 3, high_risk)
export const SAFETY_SIGNALS: RiskSignal[] = ["SELF_HARM", "VIOLENCE", "SEXUAL", "THREAT", "ABUSE_CLAIM"];

const RULES: Record<RiskSignal, RegExp[]> = {
  SELF_HARM: [/죽고\s*싶/, /사라지고\s*싶/, /살기\s*싫/, /자살/, /자해/, /손목을?\s*(긋|그었|그어)/, /뛰어\s*내리/],
  VIOLENCE: [/때렸/, /때린다/, /때려서/, /맞아서\s*(다쳤|멍)/, /밀쳤/, /밀쳐/, /목을?\s*(잡|졸)/, /폭행/, /발로\s*(찼|차)/, /멍이\s*들/],
  SEXUAL: [/성추행/, /성폭력/, /성희롱/, /몸을?\s*만졌/],
  THREAT: [/죽이(겠|고\s*싶|려)/, /가만\s*(두지|안\s*두)/, /찾아가(겠|서)/, /흉기/],
  ABUSE_CLAIM: [/아동\s*학대/, /정서\s*학대/, /학대/],
  LEGAL: [/고소/, /소송/, /변호사/, /경찰에\s*신고/, /신고하(겠|려)/, /언론/, /기자/, /교육청에\s*민원/],
  DISCIPLINE: [/징계/, /담임\s*(교체|바꿔|변경)/, /교체\s*(요구|해\s*주)/],
};

// 정보성·예방 표현은 지우고 본다 ("자살예방교육은 언제 하나요?", "학교폭력 예방 교육")
const BENIGN = [/자살\s*예방/, /폭력\s*예방/, /학대\s*예방/, /성\s*교육/, /예방\s*교육/];

export function detectRiskSignals(text: string): RiskSignal[] {
  const cleaned = BENIGN.reduce((t, re) => t.replace(new RegExp(re, "g"), ""), text);
  return (Object.keys(RULES) as RiskSignal[]).filter((k) => RULES[k].some((re) => re.test(cleaned)));
}

// 규칙이 정하는 최소 위험도: 안전 신호·법적 조치·징계 요구는 Level 3 (관리자 검토 필요), 없으면 Level 1
export function ruleFloor(signals: RiskSignal[]) {
  const highRisk = signals.some((s) => SAFETY_SIGNALS.includes(s));
  const level = signals.length > 0 ? 3 : 1;
  return { level, highRisk };
}
