import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/brand/icons";
import { EmergencyFootnote, ParentShell } from "@/components/parent/ParentShell";
import { ReplyConfirm } from "@/components/parent/ReplyConfirm";
import { formatCaseTime, sharedWithLabel } from "@/lib/cases";
import { SUMMARY_ROWS, parseSummary } from "@/lib/summary";
import { formatKoreanDateTime, getParentCase, getParentContext } from "../../data";

// 선생님 답변 확인 (design/screens/ParentReply.html). 디자인의 상담 시간 선택은 만들지 않기로 함(2026-11-28).
export default function Page(props: PageProps<"/parent/cases/[caseId]">) {
  return (
    <Suspense fallback={<p className="p-6 text-muted">불러오는 중…</p>}>
      <ReplyPage params={props.params} />
    </Suspense>
  );
}

async function ReplyPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const { supabase, profile, schoolName, conversations } = await getParentContext();
  // RLS: 다른 사람의 Case id 를 넣으면 아무것도 나오지 않는다 → 404
  const kase = await getParentCase(supabase, caseId);
  if (!kase) notFound();

  const summary = parseSummary(kase.finalSummary);
  const reply = kase.replies.at(-1) ?? null;
  const teacher = kase.classLabel ? `${kase.classLabel} 담임 선생님` : "담임 선생님";
  const sharedWith = sharedWithLabel(kase.sharedManagerAt, kase.sharedAdminAt);

  const steps = [
    { label: "AI 사전상담", at: kase.consultedAt },
    { label: "요약 확인 · 학교 전달", at: kase.sentAt },
    { label: "담임 선생님 확인", at: kase.viewedAt },
    { label: "답변 도착", at: reply?.createdAt ?? null },
  ];
  const current = steps.findIndex((s) => !s.at);

  return (
    <ParentShell
      schoolName={schoolName}
      userName={profile.display_name}
      status="CASE_CREATED"
      caseStatus={kase.status}
      conversations={conversations}
      currentId={kase.conversationId}
      aside={<ReplyAside />}
    >
      <main className="mx-auto box-border flex w-full max-w-[980px] flex-col gap-[22px] px-4 pt-7 pb-14 sm:px-10 sm:pt-8">
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">{formatKoreanDateTime(kase.consultedAt)} 상담 · {teacher}께 전달</span>
          <h2 className="m-0 text-[26px] font-black tracking-[-0.8px] text-heading sm:text-[34px]">
            {reply ? "선생님의 답변이 도착했어요" : "선생님이 확인하고 있어요"}
          </h2>
        </div>

        {/* 진행 상황 */}
        <ol aria-label="진행 상황" className="m-0 grid list-none grid-cols-2 gap-x-2 gap-y-4 rounded-[20px] border border-line bg-white px-6 py-5 sm:grid-cols-4">
          {steps.map((s, i) => {
            const done = !!s.at;
            const isLastDone = done && (current === -1 ? i === steps.length - 1 : i === current - 1);
            return (
              <li key={s.label} aria-current={isLastDone ? "step" : undefined} className="flex flex-col items-start gap-2">
                <span className="flex w-full items-center gap-2">
                  <span
                    className={
                      "flex size-[30px] flex-none items-center justify-center rounded-full " +
                      (isLastDone
                        ? "bg-ai-bubble text-white shadow-[0_0_0_5px_#DCEFC9]"
                        : done
                          ? "bg-deep-green text-white"
                          : "border border-line bg-white text-muted")
                    }
                  >
                    {done ? <Icon name={i === 3 ? "chat" : "circleCheck"} size={15} /> : <span className="text-xs font-bold">{i + 1}</span>}
                  </span>
                  {i < steps.length - 1 && <span className={"hidden h-0.5 flex-1 sm:block " + (steps[i + 1].at ? "bg-deep-green" : "bg-line")} />}
                </span>
                <strong className={"text-sm " + (isLastDone ? "text-ok-fg" : done ? "" : "text-muted")}>{s.label}</strong>
                <span className="text-xs text-muted">{s.at ? formatCaseTime(s.at) : "기다리는 중"}</span>
              </li>
            );
          })}
        </ol>

        {/* 선생님 답변 */}
        {reply ? (
          <article
            aria-label="선생님 답변"
            className="overflow-hidden rounded-3xl border-[1.5px] border-[#CFE3C4] bg-white shadow-[0_16px_40px_rgba(15,77,58,0.07)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 bg-bg-soft px-5 py-[22px] sm:px-7">
              <div className="flex items-center gap-3.5">
                <span className="flex size-[52px] items-center justify-center rounded-full bg-deep-green text-logo-lime">
                  <Icon name="user" size={26} />
                </span>
                <div className="leading-[1.4]">
                  <strong className="text-lg">{reply.authorName} 선생님</strong>
                  <div className="text-sm text-[#4D6157]">{formatKoreanDateTime(reply.createdAt)}</div>
                </div>
              </div>
              {sharedWith && (
                <span className="inline-flex items-center gap-1.5 rounded-[10px] bg-white px-3 py-1.5 text-[13px] text-ok-fg">
                  <Icon name="shieldCheck" size={16} />
                  {sharedWith}과 함께 확인한 문의예요
                </span>
              )}
            </div>
            <p className="m-0 px-5 py-[26px] text-base leading-[1.85] whitespace-pre-wrap text-[#1D3D32] sm:px-7 sm:text-[17px]">
              {reply.body}
            </p>
          </article>
        ) : (
          <div className="flex flex-col gap-2 rounded-3xl border border-dashed border-[#CFE3C4] bg-white px-6 py-8 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-parent-bubble text-deep-green">
              <Icon name="clock" size={26} />
            </span>
            <p className="m-0 text-[17px] font-bold text-heading">
              {kase.viewedAt ? `${teacher}이 문의를 확인했어요` : `${teacher}께 전달되었어요`}
            </p>
            <p className="m-0 text-[15px] text-body">답변이 도착하면 상담 내역에 ‘선생님 답변 도착’으로 표시돼요.</p>
          </div>
        )}

        {/* 내가 학교에 전달한 내용 */}
        {summary && (
          <details className="group rounded-[20px] border border-line bg-white">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2.5 px-6 py-[18px] text-base font-bold [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2.5">
                <Icon name="fileText" size={20} />
                내가 학교에 전달한 내용
              </span>
              <span className="text-sm font-medium text-muted group-open:hidden">펼쳐 보기</span>
              <span className="hidden text-sm font-medium text-muted group-open:inline">접기</span>
            </summary>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-2.5 px-6 pb-[22px] text-sm leading-[1.65]">
              {SUMMARY_ROWS.map((row) => (
                <div key={row.key} className="rounded-xl bg-[#F6FAF2] px-4 py-3.5">
                  <strong className="mb-1 block">{row.label}</strong>
                  <span className="whitespace-pre-wrap">{summary[row.key] || "—"}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        {reply && <ReplyConfirm caseId={kase.id} status={kase.status} />}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/parent/chat/${kase.conversationId}`}
            className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-bold text-deep-green underline underline-offset-4"
          >
            <Icon name="chat" size={18} />
            AI와 나눈 대화 다시 보기
          </Link>
          <EmergencyFootnote />
        </div>
      </main>
    </ParentShell>
  );
}

function ReplyAside() {
  return (
    <aside
      aria-label="안내"
      className="box-border hidden w-[300px] flex-none flex-col gap-5 border-l border-[#E3EEDD] bg-white px-6 py-7 xl:flex"
    >
      <div className="flex flex-col gap-2.5 rounded-[18px] bg-bg-soft p-5">
        <span className="flex items-center gap-2 text-[15px] font-bold text-ok-fg">
          <Icon name="lock" size={18} />
          학부모님만 볼 수 있어요
        </span>
        <p className="m-0 text-sm leading-[1.65] text-body">
          선생님 답변과 상담 기록은 학부모님 계정에서만 열람돼요. 선생님께는 학부모님이 확인한 요약만 전달됐고, 학교 쪽 열람 기록도 남아요.
        </p>
      </div>
      <div className="flex flex-col gap-2 rounded-[18px] border border-[#F3D2CF] bg-danger-bg p-5">
        <span className="text-[15px] font-bold text-danger-fg">긴급한 상황이라면</span>
        <p className="m-0 text-sm leading-[1.65] text-danger-fg">경찰 112 · 소방·구급 119 · 자살예방상담 109로 바로 연락해 주세요.</p>
      </div>
    </aside>
  );
}
