import "server-only";
import { GoogleGenAI } from "@google/genai";
import { GeminiError } from "./gemini";

// 문서 검색(RAG)용 임베딩 (기획안 11-3). 2026-11-25 확인: 이 키로 gemini-embedding-001 사용 가능, 768차원, 1회 약 0.5초.
// 차원은 DB(document_chunks.embedding vector(768))와 꼭 같아야 한다.
export const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
export const EMBED_DIM = 768;

let client: GoogleGenAI | null = null;
function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError("NO_KEY");
  client ??= new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
  return client;
}

// DOCUMENT: 등록할 문서 조각 / QUERY: 학부모 질문·문의 요약 (검색 쪽)
export async function embedTexts(texts: string[], kind: "DOCUMENT" | "QUERY"): Promise<number[][]> {
  if (!texts.length) return [];
  const ai = getClient();
  const out: number[][] = [];
  // 한 번에 최대 100개까지 보낸다
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    try {
      const res = await ai.models.embedContent({
        model: EMBED_MODEL,
        contents: batch,
        config: {
          taskType: kind === "DOCUMENT" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
          outputDimensionality: EMBED_DIM,
          abortSignal: AbortSignal.timeout(20_000),
        },
      });
      const vecs = (res.embeddings ?? []).map((e) => e.values ?? []);
      if (vecs.length !== batch.length || vecs.some((v) => v.length !== EMBED_DIM)) {
        throw new GeminiError("EMPTY", "embedding size mismatch");
      }
      out.push(...vecs);
    } catch (e) {
      if (e instanceof GeminiError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) throw new GeminiError("QUOTA", msg);
      if (/503|UNAVAILABLE|Timeout|aborted/i.test(msg)) throw new GeminiError("BUSY", msg);
      throw new GeminiError("OTHER", msg);
    }
  }
  return out;
}

// pgvector 에 넣는 글자 모양: "[0.1,0.2,...]"
export const toPgVector = (v: number[]) => `[${v.join(",")}]`;
