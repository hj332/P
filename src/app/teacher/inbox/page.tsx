import { Suspense } from "react";
import { InboxView } from "@/components/teacher/InboxView";
import { TeacherShell } from "@/components/teacher/TeacherShell";
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
  const { profile, cases } = await getTeacherInbox();
  const newCount = cases.filter((c) => c.status === "NEW").length;
  const today = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());

  return (
    <TeacherShell userName={profile.display_name} newCount={newCount}>
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
          <Kpi dark label="나에게 전달된 문의" value={cases.length} sub={`미확인 ${newCount} · 확인 중 ${cases.filter((c) => c.status === "TEACHER_REVIEWING").length}`} />
          <Kpi label="미확인" value={newCount} sub="아직 열어 보지 않은 문의" />
          <Kpi label="확인 중" value={cases.filter((c) => c.status === "TEACHER_REVIEWING").length} sub="열어 본 문의" />
        </div>

        {/* 상태(미확인→확인 중)가 바뀌어도 다시 만들지 않는다 → 열람 기록이 두 번 남지 않게 */}
        <InboxView cases={cases} />
      </main>
    </TeacherShell>
  );
}

function Kpi({ label, value, sub, dark }: { label: string; value: number; sub: string; dark?: boolean }) {
  return (
    <div
      className={
        "flex-col gap-2 rounded-[18px] px-[22px] py-5 " +
        // 휴대폰에서는 첫 카드(미확인·확인 중 포함)만 보여서 목록이 바로 보이게 한다
        (dark ? "flex bg-deep-green text-white" : "hidden border border-line bg-white sm:flex")
      }
    >
      <span className={"text-sm " + (dark ? "text-[#CDE7D6]" : "text-[#4D6157]")}>{label}</span>
      <span className="text-[40px] leading-none font-black">
        {value}
        <span className="ml-1 text-base font-medium">건</span>
      </span>
      <span className={"text-[13px] " + (dark ? "text-[#B9E08A]" : "text-muted")}>{sub}</span>
    </div>
  );
}
