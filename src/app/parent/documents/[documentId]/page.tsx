import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Icon } from "@/components/brand/icons";
import { EmergencyFootnote, ParentShell } from "@/components/parent/ParentShell";
import { SCOPE_LABEL, type DocScope } from "@/lib/documents";
import { formatKoreanDateTime, getParentContext } from "../../data";

// 학교 자료 원문 보기 — AI 답변의 근거 카드에서 연다.
// RLS: 학부모는 우리 학교 학교 자료·교육·법률 자료 + 자녀 반 학급 자료만 읽을 수 있다 (0008). 다른 자료 id 는 404.
export default function Page(props: PageProps<"/parent/documents/[documentId]">) {
  return (
    <Suspense fallback={<p className="p-6 text-muted">불러오는 중…</p>}>
      <DocumentPage params={props.params} />
    </Suspense>
  );
}

async function DocumentPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const { supabase, profile, schoolName, conversations } = await getParentContext();
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) notFound();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, scope, title, source, body, is_sample, created_at")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) notFound();

  return (
    <ParentShell
      schoolName={schoolName}
      userName={profile.display_name}
      status={null}
      conversations={conversations}
      currentId={null}
    >
      <main className="mx-auto box-border flex w-full max-w-[860px] flex-col gap-5 px-4 pt-7 pb-14 sm:px-10">
        <div className="flex flex-col gap-2">
          <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="rounded-md bg-bg-soft px-2 py-0.5 font-bold text-ok-fg">{SCOPE_LABEL[doc.scope as DocScope]}</span>
            {doc.is_sample && <span className="rounded-md bg-warn-bg px-2 py-0.5 font-bold text-warn-fg">시연용 가상 자료</span>}
            등록 {formatKoreanDateTime(doc.created_at)}
          </span>
          <h2 className="m-0 text-[26px] font-black tracking-[-0.6px] text-heading sm:text-[30px]">{doc.title}</h2>
          {doc.source && <span className="text-[15px] text-body">출처 · {doc.source}</span>}
        </div>

        <article className="rounded-3xl border border-line bg-white px-5 py-6 sm:px-8">
          <p className="m-0 text-base leading-[1.85] whitespace-pre-wrap text-ink sm:text-[17px]">{doc.body}</p>
        </article>

        <p className="m-0 flex items-start gap-2 rounded-2xl bg-bg-soft px-4 py-3 text-sm leading-[1.6] text-body">
          <span className="flex pt-0.5 text-ok-fg">
            <Icon name="info" size={16} />
          </span>
          학교가 등록한 자료예요. 내용이 바뀌었을 수 있으니 정확한 확인이 필요하면 담임 선생님께 여쭤 보세요.
        </p>
        <EmergencyFootnote />
      </main>
    </ParentShell>
  );
}
