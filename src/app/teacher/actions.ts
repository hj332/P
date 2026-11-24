"use server";

import { requireRole } from "@/lib/auth";
import { draftTeacherReply } from "@/lib/ai/reply-draft";
import { geminiFailMessage } from "@/lib/ai/gemini";
import { REPLY_MAX, type ShareTarget } from "@/lib/cases";
import { parseSummary } from "@/lib/summary";

// 교사 업무함의 서버 함수. 전부 "로그인한 교사 권한(RLS)"으로 동작한다.
// 답변 저장·상태 변경은 DB 함수(reply_to_case / escalate_case)가 권한을 다시 확인한다.

export type DraftResult = { ok: true; draft: string } | { ok: false; error: string };
export type TeacherActionResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f-]{36}$/i;

// [AI 답변 초안] 학부모가 확인한 요약(final_summary)만 AI 에 넘긴다. 대화 원문은 교사 권한으로 읽을 수도 없다.
// 초안은 저장하지 않고 화면의 입력칸에만 넣는다.
export async function generateReplyDraft(caseId: string): Promise<DraftResult> {
  const { supabase, profile } = await requireRole(["TEACHER", "MANAGER"]);
  if (!UUID.test(caseId)) return { ok: false, error: "문의를 찾을 수 없어요." };

  const { data } = await supabase.from("cases").select("final_summary, students(name)").eq("id", caseId).maybeSingle();
  const summary = parseSummary(data?.final_summary);
  if (!data || !summary) return { ok: false, error: "문의를 찾을 수 없어요." };
  // 아이 이름은 AI 에 보내지 않는다 (요약에 들어 있으면 "아이"로 바꿔서 보냄)
  const childName = (data.students as unknown as { name: string } | null)?.name ?? null;

  try {
    const draft = await draftTeacherReply(summary, profile.display_name, childName);
    return { ok: true, draft };
  } catch (e) {
    console.error("[reply-draft]", e instanceof Error ? e.message : e);
    return { ok: false, error: geminiFailMessage(e) };
  }
}

// [답변 보내기] → Case 상태 RESOLVED (DB 함수 reply_to_case)
export async function sendReply(caseId: string, body: string): Promise<TeacherActionResult> {
  const { supabase } = await requireRole(["TEACHER", "MANAGER"]);
  if (!UUID.test(caseId)) return { ok: false, error: "문의를 찾을 수 없어요." };
  const text = body.trim();
  if (!text) return { ok: false, error: "답변 내용을 입력해 주세요." };
  if (text.length > REPLY_MAX) return { ok: false, error: `답변은 ${REPLY_MAX}자까지 쓸 수 있어요.` };

  const { error } = await supabase.rpc("reply_to_case", { p_case_id: caseId, p_body: text });
  if (error) {
    console.error("[reply_to_case]", error.message);
    if (error.message.includes("이미 답변")) return { ok: false, error: "이미 답변한 문의예요. 화면을 새로 고쳐 주세요." };
    return { ok: false, error: "답변을 보내지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  return { ok: true };
}

// [관리자와 공유] → Case 상태 ESCALATED (DB 함수 escalate_case)
//   담임: MANAGER(그 학생 학년의 학년부장) 또는 ADMIN(교장·교감) / 학년부장: ADMIN 만
//   note: 받는 선생님께 남기는 메모(선택). 교직원만 보고 학부모에게는 보이지 않는다.
export async function escalateCase(caseId: string, target: ShareTarget, note = ""): Promise<TeacherActionResult> {
  const { supabase } = await requireRole(["TEACHER", "MANAGER"]);
  if (!UUID.test(caseId)) return { ok: false, error: "문의를 찾을 수 없어요." };
  if (target !== "MANAGER" && target !== "ADMIN") return { ok: false, error: "공유 대상을 골라 주세요." };
  const memo = note.trim();
  if (memo.length > 1000) return { ok: false, error: "메모는 1000자까지 쓸 수 있어요." };

  const { error } = await supabase.rpc("escalate_case", { p_case_id: caseId, p_target: target, p_note: memo || null });
  if (error) {
    console.error("[escalate_case]", error.message);
    if (error.message.includes("학년부장 계정이 없어")) return { ok: false, error: "이 학년의 학년부장 선생님이 등록되어 있지 않아 공유할 수 없어요." };
    if (error.message.includes("관리자 계정이 없어")) return { ok: false, error: "교장·교감 선생님 계정이 등록되어 있지 않아 공유할 수 없어요." };
    if (error.message.includes("교장·교감 선생님께만")) return { ok: false, error: "학년부장 선생님은 교장·교감 선생님께만 공유할 수 있어요." };
    if (error.message.includes("이미")) return { ok: false, error: "이미 공유했거나 답변한 문의예요. 화면을 새로 고쳐 주세요." };
    return { ok: false, error: "관리자와 공유하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  return { ok: true };
}

// [메모 남기기] 교장·교감이 공유받은 문의에 담임(TEACHER)·학년부장(MANAGER) 앞으로 메모를 남긴다 (DB 함수 add_case_note).
// 학년부장 앞 메모는 아직 학년부장과 공유되지 않은 문의라면 그 학년 학년부장에게도 공유된다.
export async function addCaseNote(caseId: string, target: "TEACHER" | "MANAGER", note: string): Promise<TeacherActionResult> {
  const { supabase } = await requireRole(["ADMIN"]);
  if (!UUID.test(caseId)) return { ok: false, error: "문의를 찾을 수 없어요." };
  if (target !== "TEACHER" && target !== "MANAGER") return { ok: false, error: "메모 받을 선생님을 골라 주세요." };
  const memo = note.trim();
  if (!memo) return { ok: false, error: "메모 내용을 입력해 주세요." };
  if (memo.length > 1000) return { ok: false, error: "메모는 1000자까지 쓸 수 있어요." };

  const { error } = await supabase.rpc("add_case_note", { p_case_id: caseId, p_target: target, p_note: memo });
  if (error) {
    console.error("[add_case_note]", error.message);
    if (error.message.includes("학년부장 계정이 없어")) return { ok: false, error: "이 학년의 학년부장 선생님이 등록되어 있지 않아요." };
    return { ok: false, error: "메모를 남기지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  return { ok: true };
}
