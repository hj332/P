"use server";

import { requireRole } from "@/lib/auth";
import { embedTexts, toPgVector } from "@/lib/ai/embed";
import { geminiFailMessage } from "@/lib/ai/gemini";
import { DOC_BODY_MAX, DOC_SOURCE_MAX, DOC_TITLE_MAX, chunkDocument, type DocScope } from "@/lib/documents";

// 학교 자료 등록·삭제 (v2 C). 교장·교감: 학교 자료·교육법률 자료 / 담임: 자기 반 학급 자료.
// 조각 나누기와 임베딩은 서버에서 하지만, DB 에 쓰는 것은 로그인한 사람의 권한(RLS)이다 (0008 의 can_manage_document).

export type DocActionResult = { ok: true } | { ok: false; error: string };

export async function addDocument(input: { scope: DocScope; title: string; source: string; body: string }): Promise<DocActionResult> {
  const { supabase, profile } = await requireRole(["TEACHER", "ADMIN"]);
  const title = input.title.trim();
  const source = input.source.trim();
  const body = input.body.replace(/\r\n/g, "\n").trim();
  if (!title) return { ok: false, error: "제목을 입력해 주세요." };
  if (title.length > DOC_TITLE_MAX) return { ok: false, error: `제목은 ${DOC_TITLE_MAX}자까지 쓸 수 있어요.` };
  if (source.length > DOC_SOURCE_MAX) return { ok: false, error: `출처는 ${DOC_SOURCE_MAX}자까지 쓸 수 있어요.` };
  if (!body) return { ok: false, error: "본문을 입력해 주세요." };
  if (body.length > DOC_BODY_MAX) return { ok: false, error: `본문은 ${DOC_BODY_MAX.toLocaleString()}자까지 등록할 수 있어요. 나눠서 올려 주세요.` };

  // 누가 어떤 자료를: 교장·교감 = 학교·교육법률, 담임 = 자기 반 (DB 가 다시 확인한다)
  let scope = input.scope;
  let classId: string | null = null;
  if (profile.role === "ADMIN") {
    if (scope !== "SCHOOL" && scope !== "LEGAL") return { ok: false, error: "교장·교감 선생님은 학교 자료·교육법률 자료를 등록할 수 있어요." };
  } else {
    scope = "CLASS";
    const { data: tc } = await supabase
      .from("teacher_classes")
      .select("class_id")
      .eq("teacher_id", profile.id)
      .eq("is_homeroom", true)
      .limit(1)
      .maybeSingle();
    if (!tc) return { ok: false, error: "담임 학급이 등록되어 있지 않아 학급 자료를 올릴 수 없어요." };
    classId = tc.class_id;
  }

  // 임베딩을 먼저 만든다 — 실패하면 아무것도 저장하지 않는다
  const chunks = chunkDocument(title, body);
  let vectors: number[][];
  try {
    vectors = await embedTexts(chunks, "DOCUMENT");
  } catch (e) {
    console.error("[doc embed]", e instanceof Error ? e.message.slice(0, 160) : e);
    return { ok: false, error: `자료를 검색용으로 준비하지 못했어요. ${geminiFailMessage(e)}` };
  }

  const { data: doc, error } = await supabase
    .from("documents")
    .insert({ school_id: profile.school_id, scope, class_id: classId, title, source, body, created_by: profile.id })
    .select("id")
    .single();
  if (error || !doc) {
    console.error("[doc insert]", error?.message);
    return { ok: false, error: "자료를 등록하지 못했어요. 권한을 확인해 주세요." };
  }

  const { error: chunkErr } = await supabase.from("document_chunks").insert(
    chunks.map((content, i) => ({ document_id: doc.id, chunk_index: i, content, embedding: toPgVector(vectors[i]) })),
  );
  if (chunkErr) {
    console.error("[doc chunks]", chunkErr.message);
    await supabase.from("documents").delete().eq("id", doc.id);
    return { ok: false, error: "자료를 검색용으로 저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  return { ok: true };
}

export async function deleteDocument(documentId: string): Promise<DocActionResult> {
  const { supabase } = await requireRole(["TEACHER", "ADMIN"]);
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return { ok: false, error: "자료를 찾을 수 없어요." };
  const { data, error } = await supabase.from("documents").delete().eq("id", documentId).select("id");
  if (error || !data?.length) {
    if (error) console.error("[doc delete]", error.message);
    return { ok: false, error: "이 자료를 지울 권한이 없어요." };
  }
  return { ok: true };
}
