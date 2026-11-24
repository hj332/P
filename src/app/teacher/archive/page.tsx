import { Suspense } from "react";
import { InboxView } from "@/components/teacher/InboxView";
import { TeacherShell } from "@/components/teacher/TeacherShell";
import { getTeacherInbox } from "../data";

// 지난 문의함 (교사) — 답변을 보낸 지 2일이 지난 문의. 업무함에서는 빠지고 여기서만 보인다.
export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-muted">불러오는 중…</p>}>
      <Archive />
    </Suspense>
  );
}

async function Archive() {
  const { profile, cases, archived } = await getTeacherInbox();
  const newCount = cases.filter((c) => c.status === "NEW").length;

  return (
    <TeacherShell userName={profile.display_name} newCount={newCount} current="archive" archivedCount={archived.length}>
      <main className="flex flex-col gap-[26px] px-4 pt-[30px] pb-12 sm:px-8">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">교사 · 지난 문의함</span>
          <h1 className="m-0 text-[26px] font-black tracking-[-0.8px] text-heading sm:text-[32px]">
            지난 문의 <span className="text-ai-bubble">{archived.length}건</span>
          </h1>
          <p className="m-0 text-[15px] text-[#4D6157]">답변을 보낸 지 2일이 지난 문의는 업무함에서 이곳으로 옮겨져요.</p>
        </div>
        <InboxView
          cases={archived}
          others={cases}
          empty={{ title: "지난 문의가 없어요", body: "답변을 보낸 지 2일이 지나면 문의가 이곳으로 옮겨져요." }}
        />
      </main>
    </TeacherShell>
  );
}
