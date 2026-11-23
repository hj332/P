import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { LogoMark } from "@/components/brand/Logo";
import { Icon } from "@/components/brand/icons";

// 교사 화면 틀 (design/screens/TeacherInbox.html): 왼쪽 딥그린 사이드바 + 위쪽 헤더 + 본문
export function TeacherShell({
  userName,
  newCount,
  children,
}: {
  userName: string;
  newCount: number;
  children: ReactNode;
}) {
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
          <span className="px-3 pb-1.5 text-xs font-bold tracking-[1px] text-[#9CC4AE]">교사</span>
          <Link
            href="/teacher/inbox"
            aria-current="page"
            className="flex min-h-[46px] items-center gap-3 rounded-xl bg-ai-bubble px-3 text-[15px] font-bold text-white"
          >
            <Icon name="fileText" />
            교사 업무함
            {newCount > 0 && (
              <span className="ml-auto min-w-6 rounded-full bg-highlight px-[7px] text-center text-xs leading-[22px] text-heading">
                {newCount}
              </span>
            )}
          </Link>
        </div>
        <div className="mt-auto flex flex-col gap-2 rounded-2xl bg-[#1C5E49] p-4 text-[13px] leading-[1.6]">
          <span className="flex items-center gap-2 font-bold text-white">
            <Icon name="lock" size={16} />
            학부모가 동의한 내용만
          </span>
          <span>
            학부모가 직접 확인하고 전달에 동의한 요약만 이곳에 와요. AI와 나눈 대화 원문과 ‘상담만 종료’한 상담은 볼 수 없어요.
          </span>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3.5 border-b border-[#E3EEDD] bg-white px-4 py-3.5 sm:px-8">
          <Link href="/teacher/inbox" className="flex items-center gap-2.5 lg:hidden">
            <LogoMark size={36} />
            <span className="text-lg font-black text-heading">교사 업무함</span>
          </Link>
          <span className="hidden text-sm text-muted lg:inline">온담 AI · 교사</span>
          <LogoutButton userName={userName} />
        </header>
        {children}
      </div>
    </div>
  );
}
