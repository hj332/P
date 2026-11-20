import { Suspense } from "react";
import { notFound } from "next/navigation";
import { GREETING } from "@/lib/ai/counselor-prompt";
import { ChatView } from "@/components/parent/ChatView";
import { ParentShell, ProgressPanel } from "@/components/parent/ParentShell";
import { formatKoreanDateTime, getConversation, getParentContext } from "../../data";

export default function Page(props: PageProps<"/parent/chat/[conversationId]">) {
  return (
    <Suspense fallback={<p className="p-6 text-muted">불러오는 중…</p>}>
      <ChatPage params={props.params} />
    </Suspense>
  );
}

async function ChatPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const { supabase, profile, schoolName, childList, conversations } = await getParentContext();
  // RLS: 다른 사람의 상담 id 를 넣으면 아무것도 나오지 않는다 → 404
  const conv = await getConversation(supabase, conversationId);
  if (!conv) notFound();

  return (
    <ParentShell
      schoolName={schoolName}
      userName={profile.display_name}
      status={conv.status}
      caseStatus={conv.caseStatus}
      conversations={conversations}
      currentId={conv.id}
      aside={<ProgressPanel status={conv.status} />}
    >
      <ChatView
        key={conv.id}
        greeting={GREETING}
        dateLabel={formatKoreanDateTime(conv.createdAt)}
        childList={childList}
        conversationId={conv.id}
        status={conv.status}
        initialMessages={conv.messages}
      />
    </ParentShell>
  );
}
