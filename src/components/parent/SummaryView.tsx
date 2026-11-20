"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/brand/icons";
import { continueConsultation, endConsultation, saveSummaryDraft, sendToSchool } from "@/app/parent/actions";
import { SUMMARY_MAX, SUMMARY_ROWS, type Summary } from "@/lib/summary";

type Mode = "review" | "sent" | "closed";

const TAG_STYLE = {
  사실: "bg-ok-bg text-ok-fg",
  해석: "bg-[#F1EEF8] text-[#4B3A84]",
  요구: "bg-warn-bg text-warn-fg",
} as const;

// 상담 내용 정리 → 확인·수정 → 전달 선택 (design/screens/ParentSummary.html 왼쪽 영역)
export function SummaryView({
  conversationId,
  initialMode,
  summary: initialSummary,
  classLabel,
}: {
  conversationId: string;
  initialMode: Mode;
  summary: Summary | null;
  classLabel: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [summary, setSummary] = useState<Summary | null>(initialSummary);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const teacher = classLabel ? `${classLabel} 담임 선생님` : "담임 선생님";

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after: () => void) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      after();
    });
  }

  function toggleEdit() {
    if (!summary) return;
    if (!editing) {
      setEditing(true);
      return;
    }
    // [수정 완료] → 초안 저장
    if (!dirty) {
      setEditing(false);
      return;
    }
    run(
      () => saveSummaryDraft(conversationId, summary),
      () => {
        setEditing(false);
        setDirty(false);
      },
    );
  }

  const send = () =>
    summary &&
    run(
      () => sendToSchool(conversationId, summary),
      () => {
        setEditing(false);
        setMode("sent");
        router.refresh();
      },
    );

  const close = () =>
    run(
      () => endConsultation(conversationId),
      () => {
        setEditing(false);
        setMode("closed");
        router.refresh();
      },
    );

  const backToChat = () =>
    run(
      () => continueConsultation(conversationId),
      () => router.push(`/parent/chat/${conversationId}`),
    );

  if (mode === "sent") {
    return (
      <div className="flex flex-col gap-[22px]">
        <ResultCard
          tone="sent"
          title="학교에 전달되었어요"
          body={
            <>
              확인하신 요약이 {teacher} 업무함에 등록되었어요.
              <br />
              대화 원문은 전달되지 않고, 아래 요약만 전달됐어요.
            </>
          }
        >
          <Link
            href="/parent/chat"
            className="inline-flex min-h-[52px] items-center gap-2 rounded-full bg-deep-green px-6 text-[17px] font-bold text-white"
          >
            새 상담 시작하기
          </Link>
          <Link
            href={`/parent/chat/${conversationId}`}
            className="inline-flex min-h-[52px] items-center rounded-full border-[1.5px] border-[#CFDCCB] bg-white px-6 text-[17px] font-bold text-deep-green"
          >
            상담 내역 보기
          </Link>
        </ResultCard>
        {summary && (
          <>
            <h3 className="m-0 mt-2 text-xl font-black text-heading">전달한 내용</h3>
            <Rows summary={summary} editing={false} onChange={() => {}} />
          </>
        )}
      </div>
    );
  }

  if (mode === "closed") {
    return (
      <ResultCard
        tone="closed"
        title="상담을 마쳤어요"
        body={
          <>
            이 상담은 학교에 전달되지 않았어요. 선생님과 학교는 대화 내용을 볼 수 없어요.
            <br />
            다시 이야기하고 싶으시면 언제든 새 상담을 시작해 주세요.
          </>
        }
      >
        <Link
          href="/parent/chat"
          className="inline-flex min-h-[52px] items-center gap-2 rounded-full bg-deep-green px-6 text-[17px] font-bold text-white"
        >
          새 상담 시작하기
        </Link>
      </ResultCard>
    );
  }

  if (!summary) return null;

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="m-0 flex items-center gap-3.5 text-[30px] font-black tracking-[-1px] text-heading sm:text-[40px]">
          <span className="flex text-deep-green">
            <Icon name="fileText" size={40} />
          </span>
          상담 내용 정리
        </h2>
        <span className="text-sm text-muted">AI가 정리한 초안 · 학부모님이 직접 고칠 수 있어요</span>
      </div>

      <Rows
        summary={summary}
        editing={editing}
        onChange={(key, value) => {
          setSummary((s) => (s ? { ...s, [key]: value } : s));
          setDirty(true);
        }}
      />

      {editing && (
        <div className="flex items-center gap-2.5 rounded-[14px] bg-[#FFF8EC] px-[18px] py-3.5 text-[15px] text-[#7A3A06]">
          <Icon name="pencil" size={18} />
          수정 중이에요. 고친 내용 그대로 학교에 전달됩니다.
        </div>
      )}

      <h3 className="m-0 mt-3 text-xl font-black text-heading sm:text-2xl">
        이 내용이 맞나요? 이 내용을 학교에 전달하시겠습니까?
      </h3>

      {error && (
        <p role="alert" className="m-0 rounded-xl bg-danger-bg px-4 py-3 text-[15px] font-medium text-danger-fg">
          {error}
        </p>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        <button
          type="button"
          onClick={send}
          disabled={pending || !summary.topic.trim()}
          className="flex min-h-16 items-center justify-center gap-3 rounded-[14px] bg-deep-green text-xl font-bold text-white hover:bg-[#0A3A2B] disabled:opacity-50"
        >
          <Icon name="send" size={22} />
          학교에 전달하기
        </button>
        <button
          type="button"
          onClick={toggleEdit}
          disabled={pending}
          className="flex min-h-16 items-center justify-center gap-3 rounded-[14px] border-[1.5px] border-[#CFDCCB] bg-white text-xl font-bold text-deep-green hover:bg-bg-soft disabled:opacity-50"
        >
          <Icon name={editing ? "circleCheck" : "pencil"} size={22} />
          {editing ? "수정 완료" : "내용 수정"}
        </button>
        <button
          type="button"
          onClick={close}
          disabled={pending}
          className="flex min-h-16 items-center justify-center gap-3 rounded-[14px] border-[1.5px] border-[#CFDCCB] bg-white text-xl font-bold text-deep-green hover:bg-bg-soft disabled:opacity-50"
        >
          <Icon name="xCircle" size={22} />
          상담만 종료
        </button>
      </div>

      {pending && <p className="m-0 text-center text-[15px] text-muted">처리하고 있어요…</p>}

      <button
        type="button"
        onClick={backToChat}
        disabled={pending}
        className="inline-flex min-h-11 items-center gap-1.5 self-center text-base font-medium text-body underline-offset-4 hover:underline disabled:opacity-50"
      >
        <Icon name="arrowLeft" size={18} />
        조금 더 상담하기
      </button>
    </div>
  );
}

function Rows({
  summary,
  editing,
  onChange,
}: {
  summary: Summary;
  editing: boolean;
  onChange: (key: keyof Summary, value: string) => void;
}) {
  return (
    <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
      {SUMMARY_ROWS.map((row, i) => (
        <li
          key={row.key}
          className="flex flex-wrap items-center gap-[18px] rounded-[20px] border border-line bg-white px-5 py-5 sm:px-7 sm:py-6"
        >
          <div className="flex flex-[0_0_260px] items-center gap-4 sm:gap-5">
            <span className="flex size-[52px] flex-none items-center justify-center rounded-full bg-parent-bubble text-xl font-bold text-deep-green">
              {i + 1}
            </span>
            <span className="flex flex-col gap-1">
              <strong className="text-[19px] font-bold sm:text-[21px]">{row.label}</strong>
              {row.tag && (
                <span className={`self-start rounded-md px-2 py-px text-xs font-bold ${TAG_STYLE[row.tag]}`}>{row.tag}</span>
              )}
            </span>
          </div>
          <div className="min-w-0 flex-[1_1_300px] sm:border-l sm:border-line sm:pl-6">
            {editing ? (
              <label className="flex flex-col gap-1.5">
                <span className="sr-only">{row.label} 수정</span>
                <textarea
                  value={summary[row.key]}
                  onChange={(e) => onChange(row.key, e.target.value)}
                  rows={row.key === "topic" ? 1 : 3}
                  maxLength={row.key === "topic" ? SUMMARY_MAX.topic : SUMMARY_MAX.other}
                  className="box-border w-full resize-y rounded-xl border-[1.5px] border-[#9CCB84] bg-[#FBFEF8] px-3.5 py-3 text-[17px] leading-[1.6] text-ink"
                />
              </label>
            ) : (
              <p className="m-0 text-[17px] leading-[1.7] whitespace-pre-wrap text-[#24443A] sm:text-lg">
                {summary[row.key] || "—"}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ResultCard({
  tone,
  title,
  body,
  children,
}: {
  tone: "sent" | "closed";
  title: string;
  body: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-[18px] rounded-[28px] border border-line bg-white p-8 text-center sm:p-12">
      <span
        className={
          "flex size-[88px] items-center justify-center rounded-full " +
          (tone === "sent" ? "bg-parent-bubble text-ai-bubble" : "bg-[#F2F4F1] text-body")
        }
      >
        <Icon name={tone === "sent" ? "circleCheck" : "xCircle"} size={tone === "sent" ? 48 : 44} />
      </span>
      <h2 className="m-0 text-[28px] font-black text-heading sm:text-[34px]">{title}</h2>
      <p className="m-0 text-[17px] leading-[1.7] text-body sm:text-lg">{body}</p>
      <div className="flex flex-wrap justify-center gap-3 pt-2">{children}</div>
    </div>
  );
}
