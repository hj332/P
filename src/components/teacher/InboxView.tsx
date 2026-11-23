"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Icon, type IconName } from "@/components/brand/icons";
import type { InboxCase } from "@/app/teacher/data";
import { escalateCase, generateReplyDraft, sendReply } from "@/app/teacher/actions";
import {
  BLANK_PATTERN,
  REPLY_MAX,
  SHARE_TARGETS,
  canReply,
  caseStatusOf,
  formatCaseTime,
  shareableTargets,
  type ShareTarget,
} from "@/lib/cases";

type Mode = "teacher" | "admin";
type Filter = "all" | "new" | "waiting" | "done";

// 필터 이름과 기준 (교사: 미확인 → 답변 대기 → 답변 완료 / 공유받은 사람: 확인 전 → 확인 중 → 답변 완료)
// 공유받은 사람(교장·교감, 학년부장)의 "확인 전/확인 중"은 Case 상태가 아니라 내가 열었는지(myViewedAt)로 정한다.
// (둘 다에게 공유됐을 때 한 사람이 열었다고 다른 사람 화면까지 "확인 중"이 되지 않게)
const FILTERS: Record<Mode, { key: Filter; label: string; match: (c: InboxCase) => boolean }[]> = {
  teacher: [
    { key: "all", label: "전체", match: () => true },
    { key: "new", label: "미확인", match: (c) => c.status === "NEW" },
    { key: "waiting", label: "답변 대기", match: (c) => ["TEACHER_REVIEWING", "ESCALATED", "ADMIN_REVIEWING"].includes(c.status) },
    { key: "done", label: "답변 완료", match: (c) => c.status === "RESOLVED" || c.status === "CLOSED" },
  ],
  admin: [
    { key: "all", label: "전체", match: () => true },
    { key: "new", label: "확인 전", match: (c) => !c.reply && !c.myViewedAt },
    { key: "waiting", label: "확인 중", match: (c) => !c.reply && !!c.myViewedAt },
    { key: "done", label: "답변 완료", match: (c) => !!c.reply },
  ],
};

// 목록의 상태 표시. 공유받은 사람 화면에서는 "내가 열었는지" 기준.
function statusFor(c: InboxCase, mode: Mode) {
  if (mode === "teacher" || c.reply) return caseStatusOf(c.status);
  return c.myViewedAt ? { label: "확인 중", fg: "text-ok-fg" } : { label: "확인 전", fg: "text-warn-fg" };
}

// 교사 업무함 목록 + 상세 카드 (design/screens/TeacherInbox.html). 관리자 목록(mode="admin")도 같은 화면을 쓴다.
export function InboxView({
  cases,
  mode = "teacher",
  viewerRole = "TEACHER",
}: {
  cases: InboxCase[];
  mode?: Mode;
  // 보는 사람의 역할 (학년부장이면 교장·교감에게 공유 버튼이 생긴다)
  viewerRole?: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  // 처음에는 아무것도 열지 않는다. 목록에서 직접 눌렀을 때만 상세를 열고 열람 기록을 남긴다.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const filters = FILTERS[mode];

  const visible = useMemo(() => {
    const q = query.trim();
    const match = filters.find((f) => f.key === filter)?.match ?? (() => true);
    return cases.filter((c) => {
      if (!match(c)) return false;
      if (!q) return true;
      return c.studentName.includes(q) || (c.summary?.topic ?? "").includes(q);
    });
  }, [cases, filter, filters, query]);

  const selected = cases.find((c) => c.id === selectedId) ?? null;

  // 상세를 실제로 열었을 때만 열람 기록을 남긴다 (같은 Case 는 화면에 있는 동안 한 번만)
  const logged = useRef(new Set<string>());
  useEffect(() => {
    if (!selected || logged.current.has(selected.id)) return;
    logged.current.add(selected.id);
    // 미확인 → 확인 중 (교사), 확인 전 → 확인 중 (공유받은 사람) 으로 바뀌는 경우에만 다시 불러온다
    const willChange = mode === "teacher" ? selected.status === "NEW" : !selected.myViewedAt;
    fetch(`/${mode}/cases/${selected.id}/open`, { method: "POST" })
      .then((r) => {
        if (r.ok && willChange) router.refresh();
      })
      .catch(() => logged.current.delete(selected.id)); // 네트워크 실패면 다음에 다시 시도
  }, [selected, router, mode]);

  function pick(id: string) {
    setSelectedId(id);
    // 좁은 화면에서는 상세가 목록 아래에 있으므로 그쪽으로 스크롤한다
    if (window.innerWidth < 1024) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  if (cases.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-line bg-white p-10 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-parent-bubble text-deep-green">
          <Icon name="fileText" size={30} />
        </span>
        <h2 className="m-0 text-xl font-black text-heading">
          {mode === "admin" ? "공유받은 문의가 없어요" : "아직 전달된 문의가 없어요"}
        </h2>
        <p className="m-0 text-[15px] text-body">
          {mode === "admin"
            ? "담임 선생님이 [관리자와 공유]를 누른 문의만 이곳에 나타나요."
            : "학부모님이 요약을 확인하고 전달에 동의하면 이곳에 나타나요."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-5">
      {/* 목록 */}
      <section aria-label="문의 목록" className="flex max-w-[420px] min-w-0 flex-[1_1_320px] flex-col gap-2.5">
        <label className="flex min-h-11 items-center gap-2.5 rounded-xl bg-white px-3.5 text-muted ring-1 ring-[#E3EEDD]">
          <Icon name="search" size={18} />
          <span className="sr-only">문의 검색</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="학생 이름, 상담 주제로 검색"
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-[#7A8A82]"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="상태로 거르기">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={
                "min-h-[38px] rounded-full px-3.5 text-sm " +
                (filter === f.key ? "bg-deep-green font-bold text-white" : "border border-[#DDE9D6] bg-white text-body")
              }
            >
              {f.label} {cases.filter((c) => f.match(c)).length}
            </button>
          ))}
        </div>

        {visible.map((c) => {
          const active = c.id === selectedId;
          const st = statusFor(c, mode);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={active}
              onClick={() => pick(c.id)}
              className={
                "flex w-full flex-col gap-2.5 rounded-[18px] bg-white p-[18px] text-left text-ink " +
                (active ? "border-2 border-ai-bubble shadow-[0_10px_24px_rgba(15,77,58,0.10)]" : "border border-line hover:border-[#CFE3C4]")
              }
            >
              <span className="flex items-center justify-between gap-2">
                {mode === "admin" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#EFEAFB] px-2.5 py-0.5 text-xs font-bold text-[#4B3A84]">
                    <Icon name="share" size={14} />
                    공유받은 문의
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-ok-bg px-2.5 py-0.5 text-xs font-bold text-ok-fg">
                    <Icon name="circleCheck" size={14} />
                    학부모 전달 동의
                  </span>
                )}
                <span className="text-xs text-muted">{formatCaseTime(mode === "admin" && c.escalatedAt ? c.escalatedAt : c.createdAt)}</span>
              </span>
              <strong className="text-[17px] font-bold">{c.summary?.topic ?? "상담 요청"}</strong>
              <span className="flex items-center justify-between text-[13px] text-[#4D6157]">
                <span>
                  {c.classLabel ? `${c.classLabel} ` : ""}
                  {c.studentName} 학부모
                </span>
                <span className={`font-bold ${st.fg}`}>{st.label}</span>
              </span>
            </button>
          );
        })}
        {visible.length === 0 && <p className="m-0 p-4 text-center text-sm text-muted">조건에 맞는 문의가 없어요.</p>}

        <p className="m-0 mt-1 flex gap-2 text-[13px] leading-[1.6] text-muted">
          <span className="flex pt-0.5">
            <Icon name="info" size={16} />
          </span>
          {mode === "admin"
            ? "담임 선생님이 공유하지 않은 문의는 관리자에게 보이지 않아요."
            : "학부모가 ‘상담만 종료’한 대화는 업무함에 나타나지 않아요."}
        </p>
      </section>

      {/* 상세 카드 */}
      <div ref={detailRef} className="flex min-w-0 flex-[999_1_480px] scroll-mt-4">
        {selected ? (
          // key: 다른 문의를 열면 작성 중이던 답변 상태를 새로 시작한다
          <CaseDetail key={selected.id} c={selected} mode={mode} viewerRole={viewerRole} />
        ) : (
          <div className="flex w-full flex-col items-center gap-3 rounded-3xl border border-dashed border-[#CFE3C4] bg-white px-6 py-14 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-parent-bubble text-deep-green">
              <Icon name="fileText" size={26} />
            </span>
            <p className="m-0 text-[17px] font-bold text-heading">목록에서 문의를 선택해 주세요</p>
            <p className="m-0 text-sm text-muted">
              {mode === "admin" ? "문의를 열면 ‘관리자 확인 중’으로 바뀌고 열람 기록이 남아요." : "문의를 열면 ‘확인 중’으로 바뀌고 열람 기록이 남아요."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function CaseDetail({ c, mode, viewerRole }: { c: InboxCase; mode: Mode; viewerRole: string }) {
  const s = c.summary;
  const targets = shareableTargets(c, mode === "teacher" ? "TEACHER" : viewerRole);
  return (
    <article aria-label="문의 상세" className="w-full min-w-0 overflow-hidden rounded-3xl border border-line bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3.5 border-b border-[#EEF4EA] px-5 py-6 sm:px-[30px]">
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-2xl font-black tracking-[-0.5px] sm:text-[26px]">{s?.topic ?? "상담 요청"}</h2>
          <span className="text-[15px] text-[#4D6157]">
            {c.classLabel ? `${c.classLabel} ` : ""}
            {c.studentName} 학부모 · 접수 {formatCaseTime(c.createdAt)}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-xl bg-ok-bg px-3.5 py-2 text-sm font-bold text-ok-fg">
            <Icon name="circleCheck" size={18} />
            학부모 전달 동의함
          </span>
          {(
            [
              ["MANAGER", c.sharedManagerAt],
              ["ADMIN", c.sharedAdminAt],
            ] as [ShareTarget, string | null][]
          ).map(([t, at]) =>
            at ? (
              <span
                key={t}
                className="inline-flex items-center gap-2 rounded-xl bg-[#EFEAFB] px-3.5 py-2 text-sm font-bold text-[#4B3A84]"
              >
                <Icon name="share" size={18} />
                {SHARE_TARGETS[t].who}과 공유함 · {formatCaseTime(at)}
              </span>
            ) : null,
          )}
        </div>
      </div>

      {s ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 px-5 py-6 sm:px-[30px]">
          <Box full tone="soft" icon="fileText" label="있었던 일 (학부모가 확인한 사실)" labelClass="text-ok-fg" text={s.facts} large />
          <Box icon="heart" label="학부모가 특히 우려하는 부분" labelClass="text-[#4B3A84]" text={s.interpretation} />
          <Box icon="chat" label="학부모 요청사항" labelClass="text-warn-fg" text={s.requests} />
          <Box full tone="dashed" icon="search" label="아직 확인되지 않은 부분" labelClass="text-body" text={s.unknowns} />
        </div>
      ) : (
        <p className="m-0 px-[30px] py-6 text-body">요약을 불러오지 못했어요.</p>
      )}

      {c.notes.length > 0 && <ShareNotes c={c} />}

      {c.reply ? (
        <SentReply c={c} />
      ) : mode === "teacher" && canReply(c.status) ? (
        <ReplyComposer c={c} />
      ) : mode === "admin" ? (
        <p className="m-0 mx-5 mb-6 flex items-center gap-2 rounded-2xl bg-bg-soft px-5 py-4 text-[15px] text-body sm:mx-[30px]">
          <Icon name="clock" size={18} />
          담임 선생님이 답변을 준비하고 있어요. 답변은 담임 선생님이 학부모님께 보내요.
        </p>
      ) : null}

      {targets.length > 0 && <SharePanel c={c} targets={targets} asManager={mode === "admin"} />}

      <div className="flex items-center gap-2 border-t border-[#EEF4EA] bg-[#FAFCF8] px-5 py-3.5 text-xs text-muted sm:px-[30px]">
        <Icon name="lock" size={14} />
        학부모가 확인한 요약만 표시됩니다 · 대화 원문은 볼 수 없어요 · 열람 기록이 남아요
      </div>
    </article>
  );
}

function SentReply({ c }: { c: InboxCase }) {
  const r = c.reply!;
  return (
    <section aria-label="보낸 답변" className="mx-5 mb-6 flex flex-col gap-2.5 rounded-2xl border border-[#CFE3C4] bg-[#F6FAF2] px-5 py-[18px] sm:mx-[30px]">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <strong className="flex items-center gap-2 text-[15px] text-ok-fg">
          <Icon name="send" size={18} />
          보낸 답변 · {r.authorName}
        </strong>
        <span className="text-xs text-muted">{formatCaseTime(r.createdAt)}</span>
      </span>
      <p className="m-0 text-[15px] leading-[1.8] whitespace-pre-wrap">{r.body}</p>
      <span className={"flex items-center gap-1.5 text-sm font-bold " + (c.status === "CLOSED" ? "text-ok-fg" : "text-muted")}>
        <Icon name={c.status === "CLOSED" ? "circleCheck" : "clock"} size={16} />
        {c.status === "CLOSED" ? "학부모님이 ‘답변 잘 받았어요’를 눌렀어요" : "학부모님이 아직 답변을 확인하지 않았어요"}
      </span>
    </section>
  );
}

// 답변 작성 + AI 답변 초안
function ReplyComposer({ c }: { c: InboxCase }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [fromDraft, setFromDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blankWarned, setBlankWarned] = useState(false);
  const [drafting, startDraft] = useTransition();
  const [sending, startSend] = useTransition();
  const busy = drafting || sending;

  function getDraft() {
    if (body.trim() && !window.confirm("작성 중인 내용을 AI 답변 초안으로 바꿀까요?")) return;
    setError(null);
    setOpen(true);
    startDraft(async () => {
      const res = await generateReplyDraft(c.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBody(res.draft);
      setFromDraft(true);
      setBlankWarned(false);
    });
  }

  function send() {
    const text = body.trim();
    if (!text) {
      setError("답변 내용을 입력해 주세요.");
      return;
    }
    // 초안의 [빈칸]이 남아 있으면 한 번 알려 준다. 한 번 더 누르면 보낸다.
    if (BLANK_PATTERN.test(text) && !blankWarned) {
      setBlankWarned(true);
      setError(null);
      return;
    }
    setError(null);
    startSend(async () => {
      const res = await sendReply(c.id, text);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  const blank = body.match(BLANK_PATTERN)?.[0];

  return (
    <section aria-label="답변 작성" className="flex flex-col gap-3 px-5 pb-[26px] sm:px-[30px]">
      {open && (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-[#CFE3C4] bg-bg-soft px-5 py-[18px]">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={`reply-${c.id}`} className="flex items-center gap-2 text-[15px] font-bold text-ok-fg">
              <Icon name={fromDraft ? "sparkles" : "pencil"} size={18} />
              {fromDraft ? "AI 답변 초안 · 고쳐서 보내 주세요" : "답변 작성"}
            </label>
            <span className="text-xs text-muted">
              {fromDraft ? "그대로 보내지지 않아요 · [대괄호] 부분은 선생님이 채워 주세요" : `${body.length} / ${REPLY_MAX}자`}
            </span>
          </span>
          <textarea
            id={`reply-${c.id}`}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setBlankWarned(false);
            }}
            maxLength={REPLY_MAX}
            rows={11}
            disabled={drafting || sending}
            placeholder={drafting ? "AI가 요약을 바탕으로 초안을 쓰고 있어요…" : "학부모님께 보낼 답변을 써 주세요."}
            className="min-h-[220px] w-full resize-y rounded-xl border-[1.5px] border-[#D6E5CF] bg-white px-4 py-3 text-[15px] leading-[1.8] text-ink outline-leaf disabled:bg-[#F6F9F3]"
          />
          {fromDraft && (
            <p className="m-0 text-[13px] leading-[1.6] text-muted">
              AI 초안은 학부모가 확인한 요약만 보고 썼어요. 학교에서 실제로 있었던 일은 AI가 알지 못하므로 선생님이 직접 확인해 채워 주세요.
            </p>
          )}
        </div>
      )}

      {blankWarned && blank && (
        <p role="alert" className="m-0 rounded-xl bg-warn-bg px-4 py-3 text-sm font-medium text-warn-fg">
          아직 채우지 않은 빈칸이 있어요: <strong>{blank}</strong> · 이대로 보내려면 [그래도 보내기]를 눌러 주세요.
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger-fg">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2.5">
        {open ? (
          <button
            type="button"
            onClick={send}
            disabled={busy || !body.trim()}
            className="inline-flex min-h-[50px] items-center gap-2 rounded-xl bg-deep-green px-[22px] text-base font-bold text-white disabled:opacity-50"
          >
            <Icon name="send" size={18} />
            {sending ? "보내는 중…" : blankWarned ? "그래도 보내기" : "답변 보내기"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={busy}
            className="inline-flex min-h-[50px] items-center gap-2 rounded-xl bg-deep-green px-[22px] text-base font-bold text-white disabled:opacity-50"
          >
            <Icon name="pencil" size={18} />
            답변 작성
          </button>
        )}
        <button
          type="button"
          onClick={getDraft}
          disabled={busy}
          className="inline-flex min-h-[50px] items-center gap-2 rounded-xl border-[1.5px] border-[#9CCB84] bg-white px-[22px] text-base font-bold text-ok-fg disabled:opacity-50"
        >
          <Icon name="sparkles" size={18} />
          {drafting ? "초안 쓰는 중…" : fromDraft ? "AI 초안 다시 받기" : "AI 답변 초안"}
        </button>
        {open && !busy && (
          <button
            type="button"
            onClick={() => {
              if (body.trim() && !window.confirm("작성 중인 답변을 지울까요?")) return;
              setOpen(false);
              setBody("");
              setFromDraft(false);
              setBlankWarned(false);
              setError(null);
            }}
            className="inline-flex min-h-[50px] items-center px-3 text-[15px] text-muted underline underline-offset-4"
          >
            취소
          </button>
        )}
      </div>
      {open && <p className="m-0 text-[13px] text-muted">보낸 답변은 학부모님 화면에 바로 표시되고, 보낸 뒤에는 고칠 수 없어요.</p>}
    </section>
  );
}

// 교직원끼리 남긴 공유 메모 (학부모에게는 보이지 않음 — DB RLS)
function ShareNotes({ c }: { c: InboxCase }) {
  return (
    <section aria-label="공유 메모" className="mx-5 mb-5 flex flex-col gap-2 rounded-2xl border border-[#DDD3F3] bg-[#F7F4FD] px-5 py-4 sm:mx-[30px]">
      <span className="flex items-center gap-2 text-sm font-bold text-[#4B3A84]">
        <Icon name="share" size={16} />
        공유 메모 · 교직원만 볼 수 있어요
      </span>
      {c.notes.map((n, i) => (
        <div key={i} className="flex flex-col gap-1 rounded-xl bg-white px-4 py-3">
          <span className="text-xs text-muted">
            {n.authorName} → {SHARE_TARGETS[n.target].who} · {formatCaseTime(n.createdAt)}
          </span>
          <p className="m-0 text-[15px] leading-[1.7] whitespace-pre-wrap">{n.note}</p>
        </div>
      ))}
    </section>
  );
}

// [관리자와 공유] 담임: 학년부장·교장교감 중 선택 / 학년부장: 교장·교감에게. 메모는 선택.
function SharePanel({ c, targets, asManager }: { c: InboxCase; targets: ShareTarget[]; asManager: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ShareTarget>(targets[0]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sharing, start] = useTransition();
  const chosen = targets.includes(target) ? target : targets[0];

  function share() {
    const who = SHARE_TARGETS[chosen].who;
    if (
      !window.confirm(
        `이 문의를 ${who}과 공유할까요?\n${who}도 이 요약과 답변${note.trim() ? ", 메모" : ""}를 볼 수 있게 돼요. 학부모님께 답변은 계속 담임 선생님이 보내요.`,
      )
    )
      return;
    setError(null);
    start(async () => {
      const res = await escalateCase(c.id, chosen, note);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <section aria-label="관리자와 공유" className="flex flex-col gap-3 px-5 pb-[26px] sm:px-[30px]">
      {!open ? (
        <div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-[50px] items-center gap-2 rounded-xl border-[1.5px] border-[#CFC2EE] bg-white px-[22px] text-base font-bold text-[#4B3A84]"
          >
            <Icon name="share" size={18} />
            {asManager ? "교장·교감 선생님께 공유" : "관리자와 공유"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-[#DDD3F3] bg-[#F7F4FD] px-5 py-4">
          {targets.length > 1 ? (
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-2 text-[15px] font-bold text-[#4B3A84]">누구와 공유할까요?</legend>
              <div className="flex flex-wrap gap-2">
                {targets.map((t) => (
                  <label
                    key={t}
                    className={
                      "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-white px-4 text-[15px] font-bold ring-1 " +
                      (chosen === t ? "text-[#4B3A84] ring-2 ring-[#8D78D6]" : "text-body ring-[#CFC2EE]")
                    }
                  >
                    <input
                      type="radio"
                      name={`share-${c.id}`}
                      checked={chosen === t}
                      onChange={() => setTarget(t)}
                      className="accent-[#4B3A84]"
                    />
                    {SHARE_TARGETS[t].label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <span className="text-[15px] font-bold text-[#4B3A84]">{SHARE_TARGETS[chosen].label} 공유해요</span>
          )}
          <label className="flex flex-col gap-1.5 text-sm font-bold text-body">
            메모 (선택) · 받는 선생님께 남길 말
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder={asManager ? "예) 비슷한 문의가 학년에 반복되고 있어 학교 차원의 확인이 필요해 보여요." : "예) 학부모님 요청이 강해 함께 봐 주시면 좋겠어요."}
              className="w-full resize-y rounded-xl border-[1.5px] border-[#D9CFF2] bg-white px-4 py-3 text-[15px] leading-[1.7] font-normal text-ink outline-[#8D78D6]"
            />
          </label>
          <p className="m-0 text-[13px] leading-[1.6] text-muted">
            메모는 이 문의를 보는 선생님들만 볼 수 있고, 학부모님께는 보이지 않아요.
            {!asManager && targets.length > 1 && " 답변하기 전이라면 남은 한 분과도 나중에 공유할 수 있어요."}
          </p>
          {error && (
            <p role="alert" className="m-0 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger-fg">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={share}
              disabled={sharing}
              className="inline-flex min-h-[50px] items-center gap-2 rounded-xl bg-[#4B3A84] px-[22px] text-base font-bold text-white disabled:opacity-50"
            >
              <Icon name="share" size={18} />
              {sharing ? "공유하는 중…" : "공유하기"}
            </button>
            {!sharing && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
                className="inline-flex min-h-[50px] items-center px-3 text-[15px] text-muted underline underline-offset-4"
              >
                취소
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Box({
  icon,
  label,
  labelClass,
  text,
  full,
  tone,
  large,
}: {
  icon: IconName;
  label: string;
  labelClass: string;
  text: string;
  full?: boolean;
  tone?: "soft" | "dashed";
  large?: boolean;
}) {
  const toneClass =
    tone === "soft" ? "bg-[#F6FAF2]" : tone === "dashed" ? "border border-dashed border-[#CFE3C4]" : "border border-[#E8EFE4]";
  return (
    <div className={`flex flex-col gap-2 rounded-2xl px-5 py-[18px] ${toneClass} ${full ? "col-span-full" : ""}`}>
      <span className={`flex items-center gap-2 text-sm font-bold ${labelClass}`}>
        <Icon name={icon} size={16} />
        {label}
      </span>
      <p className={`m-0 leading-[1.7] whitespace-pre-wrap ${large ? "text-base" : "text-[15px]"}`}>{text || "—"}</p>
    </div>
  );
}
