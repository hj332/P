import "server-only";
import { requireRole } from "@/lib/auth";
import { splitArchived, type CaseReply, type NoteTarget, type ShareNote } from "@/lib/cases";
import { parseSummary, type Summary } from "@/lib/summary";
import { parseRisk, type Risk } from "@/lib/risk";
import type { SchoolStatsData } from "@/components/admin/SchoolStats";

// 교사 업무함·관리자 목록 데이터. 로그인한 사람의 권한(RLS)으로 읽으므로
//  - 교사: "학부모가 전달에 동의했고, 나에게 배정됐고, 내 학급 학생인" Case 만
//  - 교장·교감(ADMIN)·학년부장(MANAGER): "담임이 나와 공유한" Case 만
// 나온다. 상담 원문(conversations/messages)은 교사·관리자 정책이 없어 읽을 수 없다.

export type InboxCase = {
  id: string;
  status: string;
  createdAt: string;
  escalatedAt: string | null;
  sharedManagerAt: string | null; // 학년부장과 공유한 때
  sharedAdminAt: string | null; // 교장·교감과 공유한 때
  // 이 화면을 보는 사람(담임 또는 공유받은 사람)이 이 문의를 처음 연 때. assignments RLS 가 내 배정만 돌려준다.
  myViewedAt: string | null;
  studentName: string;
  classLabel: string | null;
  summary: Summary | null;
  reply: CaseReply | null;
  notes: ShareNote[]; // 공유 메모 (case_share_notes RLS: 교직원만)
  risk: Risk | null; // AI 분류 (risk_assessments RLS: 교직원만). null = 아직 분류 전
};

type Supa = Awaited<ReturnType<typeof requireRole>>["supabase"];

export async function loadCases(supabase: Supa, opts: { orderBy?: "created_at" | "escalated_at" } = {}) {
  const { data, error } = await supabase
    .from("cases")
    .select(
      "id, status, created_at, escalated_at, shared_manager_at, shared_admin_at, final_summary, students(name, classes(grade, class_no)), case_replies(body, author_name, created_at), assignments(viewed_at), case_share_notes(author_name, target, note, created_at), risk_assessments!risk_assessments_case_id_fkey(level, llm_level, category, high_risk, rule_signals, reason, repeat_of, repeat_has_reply, repeat_new_facts)",
    )
    .order(opts.orderBy ?? "created_at", { ascending: false });
  if (error) console.error("[cases]", error.message);

  return (data ?? []).map((c): InboxCase => {
    const st = c.students as unknown as { name: string; classes: { grade: number; class_no: number } | null } | null;
    const replies = (c.case_replies ?? []) as { body: string; author_name: string; created_at: string }[];
    const mine = (c.assignments ?? []) as { viewed_at: string | null }[];
    const notes = ((c.case_share_notes ?? []) as { author_name: string; target: string; note: string; created_at: string }[])
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((n) => ({ authorName: n.author_name, target: n.target as NoteTarget, note: n.note, createdAt: n.created_at }));
    const last = replies.sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1);
    return {
      id: c.id,
      status: c.status,
      createdAt: c.created_at,
      escalatedAt: c.escalated_at,
      sharedManagerAt: c.shared_manager_at,
      sharedAdminAt: c.shared_admin_at,
      myViewedAt: mine[0]?.viewed_at ?? null,
      studentName: st?.name ?? "학생",
      classLabel: st?.classes ? `${st.classes.grade}학년 ${st.classes.class_no}반` : null,
      summary: parseSummary(c.final_summary),
      reply: last ? { body: last.body, authorName: last.author_name, createdAt: last.created_at } : null,
      notes,
      risk: parseRisk(c.risk_assessments),
    };
  });
}

export async function getTeacherInbox() {
  const { supabase, profile } = await requireRole(["TEACHER", "MANAGER"]);
  // requireRole() 이 connection() 으로 요청 시점 렌더링을 보장하므로 현재 시각을 써도 된다
  const { active, archived } = splitArchived(await loadCases(supabase), Date.now());
  return { profile, cases: active, archived };
}

export async function getAdminCases() {
  const { supabase, profile } = await requireRole(["ADMIN", "MANAGER"]);
  // 학교 익명 통계는 교장·교감만 (DB 함수가 다시 확인한다)
  const [cases, stats] = await Promise.all([
    loadCases(supabase, { orderBy: "escalated_at" }),
    profile.role === "ADMIN" ? supabase.rpc("school_stats") : Promise.resolve({ data: null, error: null }),
  ]);
  if (stats.error) console.error("[school_stats]", stats.error.message);
  const { active, archived } = splitArchived(cases, Date.now());
  return { profile, cases: active, archived, stats: (stats.data as SchoolStatsData | null) ?? null };
}
