import "server-only";
import { requireRole } from "@/lib/auth";
import { parseSummary, type Summary } from "@/lib/summary";

// 교사 업무함 데이터. 교사 권한(RLS)으로 읽으므로
// "학부모가 전달에 동의했고, 나에게 배정됐고, 내 학급 학생인" Case 만 나온다.
// 상담 원문(conversations/messages)은 교사 정책이 없어 읽을 수 없다.

export type InboxCase = {
  id: string;
  status: string;
  createdAt: string;
  studentName: string;
  classLabel: string | null;
  summary: Summary | null;
};

export async function getTeacherInbox() {
  const { supabase, profile } = await requireRole(["TEACHER", "MANAGER", "ADMIN"]);

  const { data } = await supabase
    .from("cases")
    .select("id, status, created_at, final_summary, students(name, classes(grade, class_no))")
    .order("created_at", { ascending: false });

  const cases: InboxCase[] = (data ?? []).map((c) => {
    const st = c.students as unknown as { name: string; classes: { grade: number; class_no: number } | null } | null;
    return {
      id: c.id,
      status: c.status,
      createdAt: c.created_at,
      studentName: st?.name ?? "학생",
      classLabel: st?.classes ? `${st.classes.grade}학년 ${st.classes.class_no}반` : null,
      summary: parseSummary(c.final_summary),
    };
  });

  return { profile, cases };
}
