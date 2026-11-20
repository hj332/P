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
};

export type ChildItem = { id: string; label: string; classLabel: string | null };

export async function getParentContext() {
  const { supabase, profile } = await requireRole(["PARENT"]);

  const [{ data: school }, { data: children }, { data: convs }] = await Promise.all([
    supabase.from("schools").select("name").maybeSingle(),
    supabase.from("students").select("id, name, classes(grade, class_no)").order("name"),
    supabase
      .from("conversations")
      .select("id, status, created_at, summary_draft, messages(content, role, created_at)")
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
      return {
        id: c.id,
        status: c.status,
        createdAt: c.created_at,
        title: topic || (first ? first.slice(0, 28) + (first.length > 28 ? "…" : "") : "새 상담"),
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
      .select("id, role, content")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true }),
    supabase.from("cases").select("status, final_summary").eq("conversation_id", conv.id).maybeSingle(),
  ]);

  const cls = (conv.students as unknown as { classes: { grade: number; class_no: number } | null } | null)?.classes;
  return {
    id: conv.id,
    status: conv.status as string,
    createdAt: conv.created_at as string,
    summaryDraft: conv.summary_draft as unknown,
    classLabel: cls ? `${cls.grade}학년 ${cls.class_no}반` : null,
    messages: ((messages ?? []) as ChatMessage[]).map(withSummaryFlag),
    caseStatus: (caseRow?.status as string | undefined) ?? null,
    finalSummary: (caseRow?.final_summary as unknown) ?? null,
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
