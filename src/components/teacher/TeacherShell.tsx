import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { LogoMark } from "@/components/brand/Logo";
import { Icon } from "@/components/brand/icons";

const AREAS = {
  teacher: {
    section: "교사",
    href: "/teacher/inbox",
    archiveHref: "/teacher/archive",
    docsHref: "/teacher/documents",
    docsNav: "학교·학급 자료",
    nav: "교사 업무함",
    noteTitle: "학부모가 동의한 내용만",
    note: "학부모가 직접 확인하고 전달에 동의한 요약만 이곳에 와요. AI와 나눈 대화 원문과 ‘상담만 종료’한 상담은 볼 수 없어요.",
    header: "온담 AI · 교사",
  },
  admin: {
    section: "관리자",
    href: "/admin",
    archiveHref: "/admin/archive",
    docsHref: "/admin/documents",
    docsNav: "학교 자료",
    nav: "공유받은 문의",
    noteTitle: "담임이 공유한 문의만",
    note: "담임 선생님(또는 학년부장 선생님)이 공유한 문의만 이곳에 와요. 학부모가 확인한 요약과 답변만 보이고, 대화 원문은 볼 수 없어요.",
    header: "온담 AI · 관리자",
  },
} as const;

// 교사·관리자 화면 틀 (design/screens/TeacherInbox.html): 왼쪽 딥그린 사이드바 + 위쪽 헤더 + 본문
export function TeacherShell({
  userName,
  newCount,
  area = "teacher",
  current = "inbox",
  archivedCount = 0,
  showDocs = true,
  children,
}: {
  userName: string;
  newCount: number;
  area?: keyof typeof AREAS;
  // 지금 보고 있는 메뉴: 업무함(답변 대기·최근) / 지난 문의함(답변 후 2일 지난 문의) / 학교 자료(v2 C)
  current?: "inbox" | "archive" | "docs";
  archivedCount?: number;
  // 학교 자료 메뉴 (교사: 학급 자료 등록 / 교장·교감: 학교·교육법률 자료 등록). 학년부장은 등록하지 않아 숨김.
  showDocs?: boolean;
  children: ReactNode;
}) {
  const a = AREAS[area];
  const links = [
    { key: "inbox", href: a.href, label: a.nav, icon: "fileText" as const },
    { key: "archive", href: a.archiveHref, label: "지난 문의함", icon: "clock" as const },
    ...(showDocs ? [{ key: "docs", href: a.docsHref, label: a.docsNav, icon: "book" as const }] : []),
  ];
  const navClass = (on: boolean) =>
    "flex min-h-[46px] items-center gap-3 rounded-xl px-3 text-[15px] " +
    (on ? "bg-ai-bubble font-bold text-white" : "text-[#D9EBDF] hover:bg-[#1C5E49]");
  return (
    <div className="flex min-h-dvh items-stretch bg-[#F6F9F3] text-ink">
      <nav
        aria-label="교사 메뉴"
        className="box-border hidden w-[264px] flex-none flex-col gap-7 bg-deep-green px-[18px] py-[26px] text-[#D9EBDF] lg:flex"
      >
        <Link href="/" className="flex items-center gap-2.5 px-2 text-white">
          <LogoMark variant="lime" size={36} />
          <span className="text-[22px] font-black">
            온담 <span className="font-bold text-[#B9E08A]">AI</span>
          </span>
        </Link>
        <div className="flex flex-col gap-1">
          <span className="px-3 pb-1.5 text-xs font-bold tracking-[1px] text-[#9CC4AE]">{a.section}</span>
          <Link href={a.href} aria-current={current === "inbox" ? "page" : undefined} className={navClass(current === "inbox")}>
            <Icon name="fileText" />
            {a.nav}
            {newCount > 0 && (
              <span className="ml-auto min-w-6 rounded-full bg-highlight px-[7px] text-center text-xs leading-[22px] text-heading">
                {newCount}
              </span>
            )}
          </Link>
          <Link
            href={a.archiveHref}
            aria-current={current === "archive" ? "page" : undefined}
            className={navClass(current === "archive")}
          >
            <Icon name="clock" />
            지난 문의함
            {archivedCount > 0 && <span className="ml-auto text-[13px] text-[#9CC4AE]">{archivedCount}</span>}
          </Link>
          {showDocs && (
            <Link href={a.docsHref} aria-current={current === "docs" ? "page" : undefined} className={navClass(current === "docs")}>
              <Icon name="book" />
              {a.docsNav}
            </Link>
          )}
        </div>
        <div className="mt-auto flex flex-col gap-2 rounded-2xl bg-[#1C5E49] p-4 text-[13px] leading-[1.6]">
          <span className="flex items-center gap-2 font-bold text-white">
            <Icon name="lock" size={16} />
            {a.noteTitle}
          </span>
          <span>{a.note}</span>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3.5 border-b border-[#E3EEDD] bg-white px-4 py-3.5 sm:px-8">
          <Link href={a.href} className="flex items-center gap-2.5 lg:hidden">
            <LogoMark size={36} />
            <span className="text-lg font-black text-heading">{links.find((l) => l.key === current)?.label ?? a.nav}</span>
          </Link>
          {/* 좁은 화면: 사이드바 대신 다른 메뉴 바로가기 */}
          <span className="flex flex-wrap gap-1.5 lg:hidden">
            {links
              .filter((l) => l.key !== current)
              .map((l) => (
                <Link
                  key={l.key}
                  href={l.href}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-bold text-deep-green"
                >
                  <Icon name={l.icon} size={16} />
                  {l.label}
                </Link>
              ))}
          </span>
          <span className="hidden text-sm text-muted lg:inline">{a.header}</span>
          <LogoutButton userName={userName} />
        </header>
        {children}
      </div>
    </div>
  );
}

// 위쪽 숫자 카드 (교사 업무함·관리자 목록)
export function Kpi({ label, value, sub, dark }: { label: string; value: number; sub: string; dark?: boolean }) {
  return (
    <div
      className={
        "flex-col gap-2 rounded-[18px] px-[22px] py-5 " +
        // 휴대폰에서는 첫 카드(미확인·확인 중 포함)만 보여서 목록이 바로 보이게 한다
        (dark ? "flex bg-deep-green text-white" : "hidden border border-line bg-white sm:flex")
      }
    >
      <span className={"text-sm " + (dark ? "text-[#CDE7D6]" : "text-[#4D6157]")}>{label}</span>
      <span className="text-[40px] leading-none font-black">
        {value}
        <span className="ml-1 text-base font-medium">건</span>
      </span>
      <span className={"text-[13px] " + (dark ? "text-[#B9E08A]" : "text-muted")}>{sub}</span>
    </div>
  );
}
