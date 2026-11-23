import { Suspense } from "react";
import { InboxView } from "@/components/teacher/InboxView";
import { Kpi, TeacherShell } from "@/components/teacher/TeacherShell";
import { getAdminCases } from "../teacher/data";

// 공유받은 문의 최소 목록 — 교장·교감(ADMIN)·학년부장(MANAGER)에게 담임이 공유한 문의만 보인다 (DB RLS).
// AdminDashboard.html 의 통계·고위험 표시는 B 단계에서 만든다.
export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-muted">불러오는 중…</p>}>
      <AdminList />
    </Suspense>
  );
}

async function AdminList() {
  const { profile, cases } = await getAdminCases();
  // "확인 전"은 내가 아직 열지 않은 문의 (공유받은 사람마다 따로)
  const unseen = cases.filter((c) => !c.reply && !c.myViewedAt).length;
  const waiting = cases.filter((c) => !c.reply).length;
  const roleLabel = profile.role === "MANAGER" ? "학년부장" : "교장·교감";

  return (
    <TeacherShell area="admin" userName={profile.display_name} newCount={unseen}>
      <main className="flex flex-col gap-[26px] px-4 pt-[30px] pb-12 sm:px-8">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{roleLabel} · 담임 선생님이 공유한 문의</span>
          <h1 className="m-0 text-[26px] font-black tracking-[-0.8px] text-heading sm:text-[32px]">
            {profile.display_name}, 새로 공유된 문의가 <span className="text-ai-bubble">{unseen}건</span> 있어요
          </h1>
          <p className="m-0 text-[15px] text-[#4D6157]">
            담임 선생님이 함께 확인을 요청한 문의예요. 학부모님께 답변은 담임 선생님이 보내요.
          </p>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
          <Kpi dark label="공유받은 문의" value={cases.length} sub={`답변 대기 ${waiting} · 답변 완료 ${cases.length - waiting}`} />
          <Kpi label="확인 전" value={unseen} sub="아직 열어 보지 않은 문의" />
          <Kpi label="답변 대기" value={waiting} sub="담임 선생님이 아직 답변하지 않은 문의" />
        </div>

        <InboxView cases={cases} mode="admin" viewerRole={profile.role} />
      </main>
    </TeacherShell>
  );
}
