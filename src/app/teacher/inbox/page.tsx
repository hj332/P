import { Suspense } from "react";
import { InboxView } from "@/components/teacher/InboxView";
import { Kpi, TeacherShell } from "@/components/teacher/TeacherShell";
import { getTeacherInbox } from "../data";

// 교사 업무함 (design/screens/TeacherInbox.html)
export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-muted">불러오는 중…</p>}>
      <Inbox />
    </Suspense>
  );
}

async function Inbox() {
  const { profile, cases, archived } = await getTeacherInbox();
  const newCount = cases.filter((c) => c.status === "NEW").length;
  const waiting = cases.filter((c) => ["TEACHER_REVIEWING", "ESCALATED", "ADMIN_REVIEWING"].includes(c.status)).length;
  const shared = cases.filter((c) => ["ESCALATED", "ADMIN_REVIEWING"].includes(c.status)).length;
  const done = cases.filter((c) => c.status === "RESOLVED" || c.status === "CLOSED").length;
  const today = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());

  return (
    <TeacherShell userName={profile.display_name} newCount={newCount} archivedCount={archived.length}>
      <main className="flex flex-col gap-[26px] px-4 pt-[30px] pb-12 sm:px-8">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{today} · 확인할 문의</span>
          <h1 className="m-0 text-[26px] font-black tracking-[-0.8px] text-heading sm:text-[32px]">
            {profile.display_name} 선생님, 확인할 문의가 <span className="text-ai-bubble">{newCount}건</span> 있어요
          </h1>
          <p className="m-0 text-[15px] text-[#4D6157]">
            AI가 먼저 듣고 정리했고, 학부모님이 직접 확인하고 전달에 동의한 문의만 보여요.
          </p>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
          <Kpi dark label="나에게 전달된 문의" value={cases.length} sub={`미확인 ${newCount} · 답변 대기 ${waiting} · 답변 완료 ${done}`} />
          <Kpi label="미확인" value={newCount} sub="아직 열어 보지 않은 문의" />
          <Kpi label="답변 대기" value={waiting} sub={shared ? `관리자와 공유한 문의 ${shared}건 포함` : "열어 보고 아직 답변하지 않은 문의"} />
          <Kpi label="답변 완료" value={done} sub="학부모님께 답변을 보낸 문의" />
        </div>

        {/* 상태(미확인→확인 중→답변 완료)가 바뀌어도 다시 만들지 않는다 → 열람 기록이 두 번 남지 않고, 쓰던 답변도 유지된다 */}
        <InboxView cases={cases} others={archived} />
      </main>
    </TeacherShell>
  );
}
