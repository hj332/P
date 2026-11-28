import "server-only";
import { generateText } from "./gemini";
import type { Summary } from "@/lib/summary";

// 문의 요약 → 학교 규정·안내문을 찾을 "규정 말투" 검색어 (v2 C 보완, 0009).
// 요약의 이야기 말투와 규정 문장의 말투가 달라 그대로 검색하면 맞는 규정이 잘 안 나와서 만든다.
// (2026-11-25 측정: 별명 문의 요약 그대로 0.69·못 고름 → 검색어 "학생 간 갈등 놀림 따돌림 생활지도" 0.756)
// 분류 AI(classify.ts)가 같은 호출에서 함께 만들고, 예전에 분류된 문의는 이 함수로 따로 만든다.

export const DOC_QUERY_RULE = `학교 규정·가정통신문·학급 안내에서 이 문의와 관련된 부분을 찾을 검색어를 만든다.
규정에 쓰일 법한 명사 위주로 5~12개 단어를 공백으로 이어 쓴다. 예) "학생 간 갈등 놀림 따돌림 생활지도", "숙제 양 과제 학급 운영", "교외체험학습 신청 기한".
아이 이름, 감정 표현, 문장은 쓰지 않는다.`;

export async function makeDocQuery(summary: Summary): Promise<string | null> {
  try {
    const raw = await generateText({
      systemPrompt: `${DOC_QUERY_RULE}\n검색어 한 줄만 답한다. 설명·따옴표·기호 없이.`,
      history: [
        {
          role: "parent",
          content: `상담 주제: ${summary.topic}\n있었던 일: ${summary.facts}\n학부모님이 원하는 것: ${summary.requests}`,
        },
      ],
      temperature: 0.1,
      maxOutputTokens: 80,
    });
    return cleanDocQuery(raw);
  } catch (e) {
    console.warn("[doc query]", e instanceof Error ? e.message.slice(0, 120) : e);
    return null;
  }
}

export function cleanDocQuery(raw: string | null | undefined): string | null {
  const q = (raw ?? "").replace(/["'`*#\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return q.length >= 2 ? q : null;
}
