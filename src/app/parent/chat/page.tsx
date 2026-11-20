import { Suspense } from "react";
import { GREETING } from "@/lib/ai/counselor-prompt";
import { ChatView } from "@/components/parent/ChatView";
import { ParentShell, ProgressPanel } from "@/components/parent/ParentShell";
import { getParentContext } from "../data";

// 새 상담. 첫 메시지를 보내는 순간 상담(conversation)이 만들어진다.
export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-muted">불러오는 중…</p>}>
      <NewChat />
    </Suspense>
  );
}

async function NewChat() {
  const { profile, schoolName, childList, conversations } = await getParentContext();

  return (
    <ParentShell
      schoolName={schoolName}
      userName={profile.display_name}
      status={null}
      conversations={conversations}
      currentId={null}
      aside={<ProgressPanel status={null} />}
    >
      {childList.length > 0 ? (
        <ChatView
          key="new"
          greeting={GREETING}
          dateLabel={null}
          childList={childList}
          conversationId={null}
          status={null}
          initialMessages={[]}
        />
      ) : (
        <p className="p-8 text-body">등록된 자녀가 없어요. 학교에 문의해 주세요.</p>
      )}
    </ParentShell>
  );
}
