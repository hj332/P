import { Suspense } from "react";
import { InboxView } from "@/components/teacher/InboxView";
import { TeacherShell } from "@/components/teacher/TeacherShell";
import { getAdminCases } from "../../teacher/data";

// 지난 문의함 (교장·교감·학년부장) — 공유받은 문의 중 담임이 답변을 보낸 지 2일이 지난 문의.
export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-muted">불러오는 중…</p>}>
      <Archive />
    </Suspense>
  );
}

async function Archive() {
  const { profile, cases, archived } = await getAdminCases({ withStats: false });
  const unseen = cases.filter((c) => !c.reply && !c.myViewedAt).length;
  const roleLabel = profile.role === "MANAGER" ? "학년부장" : "교장·교감";

  return (
    <TeacherShell area="admin" userName={profile.display_name} newCount={unseen} current="archive" archivedCount={archived.length} showDocs={profile.role === "ADMIN"}>
      <main className="flex flex-col gap-[26px] px-4 pt-[30px] pb-12 sm:px-8">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{roleLabel} · 지난 문의함</span>
          <h1 className="m-0 text-[26px] font-black tracking-[-0.8px] text-heading sm:text-[32px]">
            지난 문의 <span className="text-ai-bubble">{archived.length}건</span>
          </h1>
          <p className="m-0 text-[15px] text-[#4D6157]">담임 선생님이 답변을 보낸 지 2일이 지난 공유 문의는 이곳으로 옮겨져요.</p>
        </div>
        <InboxView
          cases={archived}
          others={cases}
          mode="admin"
          viewerRole={profile.role}
          empty={{ title: "지난 문의가 없어요", body: "담임 선생님이 답변을 보낸 지 2일이 지나면 문의가 이곳으로 옮겨져요." }}
        />
      </main>
    </TeacherShell>
  );
}
