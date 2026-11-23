"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { AiAvatar } from "@/components/brand/Logo";
import { Icon } from "@/components/brand/icons";
import { createSummary, retryReply, sendParentMessage, type ChatMessage } from "@/app/parent/actions";
import { isOpen } from "@/lib/summary";

const QUICK_STARTS = ["학교생활 정보가 궁금해요", "아이와 관련해 담임선생님께 상담을 요청하고 싶어요"];

// 학부모 AI 상담 채팅 (design/screens/ParentChat.html 가운데 영역)
export function ChatView({
  greeting,
  dateLabel,
  childList,
  conversationId: initialId,
  status,
  initialMessages,
  replyHref = null,
}: {
  greeting: string;
  dateLabel: string | null;
  childList: { id: string; label: string }[];
  conversationId: string | null;
  status: string | null;
  initialMessages: ChatMessage[];
  // 학교에 전달한 상담에 선생님 답변이 왔으면 답변 화면 주소
  replyHref?: string | null;
}) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState(initialId);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [studentId, setStudentId] = useState<string | null>(childList[0]?.id ?? null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [summarizing, startSummarize] = useTransition();
  const [offerDismissedAt, setOfferDismissedAt] = useState(-1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const tempSeq = useRef(0);

  const open = status === null || isOpen(status);
  const reviewing = status === "CONSENT_PENDING" || status === "SUMMARY_READY";
  const parentCount = messages.filter((m) => m.role === "parent").length;
  const busy = pending || summarizing;
  const last = messages.at(-1);
  // AI 가 "정리 단계"라고 표시한 답변 바로 뒤에만 "정리해 드릴까요?" 를 보여 준다.
  // [조금 더 이야기할게요]로 닫으면, 다음에 AI 가 다시 정리 단계에 올 때까지 나오지 않는다.
  const showOffer =
    open &&
    !reviewing &&
    !busy &&
    last?.role === "assistant" &&
    !!last.suggestSummary &&
    offerDismissedAt !== messages.length;
  // 입력창 옆 작은 버튼: 학부모가 한 번이라도 이야기했으면 언제든 정리할 수 있다.
  const canSummarize = open && !reviewing && !!conversationId && parentCount >= 1;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending, showOffer]);

  // "새 상담" 화면(/parent/chat)은 떠날 때마다 처음 상태로 되돌린다.
  // Next.js 16(Cache Components)은 떠난 화면을 지우지 않고 숨겨서 보관한다(최대 3개, React Activity).
  // 그냥 두면 첫 메시지로 만든 상담이 이 화면에 남아 있다가, 나중에 [새 상담 시작하기]를 눌렀을 때
  // 이미 끝난 예전 대화가 다시 보인다. 숨겨질 때 실행되는 정리 함수에서 비운다.
  // (node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md 의 "새로 시작해야 하는 화면" 방식)
  // (자녀 목록은 화면을 새로 받을 때마다 새 배열이 되므로 의존값에 넣지 않는다 — 대화 도중에 비워지지 않게)
  const isNewChat = initialId === null;
  const firstChildId = useRef(childList[0]?.id ?? null);
  useLayoutEffect(() => {
    if (!isNewChat) return;
    const defaultChild = firstChildId.current;
    return () => {
      setConversationId(null);
      setMessages([]);
      setText("");
      setError(null);
      setOfferDismissedAt(-1);
      setStudentId(defaultChild);
    };
  }, [isNewChat]);

  // 답변이 10초 넘게 걸리면 기다리는 중이라고 알려 준다 (무료 AI 는 붐빌 때 느리다)
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setSlow(true), 10_000);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [pending]);

  function send(raw: string) {
    const body = raw.trim();
    if (!body || busy || !open) return;
    setError(null);
    setText("");
    const tempId = `temp-${++tempSeq.current}`;
    setMessages((m) => [...m, { id: tempId, role: "parent", content: body }]);

    startTransition(async () => {
      const res = await sendParentMessage({ conversationId, studentId, text: body });
      setMessages((m) => {
        const rest = m.filter((x) => x.id !== tempId);
        if (res.ok) return [...rest, res.parent, res.assistant];
        return res.parent ? [...rest, res.parent] : rest;
      });
      if (!res.ok) {
        setError(res.error);
        if (!res.parent) setText(body); // 저장도 안 됐으면 입력창에 되돌려 준다
      } else if (res.warning) {
        setError(res.warning);
      }
      if (res.conversationId && res.conversationId !== conversationId) {
        setConversationId(res.conversationId);
        // 새 상담이 만들어졌고 답변까지 받았으면 주소와 왼쪽 목록을 맞춘다.
        // (실패했을 때 이동하면 오류 안내가 사라지므로, 그때는 이 화면에 머문다)
        if (res.ok) router.replace(`/parent/chat/${res.conversationId}`, { scroll: false });
      } else if (reviewing) {
        router.refresh(); // 요약 확인 중에 다시 이야기하면 상태가 '상담 중'으로 돌아간다
      }
    });
  }

  // AI 가 답하지 못한 마지막 메시지에 다시 답변 받기
  function retry() {
    if (!conversationId || busy) return;
    setError(null);
    startTransition(async () => {
      const res = await retryReply(conversationId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessages((m) => [...m, res.assistant]);
      if (res.warning) setError(res.warning);
      if (initialId !== conversationId) router.replace(`/parent/chat/${conversationId}`, { scroll: false });
    });
  }

  const needsRetry = open && !busy && !!conversationId && messages.at(-1)?.role === "parent";

  function summarize() {
    if (!conversationId || busy) return;
    setError(null);
    startSummarize(async () => {
      const res = await createSummary(conversationId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/parent/chat/${conversationId}/summary`);
    });
  }

  const notStarted = messages.length === 0;

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <div
        className="mx-auto box-border flex w-full max-w-[920px] flex-1 flex-col gap-[18px] px-4 py-6 sm:px-10 sm:py-8"
        aria-live="polite"
      >
        {dateLabel && (
          <div className="self-center rounded-full bg-[#EEF4EA] px-3.5 py-1 text-[13px] text-muted">{dateLabel}</div>
        )}

        {/* 첫 인사 (저장하지 않는 고정 문구) */}
        <AiRow>
          <AiBubble first>{greeting}</AiBubble>
          {notStarted && childList.length > 1 && (
            <label className="text-sm text-muted">
              어느 자녀에 관한 상담인가요?{" "}
              <select
                value={studentId ?? ""}
                onChange={(e) => setStudentId(e.target.value || null)}
                className="ml-1 min-h-11 rounded-xl border border-line bg-white px-2 text-ink"
              >
                {childList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {notStarted && (
            <div className="flex flex-wrap gap-2.5">
              {QUICK_STARTS.map((q) => (
                <Chip key={q} onClick={() => send(q)} disabled={busy}>
                  {q}
                </Chip>
              ))}
            </div>
          )}
        </AiRow>

        {messages.map((m) =>
          m.role === "parent" ? (
            <ParentBubble key={m.id}>{m.content}</ParentBubble>
          ) : (
            <AiRow key={m.id}>
              <AiBubble first>{m.content}</AiBubble>
            </AiRow>
          ),
        )}

        {pending && (
          <div className="flex flex-wrap items-center gap-3 self-start sm:ml-16">
            <div aria-label="AI가 입력 중" className="flex gap-1.5 rounded-[18px] bg-[#EEF4EA] px-[18px] py-3.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-2 animate-pulse rounded-full bg-[#8FB39E]"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
            {slow && <span className="text-sm text-muted">답변이 조금 늦어지고 있어요. 잠시만 기다려 주세요…</span>}
          </div>
        )}

        {needsRetry && (
          <div className="flex flex-wrap items-center gap-3 self-start sm:ml-16">
            <span className="text-[15px] text-body">온담 AI가 아직 답하지 못했어요.</span>
            <Chip onClick={retry}>답변 다시 받기</Chip>
          </div>
        )}

        {showOffer && (
          <AiRow>
            <AiBubble>
              지금까지 나눈 이야기를 정리해 드릴까요? 정리된 내용을 확인하신 뒤 학교 전달 여부를 직접 정하실 수 있어요.
            </AiBubble>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={summarize}
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-deep-green px-[22px] text-base font-bold text-white hover:bg-[#0A3A2B]"
              >
                <Icon name="fileText" size={18} />
                상담 내용 정리하기
              </button>
              <Chip onClick={() => setOfferDismissedAt(messages.length)}>조금 더 이야기할게요</Chip>
            </div>
          </AiRow>
        )}

        {summarizing && (
          <div className="flex items-center gap-3 self-center rounded-full bg-bg-soft px-5 py-3 text-[15px] font-medium text-ok-fg">
            <span className="size-2.5 animate-pulse rounded-full bg-ai-bubble" />
            상담 내용을 정리하고 있어요… (10초 정도 걸려요)
          </div>
        )}

        {reviewing && conversationId && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#CFE6C2] bg-bg-soft px-5 py-4">
            <span className="text-[15px] font-medium text-ok-fg">정리된 요약이 있어요. 아직 학교에는 전달되지 않았어요.</span>
            <Link
              href={`/parent/chat/${conversationId}/summary`}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-deep-green px-5 text-[15px] font-bold text-white"
            >
              요약 확인하기 <Icon name="arrowRight" size={18} />
            </Link>
          </div>
        )}

        {!open && conversationId && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-line bg-white px-5 py-4">
            <span className="text-[15px] text-body">
              {status === "CLOSED_AI"
                ? "상담만 하고 마친 대화예요. 학교에 전달되지 않았어요."
                : replyHref
                  ? "선생님 답변이 도착했어요. 더 이야기하려면 새 상담을 시작해 주세요."
                  : "학교에 전달된 상담이에요. 더 이야기하려면 새 상담을 시작해 주세요."}
            </span>
            <div className="flex flex-wrap gap-2">
              {replyHref && (
                <Link
                  href={replyHref}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-deep-green px-5 text-[15px] font-bold text-white"
                >
                  <Icon name="chat" size={18} />
                  선생님 답변 보기
                </Link>
              )}
              {status !== "CLOSED_AI" && (
                <Link
                  href={`/parent/chat/${conversationId}/summary`}
                  className="inline-flex min-h-11 items-center rounded-full border-[1.5px] border-[#CFDCCB] px-5 text-[15px] font-bold text-deep-green"
                >
                  전달한 내용 보기
                </Link>
              )}
              <Link
                href="/parent/chat"
                className={
                  "inline-flex min-h-11 items-center rounded-full px-5 text-[15px] font-bold " +
                  (replyHref ? "border-[1.5px] border-[#CFDCCB] text-deep-green" : "bg-deep-green text-white")
                }
              >
                새 상담 시작하기
              </Link>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div className="sticky bottom-0 mx-auto box-border flex w-full max-w-[920px] flex-col gap-2.5 bg-gradient-to-t from-bg from-70% to-transparent px-4 pt-3 pb-5 sm:px-10 sm:pb-7">
        {error && (
          <p role="alert" className="m-0 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger-fg">
            {error}
          </p>
        )}
        {canSummarize && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={summarize}
              disabled={busy}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] border-[#9CCB84] bg-white px-4 text-sm font-medium text-ok-fg hover:bg-bg-soft disabled:opacity-50"
            >
              <Icon name="fileText" size={16} />
              {summarizing ? "정리하고 있어요…" : "상담 내용 정리하기"}
            </button>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
          className="flex items-end gap-3 rounded-[22px] border border-[#DDE9D6] bg-white py-2.5 pr-2.5 pl-[18px] shadow-[0_8px_24px_rgba(15,77,58,0.06)]"
        >
          <label className="flex flex-1">
            <span className="sr-only">메시지 입력</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(text);
                }
              }}
              rows={1}
              maxLength={2000}
              disabled={!open}
              placeholder={open ? "궁금한 내용을 입력해 주세요." : "끝난 상담이에요"}
              className="max-h-40 min-h-12 flex-1 resize-none border-0 bg-transparent py-3 text-[17px] leading-6 text-ink outline-none placeholder:text-[#7A8A82] disabled:cursor-not-allowed"
            />
          </label>
          <button
            type="submit"
            aria-label="보내기"
            disabled={busy || !open || !text.trim()}
            className="flex size-14 flex-none items-center justify-center rounded-full bg-deep-green text-white hover:bg-[#0A3A2B] disabled:opacity-40"
          >
            <Icon name="arrowRight" size={22} />
          </button>
        </form>
        <p className="m-0 flex flex-wrap justify-center gap-1.5 text-center text-[13px] text-muted">
          AI는 사실관계나 잘잘못을 판단하지 않아요.
          <strong className="text-warn-fg">긴급한 상황은 112 · 119 · 자살예방상담 109</strong>
        </p>
      </div>
    </main>
  );
}

function AiRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-w-[92%] items-start gap-3 sm:max-w-[84%]">
      <span className="hidden sm:flex">
        <AiAvatar size={52} />
      </span>
      <span className="flex sm:hidden">
        <AiAvatar size={36} />
      </span>
      <div className="flex min-w-0 flex-col gap-2.5">{children}</div>
    </div>
  );
}

function AiBubble({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div
      className={
        "bg-ai-bubble px-[18px] py-3.5 text-[15px] leading-[1.65] whitespace-pre-wrap text-white sm:px-[22px] sm:py-[18px] sm:text-lg " +
        (first ? "rounded-[6px_22px_22px_22px]" : "rounded-[22px]")
      }
    >
      {children}
    </div>
  );
}

function ParentBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-w-[88%] items-start gap-3 self-end sm:max-w-[78%]">
      <div className="rounded-[22px_6px_22px_22px] border-[1.5px] border-deep-green bg-parent-bubble px-[18px] py-3.5 text-[15px] leading-[1.65] whitespace-pre-wrap sm:px-[22px] sm:py-[18px] sm:text-lg">
        {children}
      </div>
      <span className="hidden size-[52px] flex-none items-center justify-center rounded-full bg-[#E2EFDB] text-deep-green sm:flex">
        <Icon name="user" size={26} />
      </span>
    </div>
  );
}

function Chip({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-11 rounded-full border-[1.5px] border-[#9CCB84] bg-white px-[18px] text-[15px] text-ok-fg hover:bg-bg-soft disabled:opacity-50"
    >
      {children}
    </button>
  );
}
