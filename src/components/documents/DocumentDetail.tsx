import Link from "next/link";
import { Icon } from "@/components/brand/icons";
import { SCOPE_LABEL, type DocScope } from "@/lib/documents";

// 교사·교장교감 화면의 학교 자료 원문 (관련 학교 자료 → 원문 보기, 자료 목록 → 제목)
export function DocumentDetail({
  doc,
  backHref,
}: {
  doc: { scope: DocScope; classLabel: string | null; title: string; source: string; body: string; isSample: boolean; createdAt: string };
  backHref: string;
}) {
  const created = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" }).format(
    new Date(doc.createdAt),
  );
  return (
    <main className="flex max-w-[900px] flex-col gap-5 px-4 pt-[30px] pb-12 sm:px-8">
      <Link href={backHref} className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-deep-green">
        <Icon name="arrowLeft" size={16} />
        자료 목록
      </Link>
      <div className="flex flex-col gap-2">
        <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="rounded-md bg-bg-soft px-2 py-0.5 font-bold text-ok-fg">
            {SCOPE_LABEL[doc.scope]}
            {doc.classLabel ? ` · ${doc.classLabel}` : ""}
          </span>
          {doc.isSample && <span className="rounded-md bg-warn-bg px-2 py-0.5 font-bold text-warn-fg">시연용 가상 자료</span>}
          등록 {created}
        </span>
        <h1 className="m-0 text-[26px] font-black tracking-[-0.6px] text-heading sm:text-[30px]">{doc.title}</h1>
        {doc.source && <span className="text-[15px] text-body">출처 · {doc.source}</span>}
      </div>
      <article className="rounded-3xl border border-line bg-white px-5 py-6 sm:px-8">
        <p className="m-0 text-base leading-[1.85] whitespace-pre-wrap text-ink">{doc.body}</p>
      </article>
    </main>
  );
}
