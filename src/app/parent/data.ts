import "server-only";
import { requireRole } from "@/lib/auth";
import type { ChatMessage } from "./actions";
import { withSummaryFlag } from "@/lib/summary";

// 학부모 화면 공통 데이터. 전부 학부모 권한(RLS)으로 읽으므로 본인 것만 나온다.

export type ConversationItem = {
  id: string;
  status: string;
  createdAt: string;
  title: string;
  // 학교에 전달된 상담이면 그 문의(Case)
  caseId: string | null;
  caseStatus: string | null;
};

export type ChildItem = { id: string; label: string; classLabel: string | null };

export async function getParentContext() {
  const { supabase, profile } = await requireRole(["PARENT"]);

  const [{ data: school }, { data: children }, { data: convs }] = await Promise.all([
    supabase.from("schools").select("name").maybeSingle(),
    supabase.from("students").select("id, name, classes(grade, class_no)").order("name"),
    supabase
      .from("conversations")
      .select("id, status, created_at, summary_draft, messages(content, role, created_at), cases(id, status)")
      .eq("messages.role", "parent")
      .order("created_at", { ascending: false })
      .order("created_at", { referencedTable: "messages", ascending: true })
      .limit(1, { referencedTable: "messages" })
      .limit(30),
  ]);

  const childList: ChildItem[] = (children ?? []).map((c) => {
    const cls = c.classes as unknown as { grade: number; class_no: number } | null;
    const classLabel = cls ? `${cls.grade}학년 ${cls.class_no}반` : null;
    return { id: c.id, label: classLabel ? `${c.name} · ${classLabel}` : c.name, classLabel };
  });

  const conversations: ConversationItem[] = (convs ?? [])
    .map((c) => {
      const topic = (c.summary_draft as { topic?: string } | null)?.topic;
      const first = (c.messages as { content: string }[] | null)?.[0]?.content;
      // cases.conversation_id 가 unique 라 하나(또는 없음)만 온다
      const cs = c.cases as unknown as { id: string; status: string } | { id: string; status: string }[] | null;
      const kase = Array.isArray(cs) ? cs[0] : cs;
      return {
        id: c.id,
        status: c.status,
        createdAt: c.created_at,
        title: topic || (first ? first.slice(0, 28) + (first.length > 28 ? "…" : "") : "새 상담"),
        caseId: kase?.id ?? null,
        caseStatus: kase?.status ?? null,
      };
    })
    // 아직 한마디도 하지 않은 빈 상담은 목록에서 뺀다
    .filter((c) => c.title !== "새 상담");

  return {
    supabase,
    profile,
    schoolName: school?.name ?? "우리 학교",
    childList,
    conversations,
  };
}

export async function getConversation(
  supabase: Awaited<ReturnType<typeof getParentContext>>["supabase"],
  conversationId: string,
) {
  // 잘못된 형식의 id 는 DB 에 묻지 않는다
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return null;

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, status, created_at, student_id, summary_draft, students(classes(grade, class_no))")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return null;

  const [{ data: messages }, { data: caseRow }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, role, content, sources")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true }),
    supabase.from("cases").select("id, status, final_summary").eq("conversation_id", conv.id).maybeSingle(),
  ]);

  const cls = (conv.students as unknown as { classes: { grade: number; class_no: number } | null } | null)?.classes;
  return {
    id: conv.id,
    status: conv.status as string,
    createdAt: conv.created_at as string,
    summaryDraft: conv.summary_draft as unknown,
    classLabel: cls ? `${cls.grade}학년 ${cls.class_no}반` : null,
    messages: ((messages ?? []) as ChatMessage[]).map(withSummaryFlag),
    caseId: (caseRow?.id as string | undefined) ?? null,
    caseStatus: (caseRow?.status as string | undefined) ?? null,
    finalSummary: (caseRow?.final_summary as unknown) ?? null,
  };
}

// 선생님 답변 확인 화면 (/parent/cases/[caseId]). 학부모 RLS 라 본인 Case 만 나온다.
export async function getParentCase(
  supabase: Awaited<ReturnType<typeof getParentContext>>["supabase"],
  caseId: string,
) {
  if (!/^[0-9a-f-]{36}$/i.test(caseId)) return null;

  const { data } = await supabase
    .from("cases")
    .select(
      "id, status, created_at, teacher_viewed_at, escalated_at, shared_manager_at, shared_admin_at, parent_confirmed_at, final_summary, conversation_id, " +
        "conversations(created_at), students(name, classes(grade, class_no)), case_replies(body, author_name, created_at)",
    )
    .eq("id", caseId)
    .maybeSingle();
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    status: string;
    created_at: string;
    teacher_viewed_at: string | null;
    escalated_at: string | null;
    shared_manager_at: string | null;
    shared_admin_at: string | null;
    parent_confirmed_at: string | null;
    final_summary: unknown;
    conversation_id: string;
    conversations: { created_at: string } | null;
    students: { name: string; classes: { grade: number; class_no: number } | null } | null;
    case_replies: { body: string; author_name: string; created_at: string }[] | null;
  };
  const replies = [...(row.case_replies ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const cls = row.students?.classes;
  return {
    id: row.id,
    status: row.status,
    conversationId: row.conversation_id,
    consultedAt: row.conversations?.created_at ?? row.created_at,
    sentAt: row.created_at,
    viewedAt: row.teacher_viewed_at,
    escalatedAt: row.escalated_at,
    sharedManagerAt: row.shared_manager_at,
    sharedAdminAt: row.shared_admin_at,
    confirmedAt: row.parent_confirmed_at,
    finalSummary: row.final_summary,
    classLabel: cls ? `${cls.grade}학년 ${cls.class_no}반` : null,
    replies: replies.map((r) => ({ body: r.body, authorName: r.author_name, createdAt: r.created_at })),
  };
}

// "오늘 · 11월 19일 (목) 21:32" 같은 표시 (한국 시간)
export function formatKoreanDateTime(iso: string) {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.month} ${parts.day}일 (${parts.weekday}) ${parts.hour}:${parts.minute}`;
}

export function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" })
    .format(new Date(iso))
    .replace(/\s/g, "")
    .replace(/\.$/, "");
}
