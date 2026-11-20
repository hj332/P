import "server-only";
import { GoogleGenAI, type Schema } from "@google/genai";

// Gemini 호출. API 키는 서버에서만 읽는다 (NEXT_PUBLIC_ 을 붙이지 않는다).
// 무료(Unpaid) 등급은 Google 이 입력·출력을 사람이 검토하고 제품 개선에 쓸 수 있다.
// → 실제 학부모·학생 정보는 넣지 말고 가상의 시연 데이터로만 쓴다.
//
// 무료 등급은 모델이 붐비면 503 을 자주 돌려준다. 그래서 순서대로 시도하고,
// 한 모델이 바쁘거나(503) 없거나(404) 너무 느리면(시간 초과) 다음 모델로 넘어간다.
// GEMINI_MODEL 을 쉼표로 적으면 그 순서를 쓴다. 예) GEMINI_MODEL=gemini-3.8-flash,gemini-3.5-flash-lite
// (2026-11-19 확인: 2.5-flash 는 신규 사용자 불가, flash-latest 별칭 없음, 3.8/3.7-flash 는 자주 503,
//  3.5-flash-lite 는 빠르고 안정적)
// (2026-11-20 확인: lite 도 붐빌 때는 10초 안팎, 3.8-flash 는 40초 넘게 응답 없음)
//  → lite 를 한 번 더 시도하는 쪽이 3.8-flash 로 넘어가는 것보다 낫다.
const DEFAULT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash-lite"];
const ENV_MODELS = (process.env.GEMINI_MODEL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MODELS = ENV_MODELS.length ? ENV_MODELS : DEFAULT_MODELS;
// 앞쪽 모델은 짧게 기다리고 넘어가고, 마지막 모델만 길게 기다린다.
const FIRST_TRY_TIMEOUT_MS = 20_000;
const LAST_TRY_TIMEOUT_MS = 25_000;

let client: GoogleGenAI | null = null;
function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError("NO_KEY");
  // SDK 기본값은 실패 시 최대 5번, 길게는 1분씩 기다리며 재시도한다 → 끄고 직접 다음 모델로 넘긴다.
  client ??= new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
  return client;
}

export class GeminiError extends Error {
  constructor(public kind: "NO_KEY" | "QUOTA" | "BUSY" | "BLOCKED" | "EMPTY" | "OTHER", detail?: string) {
    super(detail ? `${kind}: ${detail}` : kind);
  }
}

export type ChatTurn = { role: "parent" | "assistant"; content: string };

type GenerateOptions = {
  systemPrompt: string;
  history: ChatTurn[];
  temperature?: number;
  maxOutputTokens?: number;
  // 주면 JSON 으로만 답하게 한다 (요약 등)
  jsonSchema?: Schema;
};

export async function generateText(opts: GenerateOptions): Promise<string> {
  const ai = getClient();
  const contents = opts.history.map((m) => ({
    role: m.role === "parent" ? "user" : "model",
    parts: [{ text: m.content }],
  }));

  let last: GeminiError = new GeminiError("OTHER", "no model tried");
  for (const [i, model] of MODELS.entries()) {
    const timeout = i === MODELS.length - 1 ? LAST_TRY_TIMEOUT_MS : FIRST_TRY_TIMEOUT_MS;
    try {
      const res = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: opts.systemPrompt,
          temperature: opts.temperature ?? 0.6,
          maxOutputTokens: opts.maxOutputTokens ?? 2048,
          abortSignal: AbortSignal.timeout(timeout),
          ...(opts.jsonSchema ? { responseMimeType: "application/json", responseSchema: opts.jsonSchema } : {}),
        },
      });
      const text = res.text?.trim();
      if (text) return text;
      const reason = res.promptFeedback?.blockReason ?? res.candidates?.[0]?.finishReason;
      // 안전 필터로 막힌 것은 다른 모델로 넘겨도 같으므로 바로 끝낸다.
      if (res.promptFeedback?.blockReason) throw new GeminiError("BLOCKED", String(reason));
      last = new GeminiError("EMPTY", `${model}: ${reason ?? ""}`);
    } catch (e) {
      if (e instanceof GeminiError && e.kind === "BLOCKED") throw e;
      last = classify(model, e);
      console.warn(`[gemini] ${model} 실패 → 다음 모델`, last.message.slice(0, 200));
    }
  }
  throw last;
}

// 학부모 상담 답변
export function generateCounselorReply(systemPrompt: string, history: ChatTurn[]) {
  return generateText({ systemPrompt, history });
}

// 사용자에게 보여 줄 실패 안내
export function geminiFailMessage(e: unknown): string {
  const kind = e instanceof GeminiError ? e.kind : "OTHER";
  if (kind === "NO_KEY") return "AI 설정(GEMINI_API_KEY)이 아직 안 되어 있어요.";
  if (kind === "QUOTA") return "무료 사용량을 넘었어요. 1~2분 뒤 다시 시도해 주세요.";
  if (kind === "BUSY") return "지금 AI 사용자가 많아 답변이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.";
  return "AI 답변을 받지 못했어요. 잠시 후 다시 시도해 주세요.";
}

function classify(model: string, e: unknown): GeminiError {
  if (e instanceof GeminiError) return e;
  const msg = `${model}: ${e instanceof Error ? `${e.name} ${e.message}` : String(e)}`;
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) return new GeminiError("QUOTA", msg);
  if (/503|UNAVAILABLE|high demand|overloaded|Timeout|aborted/i.test(msg)) return new GeminiError("BUSY", msg);
  return new GeminiError("OTHER", msg);
}
