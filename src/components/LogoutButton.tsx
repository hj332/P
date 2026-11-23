"use client";

import { useTransition } from "react";
import { signOut } from "@/app/actions";
import { Icon } from "@/components/brand/icons";

// 로그아웃 버튼 (학부모·교사 화면 공통).
// 로그아웃 뒤 페이지를 완전히 새로 불러와(window.location) 숨겨 보관된 이전 화면을 모두 비운다.
export function LogoutButton({ userName }: { userName: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label={`${userName} 로그아웃`}
      disabled={pending}
      onClick={() =>
        start(async () => {
          await signOut();
          window.location.replace("/login");
        })
      }
      className="flex min-h-11 items-center gap-2.5 rounded-full border border-[#E3EEDD] bg-white py-0 pr-3.5 pl-1.5 text-sm text-ink hover:bg-bg-soft disabled:opacity-60"
    >
      <span className="flex size-8 items-center justify-center rounded-full bg-parent-bubble text-deep-green">
        <Icon name="user" size={18} />
      </span>
      <span className="hidden sm:inline">{userName}</span>
      <span className="text-muted">
        <span className="hidden sm:inline">· </span>
        {pending ? "로그아웃 중…" : "로그아웃"}
      </span>
    </button>
  );
}
