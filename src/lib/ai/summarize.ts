import "server-only";
import { Type, type Schema } from "@google/genai";
import { generateText, GeminiError, type ChatTurn } from "./gemini";
import { parseSummary, type Summary } from "@/lib/summary";

// 상담 요약 AI (기획안 11-4 ⑤⑦⑧: 사실/감정/해석/요구 분리 → 학부모 확인용 요약).
// 상담 AI 와 분리된 별도 호출이다. 대화하지 않고, 정리만 한다.

const SYSTEM = `너는 학부모 사전상담 대화를 정리하는 도우미다. 대화에 답하지 말고, 아래 JSON 만 만든다.
이 요약은 학부모가 먼저 읽고 고친 뒤, 동의하면 담임 선생님께 그대로 전달된다.

## 칸별 내용
- topic: 상담 주제를 15~30자 한 줄로. 예) "수업 중 공개 지적에 대한 확인 요청"
- facts: 있었던 일. 학부모와 아이가 말한 사실만. 누가 말했는지 밝힌다. 예) "아이는 수업 중 친구와 이야기하다 선생님께 지적받았다고 함."
- interpretation: 학부모님이 느끼신 점·걱정·해석. 감정과 해석은 여기에만 쓴다.
- unknowns: 대화만으로는 확인되지 않은 부분. 예) 당시 교실 상황, 선생님의 지도 이유.
- requests: 학부모님이 학교에 원하는 것. 분명히 말하지 않았다면 대화에서 드러난 범위만 쓰고 "확인이 필요해요"라고 덧붙인다.

## 규칙
- 대화에 나오지 않은 내용은 절대 지어내지 않는다. 해당 내용이 없으면 "대화에서 나오지 않았어요." 라고 쓴다.
- 교사·학생·학부모의 잘잘못을 판단하거나 "아동학대", "부당한 지도" 같은 결론을 쓰지 않는다. 학부모가 그렇게 말했다면 "학부모님은 ~라고 걱정하심" 으로 쓴다.
- 사실(facts) 칸에 감정·추측을 섞지 않는다.
- 문장은 짧게, "~했다고 함", "~를 원하심" 처럼 끝맺는다. 칸마다 1~3문장.
- 아이 이름은 대화에 나왔더라도 쓰지 않는다 ("아이"로 쓴다).
- 긴급 연락처 안내 문구(112·119·109)는 요약에 넣지 않는다.
- 상담 AI 의 질문이나 안내는 요약하지 않는다. 학부모가 말한 내용이 중심이다.`;

const SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    topic: { type: Type.STRING },
    facts: { type: Type.STRING },
    interpretation: { type: Type.STRING },
    unknowns: { type: Type.STRING },
    requests: { type: Type.STRING },
  },
  required: ["topic", "facts", "interpretation", "unknowns", "requests"],
  propertyOrdering: ["topic", "facts", "interpretation", "unknowns", "requests"],
};

export async function summarizeConversation(history: ChatTurn[]): Promise<Summary> {
  // 대화 전체를 하나의 글로 넘긴다 (요약 AI 가 대화를 "이어가지" 않도록).
  const transcript = history
    .map((m) => `${m.role === "parent" ? "학부모" : "상담 AI"}: ${m.content}`)
    .join("\n\n");

  const raw = await generateText({
    systemPrompt: SYSTEM,
    history: [{ role: "parent", content: `다음 상담 대화를 정리해 주세요.\n\n---\n${transcript}\n---` }],
    temperature: 0.2,
    maxOutputTokens: 2048,
    jsonSchema: SCHEMA,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GeminiError("EMPTY", "summary JSON parse failed");
  }
  const summary = parseSummary(parsed);
  if (!summary) throw new GeminiError("EMPTY", "summary shape invalid");
  return summary;
}
