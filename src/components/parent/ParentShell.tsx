import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { LogoMark } from "@/components/brand/Logo";
import { Icon } from "@/components/brand/icons";
import { statusLabel } from "@/lib/summary";
import { hasReply } from "@/lib/cases";
import { formatShortDate, type ConversationItem } from "@/app/parent/data";

// 학부모 화면 틀 (design/screens/ParentChat.html): 헤더 + 왼쪽 상담 내역 + 본문 + (선택) 오른쪽 패널
export function ParentShell({
  schoolName,
  userName,
  status,
  caseStatus,
  conversations,
  currentId,
  aside,
  children,
}: {
  schoolName: string;
  userName: string;
  status: string | null;
  caseStatus?: string | null;
  conversations: ConversationItem[];
  currentId: string | null;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <header className="border-b border-[#E3EEDD] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-8 sm:py-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Link href="/" aria-label="온담 AI 첫 화면" className="flex flex-none">
              <LogoMark size={44} />
            </Link>
            <h1 className="m-0 truncate text-xl font-black tracking-[-0.5px] text-heading sm:text-[28px]">
              {schoolName} <span className="ml-1">ON:DAM AI 상담실</span>
            </h1>
          </div>
          <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end sm:gap-3">
            <StatusPill status={status} caseStatus={caseStatus} />
            <LogoutButton userName={userName} />
          </div>
        </div>
      </header>

      <div className="flex flex-1 items-stretch">
        <ConversationSidebar conversations={conversations} currentId={currentId} />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 좁은 화면: 사이드바 대신 새 상담 버튼만 */}
          <div className="flex items-center justify-between gap-3 border-b border-[#E3EEDD] bg-[#F6FAF2] px-4 py-2.5 lg:hidden">
            <span className="text-sm text-muted">상담 내역은 넓은 화면에서 볼 수 있어요</span>
            <Link
              href="/parent/chat"
              className="flex min-h-11 items-center gap-1.5 rounded-xl bg-deep-green px-4 text-sm font-bold text-white"
            >
              <Icon name="chat" size={16} />새 상담
            </Link>
          </div>
          {children}
        </div>
        {aside}
      </div>
    </div>
  );
}

export function StatusPill({ status, caseStatus }: { status: string | null; caseStatus?: string | null }) {
  if (status === "CASE_CREATED" || status === "CONSENTED") {
    const reviewing = caseStatus && caseStatus !== "NEW";
    return (
      <span className="inline-flex min-h-10 items-center gap-2 rounded-full text-[13px] sm:text-[15px] bg-deep-green px-3.5 sm:px-[18px] text-white">
        <span className="size-[9px] rounded-full bg-logo-lime" />
        {/* DESIGN.md 2장: RESOLVED(답변 등록) → 학교 전달 완료 · 선생님 답변 도착 */}
        학교 전달 완료 · {hasReply(caseStatus) ? "선생님 답변 도착" : `담임 선생님 ${reviewing ? "확인 중" : "확인 대기"}`}
      </span>
    );
  }
  if (status === "CLOSED_AI") {
    return (
      <span className="inline-flex min-h-10 items-center gap-2 rounded-full text-[13px] sm:text-[15px] border border-[#DDE9D6] bg-[#F2F4F1] px-3.5 sm:px-[18px] text-body">
        <span className="size-[9px] rounded-full bg-[#9AA8A0]" />
        상담을 마쳤어요 · 학교에 전달되지 않았어요
      </span>
    );
  }
  return (
    <span className="inline-flex min-h-10 items-center gap-2 rounded-full text-[13px] sm:text-[15px] border border-[#DDE9D6] bg-bg px-3.5 sm:px-[18px] text-body">
      <span className="size-[9px] rounded-full bg-[#5FA33A]" />
      AI 사전상담 · 학교 미전달
    </span>
  );
}

function ConversationSidebar({ conversations, currentId }: { conversations: ConversationItem[]; currentId: string | null }) {
  const open = conversations.filter((c) => ["ACTIVE", "WAITING_FOR_PARENT", "SUMMARY_READY", "CONSENT_PENDING"].includes(c.status));
  const past = conversations.filter((c) => !open.includes(c));

  return (
    <aside
      aria-label="상담 내역"
      className="box-border hidden w-[280px] flex-none flex-col gap-[18px] border-r border-[#E3EEDD] bg-[#F6FAF2] px-[18px] py-6 lg:flex"
    >
      <Link
        href="/parent/chat"
        className="flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-deep-green text-[15px] font-bold text-white hover:bg-[#0A3A2B]"
      >
        <Icon name="chat" size={18} />새 상담 시작하기
      </Link>

      {open.length > 0 && (
        <nav aria-label="진행 중인 상담" className="flex flex-col gap-2">
          <span className="px-1.5 text-[13px] font-bold text-muted">진행 중</span>
          {open.map((c) => (
            <SidebarItem key={c.id} c={c} current={c.id === currentId} />
          ))}
        </nav>
      )}

      {past.length > 0 && (
        <nav aria-label="지난 상담" className="flex flex-col gap-2">
          <span className="px-1.5 text-[13px] font-bold text-muted">지난 상담</span>
          {past.map((c) => (
            <SidebarItem key={c.id} c={c} current={c.id === currentId} />
          ))}
        </nav>
      )}

      <div className="mt-auto flex gap-2.5 rounded-[14px] border border-[#E3EEDD] bg-white p-3.5 text-[13px] leading-[1.6] text-[#4D6157]">
        <span className="flex pt-0.5 text-leaf">
          <Icon name="lock" size={16} />
        </span>
        <span>상담 내역은 학부모님만 볼 수 있어요. ‘학교에 전달하기’를 선택한 상담만 선생님께 전달됩니다.</span>
      </div>
    </aside>
  );
}

function SidebarItem({ c, current }: { c: ConversationItem; current: boolean }) {
  const sent = c.status === "CASE_CREATED" || c.status === "CONSENTED";
  // 선생님 답변이 온 상담은 답변 화면으로 바로 간다
  const replied = hasReply(c.caseStatus);
  const label = c.caseStatus === "CLOSED" ? "상담 완료" : replied ? "선생님 답변 도착" : statusLabel(c.status);
  return (
    <Link
      href={replied && c.caseId ? `/parent/cases/${c.caseId}` : `/parent/chat/${c.id}`}
      aria-current={current ? "page" : undefined}
      className={
        "flex flex-col gap-1.5 rounded-[14px] p-3.5 text-ink " +
        (current ? "border-[1.5px] border-[#9CCB84] bg-white" : "hover:bg-white/70")
      }
    >
      <strong className={"text-[15px] " + (current ? "font-bold" : "font-medium")}>{c.title}</strong>
      <span className="flex items-center gap-1.5 text-xs text-[#4D6157]">
        <span
          className={
            "rounded-md px-2 py-0.5 " +
            (replied && c.caseStatus !== "CLOSED"
              ? "bg-highlight font-bold text-heading"
              : sent
                ? "bg-[#DCEFC9] font-bold text-ok-fg"
                : "bg-[#EEF2EC]")
          }
        >
          {label}
        </span>
        {formatShortDate(c.createdAt)}
      </span>
    </Link>
  );
}

// 하단 안내 (DESIGN.md 8장: 모든 학부모 상담 화면 하단에 긴급 연락처)
export function EmergencyFootnote() {
  return (
    <p className="m-0 flex flex-wrap justify-center gap-1.5 text-center text-[13px] text-muted">
      AI는 사실관계나 잘잘못을 판단하지 않아요.
      <strong className="text-warn-fg">긴급한 상황은 112 · 119 · 자살예방상담 109</strong>
    </p>
  );
}

const STEPS = ["공감", "탐색", "정리", "안내", "확인 · 선택"];

// 오른쪽 패널: 상담 진행 단계 + 전달 여부 안내
export function ProgressPanel({ status, children }: { status: string | null; children?: ReactNode }) {
  // 상담 중에는 공감·탐색, 요약 확인 중에는 확인·선택, 끝나면 모두 완료로 표시한다.
  const current =
    status === "CONSENT_PENDING" || status === "SUMMARY_READY" ? 4 : status && !["ACTIVE", "WAITING_FOR_PARENT"].includes(status) ? 5 : 1;
  const sent = status === "CASE_CREATED" || status === "CONSENTED";

  return (
    <aside
      aria-label="상담 진행 상태"
      className="box-border hidden w-[300px] flex-none flex-col gap-[26px] border-l border-[#E3EEDD] bg-white px-6 py-7 xl:flex"
    >
      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[17px] font-bold">상담 진행 단계</h2>
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {STEPS.map((s, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <li
                key={s}
                aria-current={active ? "step" : undefined}
                className={"flex items-center gap-3.5 py-2.5 " + (active ? "-mx-3 rounded-[14px] bg-parent-bubble px-3" : "")}
              >
                <span
                  className={
                    "flex size-[34px] items-center justify-center rounded-full text-sm font-bold " +
                    (done ? "bg-deep-green text-white" : active ? "bg-ai-bubble text-white" : "border border-line bg-white text-muted")
                  }
                >
                  {done ? <Icon name="circleCheck" size={16} /> : i + 1}
                </span>
                <span className="text-[15px]">{s}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex flex-col gap-2.5 rounded-[18px] bg-bg-soft p-5">
        <span className="flex items-center gap-2 text-[15px] font-bold text-ok-fg">
          <Icon name={sent ? "circleCheck" : "lock"} size={18} />
          {sent ? "학교에 전달되었어요" : status === "CLOSED_AI" ? "학교에 전달되지 않았어요" : "아직 학교에 전달되지 않았어요"}
        </span>
        <p className="m-0 text-sm leading-[1.65] text-body">
          {sent
            ? "학부모님이 확인한 요약만 담임 선생님께 전달됐어요. 대화 원문은 전달되지 않아요."
            : "이 대화는 학부모님과 AI만 볼 수 있어요. 마지막에 정리된 요약을 확인하고, 원하실 때만 학교에 전달됩니다."}
        </p>
      </div>
      {children}
    </aside>
  );
}
