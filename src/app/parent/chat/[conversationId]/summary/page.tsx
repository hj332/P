import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/brand/icons";
import { EmergencyFootnote, ParentShell } from "@/components/parent/ParentShell";
import { SummaryView } from "@/components/parent/SummaryView";
import { isOpen, parseSummary } from "@/lib/summary";
import { getConversation, getParentContext } from "../../../data";

// 상담 내용 정리 → 전달 선택 (design/screens/ParentSummary.html)
export default function Page(props: PageProps<"/parent/chat/[conversationId]/summary">) {
  return (
    <Suspense fallback={<p className="p-6 text-muted">불러오는 중…</p>}>
      <SummaryPage params={props.params} />
    </Suspense>
  );
}

async function SummaryPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const { supabase, profile, schoolName, conversations } = await getParentContext();
  const conv = await getConversation(supabase, conversationId);
  if (!conv) notFound();

  const sent = conv.status === "CASE_CREATED" || conv.status === "CONSENTED";
  // 전달된 상담은 실제로 전달된 요약(final_summary)을 보여 준다.
  const summary = parseSummary(sent ? (conv.finalSummary ?? conv.summaryDraft) : conv.summaryDraft);

  // 아직 정리하지 않은 진행 중 상담이면 채팅으로 돌려보낸다.
  if (isOpen(conv.status) && (!summary || conv.status === "ACTIVE" || conv.status === "WAITING_FOR_PARENT")) {
    redirect(`/parent/chat/${conv.id}`);
  }

  const mode = sent ? "sent" : conv.status === "CLOSED_AI" ? "closed" : "review";
  const teacher = conv.classLabel ? `${conv.classLabel} 담임 선생님` : "담임 선생님";

  return (
    <ParentShell
      schoolName={schoolName}
      userName={profile.display_name}
      status={conv.status}
      caseStatus={conv.caseStatus}
      conversations={conversations}
      currentId={conv.id}
    >
      {mode === "review" && (
        <div className="border-b border-line bg-[#EEF6E8]">
          <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-4 py-4 text-[17px] font-bold text-deep-green sm:px-8 sm:text-[19px]">
            <Icon name="info" size={26} />
            전달 전, 이 내용이 맞는지 확인해 주세요
          </div>
        </div>
      )}
      <div className="mx-auto box-border flex w-full max-w-[1240px] flex-1 flex-wrap items-start gap-8 px-4 pt-8 pb-10 sm:px-8 sm:pt-10">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-8">
          <SummaryView
            key={`${conv.id}-${conv.status}`}
            conversationId={conv.id}
            initialMode={mode}
            summary={summary}
            classLabel={conv.classLabel}
          />
        </div>

        {/* 전달 여부를 고르는 동안에만 안내한다 */}
        <aside
          className={(mode === "review" ? "flex" : "hidden") + " max-w-[400px] min-w-0 flex-[1_1_300px] flex-col gap-[18px]"}
        >
          <div className="flex flex-col gap-[18px] rounded-[22px] border border-line bg-white p-[26px]">
            <h2 className="m-0 text-lg font-bold">전달하면 이렇게 진행돼요</h2>
            <ol className="m-0 flex list-none flex-col gap-4 p-0">
              <Step icon="school" title="담임 선생님 업무함에 등록" desc={teacher} />
              <Step icon="clock" title="선생님이 내용을 확인" desc="선생님이 근무시간에 확인해요" />
              <Step icon="chat" title="필요하면 학교에서 연락" desc="상담 내역에서 전달 상태를 볼 수 있어요" />
            </ol>
          </div>
          <div className="flex flex-col gap-2.5 rounded-[22px] bg-bg-soft p-[22px]">
            <span className="flex items-center gap-2 text-[15px] font-bold text-ok-fg">
              <Icon name="info" size={18} />
              무엇이 전달되나요?
            </span>
            <p className="m-0 text-sm leading-[1.7] text-body">
              대화 원문 전체가 아니라, 학부모님이 <strong>확인한 요약만</strong> 전달됩니다. 전달 동의 기록은 안전하게
              보관돼요.
            </p>
          </div>
          <div className="flex flex-col gap-2 rounded-[22px] border border-line bg-white p-[22px]">
            <span className="text-[15px] font-bold">‘상담만 종료’를 선택하면</span>
            <p className="m-0 text-sm leading-[1.7] text-body">
              상담은 AI에서 끝나요. 선생님 화면에는 어떤 내용도 표시되지 않아요. 종료한 상담은 나중에 전달할 수 없어요.
            </p>
          </div>
        </aside>
      </div>
      <div className="px-4 pb-6">
        <EmergencyFootnote />
      </div>
    </ParentShell>
  );
}

function Step({ icon, title, desc }: { icon: "school" | "clock" | "chat"; title: string; desc: string }) {
  return (
    <li className="flex gap-3.5">
      <span className="flex size-9 flex-none items-center justify-center rounded-full bg-parent-bubble text-deep-green">
        <Icon name={icon} size={18} />
      </span>
      <span className="flex flex-col gap-0.5">
        <strong className="text-[15px]">{title}</strong>
        <span className="text-sm text-[#4D6157]">{desc}</span>
      </span>
    </li>
  );
}
