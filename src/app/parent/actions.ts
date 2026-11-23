"use server";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCounselorPrompt } from "@/lib/ai/counselor-prompt";
import { generateCounselorReply, geminiFailMessage, type ChatTurn } from "@/lib/ai/gemini";
import { summarizeConversation } from "@/lib/ai/summarize";
import { needsEmergencyNotice, EMERGENCY_NOTICE } from "@/lib/ai/safety";
import { isOpen, parseSummary, splitSummaryMarker, withSummaryFlag } from "@/lib/summary";

// 모든 함수는 "로그인한 학부모 권한(RLS)"으로 동작한다.
// 관리자 키는 AI 답변(role = 'assistant') 저장 한 곳에서만 쓴다.

// suggestSummary: AI 가 "정리 단계" 표시를 붙인 답변인지 (화면이 정리 제안을 띄우는 기준)
export type ChatMessage = { id: string; role: "parent" | "assistant"; content: string; suggestSummary?: boolean };

export type SendResult =
  | { ok: true; conversationId: string; parent: ChatMessage; assistant: ChatMessage; warning?: string }
  | { ok: false; conversationId: string | null; parent: ChatMessage | null; error: string };

export type ActionResult = { ok: true } | { ok: false; error: string };

const MAX_LEN = 2000;
const HISTORY_LIMIT = 40;

type Supa = Awaited<ReturnType<typeof requireRole>>["supabase"];

async function loadOpenConversation(supabase: Supa, conversationId: string) {
  const { data } = await supabase
    .from("conversations")
    .select("id, student_id, status")
    .eq("id", conversationId)
    .maybeSingle();
  if (!data || !isOpen(data.status)) return null;
  return data;
}

async function loadHistory(supabase: Supa, conversationId: string, limit = HISTORY_LIMIT) {
  const { data: rows } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  // 정리 단계 표시는 떼고 넘긴다 (AI 가 이전 표시를 보고 매번 따라 붙이지 않도록)
  const history = ((rows ?? []) as ChatTurn[]).reverse().map((m) => ({ ...m, content: splitSummaryMarker(m.content).text }));
  // Gemini 는 첫 메시지가 사용자(학부모) 쪽이어야 한다.
  while (history.length && history[0].role !== "parent") history.shift();
  return history;
}

// ---------- 메시지 보내기 ----------
export async function sendParentMessage(input: {
  conversationId: string | null;
  studentId: string | null;
  text: string;
}): Promise<SendResult> {
  const { supabase, profile } = await requireRole(["PARENT"]);

  const text = input.text.trim();
  if (!text) return { ok: false, conversationId: input.conversationId, parent: null, error: "내용을 입력해 주세요." };
  if (text.length > MAX_LEN)
    return { ok: false, conversationId: input.conversationId, parent: null, error: `한 번에 ${MAX_LEN}자까지 보낼 수 있어요.` };

  // 1) 상담 찾기 또는 새로 만들기 (RLS: 본인 상담만, 본인 자녀만)
  let conv: { id: string; student_id: string | null; status?: string } | null = null;
  if (input.conversationId) {
    conv = await loadOpenConversation(supabase, input.conversationId);
    if (!conv) return { ok: false, conversationId: null, parent: null, error: "이 상담은 이미 끝났어요. 새 상담을 시작해 주세요." };
  } else {
    const { data, error } = await supabase
      .from("conversations")
      .insert({ school_id: profile.school_id, parent_id: profile.id, student_id: input.studentId })
      .select("id, student_id")
      .single();
    if (error || !data) return { ok: false, conversationId: null, parent: null, error: "상담을 시작하지 못했어요." };
    conv = data;
  }

  // 요약 확인 중에 다시 이야기를 시작하면 상담 중으로 되돌린다.
  if (conv.status && conv.status !== "ACTIVE") {
    await supabase.rpc("set_conversation_status", { p_conversation_id: conv.id, p_status: "ACTIVE" });
  }

  // 2) 학부모 메시지 저장 (RLS: role = 'parent', 본인 상담, 진행 중일 때만)
  const { data: parentRow, error: insErr } = await supabase
    .from("messages")
    .insert({ conversation_id: conv.id, role: "parent", content: text })
    .select("id, role, content")
    .single();
  if (insErr || !parentRow)
    return { ok: false, conversationId: conv.id, parent: null, error: "메시지를 저장하지 못했어요." };
  const parent = parentRow as ChatMessage;

  // 3~5) AI 답변 받아 저장
  const r = await replyAndSave(supabase, conv, text);
  if (!r.assistant) return { ok: false, conversationId: conv.id, parent, error: r.error };
  return { ok: true, conversationId: conv.id, parent, assistant: r.assistant, warning: r.warning };
}

// ---------- [답변 다시 받기] ----------
// AI 가 답하지 못했을 때(마지막 메시지가 학부모 것일 때) 같은 대화로 다시 답변을 받는다.
export async function retryReply(
  conversationId: string,
): Promise<{ ok: true; assistant: ChatMessage; warning?: string } | { ok: false; error: string }> {
  const { supabase } = await requireRole(["PARENT"]);
  const conv = await loadOpenConversation(supabase, conversationId);
  if (!conv) return { ok: false, error: "이 상담은 이미 끝났어요." };

  const { data: last } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last || last.role !== "parent") return { ok: false, error: "이미 답변이 있어요. 화면을 새로 고쳐 주세요." };

  const r = await replyAndSave(supabase, conv, last.content);
  return r.assistant ? { ok: true, assistant: r.assistant, warning: r.warning } : { ok: false, error: r.error };
}

// 대화 기록으로 AI 답변을 받아 저장한다.
// 위험 표현이면 AI 결과와 상관없이 긴급 연락처를 맨 앞에 붙인다 (AI 가 실패해도 안내는 저장).
async function replyAndSave(
  supabase: Supa,
  conv: { id: string; student_id: string | null },
  latestParentText: string,
): Promise<{ assistant?: ChatMessage; warning?: string; error: string }> {
  const history = await loadHistory(supabase, conv.id);
  const notice = needsEmergencyNotice(latestParentText);
  // 앞선 학부모 메시지 중 위험 표현이 있었는지 (평가 C06: 다음 턴에 안전을 잊어버리는 문제)
  const parentTexts = history.filter((m) => m.role === "parent").map((m) => m.content);
  const earlierRisk = parentTexts.slice(0, -1).some(needsEmergencyNotice);
  let reply: string | null = null;
  let failMessage = geminiFailMessage(null);
  try {
    reply = await generateCounselorReply(await promptFor(supabase, conv.student_id, notice, earlierRisk), history);
  } catch (e) {
    console.error("[gemini]", e instanceof Error ? e.message : e);
    failMessage = geminiFailMessage(e);
  }
  if (!reply && !notice) return { error: failMessage };

  const content = [notice ? EMERGENCY_NOTICE : null, reply].filter(Boolean).join("\n\n");

  // 관리자 키로 저장 — 호출하는 쪽에서 본인 상담임을 RLS 로 이미 확인했다.
  const admin = createAdminClient();
  const { data: aiRow, error: aiErr } = await admin
    .from("messages")
    .insert({ conversation_id: conv.id, role: "assistant", content })
    .select("id, role, content")
    .single();
  if (aiErr || !aiRow) {
    console.error("[assistant insert]", aiErr?.message);
    return { error: "AI 답변을 저장하지 못했어요." };
  }
  return { assistant: withSummaryFlag(aiRow as ChatMessage), warning: reply ? undefined : failMessage, error: "" };
}

async function promptFor(
  supabase: Supa,
  studentId: string | null,
  emergencyNoticeShown: boolean,
  earlierRisk: boolean,
) {
  const [{ data: school }, { data: student }] = await Promise.all([
    supabase.from("schools").select("name").maybeSingle(),
    studentId
      ? supabase.from("students").select("classes(grade, class_no)").eq("id", studentId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const cls = (student as { classes: { grade: number; class_no: number } | null } | null)?.classes;
  // 아이 이름은 AI 에 보내지 않는다 (학부모가 직접 말한 경우에만 대화에 들어간다).
  return buildCounselorPrompt({
    schoolName: school?.name ?? "학교",
    childLabel: cls ? `${cls.grade}학년 ${cls.class_no}반 학생` : null,
    emergencyNoticeShown,
    earlierRisk,
  });
}

// ---------- [상담 내용 정리하기] ----------
// AI 가 요약 초안을 만들어 summary_draft 에 저장하고, 상태를 CONSENT_PENDING(요약 확인 중)으로 바꾼다.
// 이 단계에서도 학교에는 아무것도 전달되지 않는다.
export async function createSummary(conversationId: string): Promise<ActionResult> {
  const { supabase } = await requireRole(["PARENT"]);
  const conv = await loadOpenConversation(supabase, conversationId);
  if (!conv) return { ok: false, error: "이 상담은 이미 끝났어요." };

  const history = await loadHistory(supabase, conv.id, 200);
  if (!history.some((m) => m.role === "parent"))
    return { ok: false, error: "정리할 이야기가 아직 없어요. 먼저 상담을 나눠 주세요." };

  let summary;
  try {
    summary = await summarizeConversation(history);
  } catch (e) {
    console.error("[summary]", e instanceof Error ? e.message : e);
    return { ok: false, error: geminiFailMessage(e).replace("AI 답변을", "요약을") };
  }

  const { error: upErr } = await supabase
    .from("conversations")
    .update({ summary_draft: summary, updated_at: new Date().toISOString() })
    .eq("id", conv.id);
  if (upErr) return { ok: false, error: "요약을 저장하지 못했어요." };

  const { error: stErr } = await supabase.rpc("set_conversation_status", {
    p_conversation_id: conv.id,
    p_status: "CONSENT_PENDING",
  });
  if (stErr) return { ok: false, error: "상담 상태를 바꾸지 못했어요." };
  return { ok: true };
}

// ---------- 요약 수정 저장 ----------
export async function saveSummaryDraft(conversationId: string, input: unknown): Promise<ActionResult> {
  const { supabase } = await requireRole(["PARENT"]);
  const summary = parseSummary(input);
  if (!summary) return { ok: false, error: "상담 주제는 비워 둘 수 없어요." };
  const conv = await loadOpenConversation(supabase, conversationId);
  if (!conv) return { ok: false, error: "이 상담은 이미 끝났어요." };

  const { error } = await supabase
    .from("conversations")
    .update({ summary_draft: summary, updated_at: new Date().toISOString() })
    .eq("id", conv.id);
  return error ? { ok: false, error: "수정한 내용을 저장하지 못했어요." } : { ok: true };
}

// ---------- [학교에 전달하기] ----------
// 학부모가 확인(필요하면 수정)한 요약만 Case 로 만들어 담임에게 보낸다. 대화 원문은 보내지 않는다.
export async function sendToSchool(conversationId: string, input: unknown): Promise<ActionResult> {
  const { supabase } = await requireRole(["PARENT"]);
  const summary = parseSummary(input);
  if (!summary) return { ok: false, error: "상담 주제는 비워 둘 수 없어요." };

  const { error } = await supabase.rpc("consent_and_create_case", {
    p_conversation_id: conversationId,
    p_final_summary: summary,
  });
  if (error) {
    console.error("[consent]", error.message);
    if (/담임/.test(error.message)) return { ok: false, error: "담임 선생님이 등록되어 있지 않아 전달할 수 없어요." };
    if (/확인하는 단계/.test(error.message)) return { ok: false, error: "요약을 확인하는 단계에서만 전달할 수 있어요." };
    return { ok: false, error: "학교에 전달하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  return { ok: true };
}

// ---------- [상담만 종료] ----------
export async function endConsultation(conversationId: string): Promise<ActionResult> {
  const { supabase } = await requireRole(["PARENT"]);
  const { error } = await supabase.rpc("decline_and_close", { p_conversation_id: conversationId });
  if (error) {
    console.error("[decline]", error.message);
    return { ok: false, error: "상담을 마치지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  return { ok: true };
}

// ---------- [조금 더 상담하기] ----------
export async function continueConsultation(conversationId: string): Promise<ActionResult> {
  const { supabase } = await requireRole(["PARENT"]);
  const { error } = await supabase.rpc("set_conversation_status", {
    p_conversation_id: conversationId,
    p_status: "ACTIVE",
  });
  return error ? { ok: false, error: "상담으로 돌아가지 못했어요." } : { ok: true };
}

// ---------- [답변 잘 받았어요] (선생님 답변 확인 → 문의 마무리) ----------
export async function confirmReply(caseId: string): Promise<ActionResult> {
  const { supabase } = await requireRole(["PARENT"]);
  if (!/^[0-9a-f-]{36}$/i.test(caseId)) return { ok: false, error: "문의를 찾을 수 없어요." };
  const { error } = await supabase.rpc("confirm_case_reply", { p_case_id: caseId });
  if (error) {
    console.error("[confirm_reply]", error.message);
    return { ok: false, error: "확인을 전하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  return { ok: true };
}
