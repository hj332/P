"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/brand/Logo";
import { Icon } from "@/components/brand/icons";
import { homePathFor } from "@/lib/roles";
import { SCHOOL_NAME } from "./content";

// design/screens/Main.html 의 로그인 카드.
// 역할 탭은 안내 문구만 바꾼다. 로그인 후 이동할 곳은 탭이 아니라 계정의 실제 역할(DB)로 정한다.
type RoleKey = "parent" | "teacher" | "admin";

const ROLES: Record<RoleKey, { label: string; title: string; desc: string; placeholder: string; button: string }> = {
  parent: {
    label: "학부모",
    title: "로그인 후 AI 상담을 시작할 수 있어요",
    desc: "24시간 언제든 편하게 이야기하고, 내가 확인한 내용만 학교에 전달해요.",
    placeholder: "학부모 이메일을 입력해 주세요",
    button: "학부모로 로그인",
  },
  teacher: {
    label: "교사",
    title: "교사 업무함으로 이동해요",
    desc: "학부모가 전달에 동의한 문의만, 정리된 요약으로 확인해요.",
    placeholder: "교직원 이메일을 입력해 주세요",
    button: "교사로 로그인",
  },
  admin: {
    label: "관리자",
    title: "관리자 대시보드로 이동해요",
    desc: "관리자 이관·고위험 사안과 학교 전체 익명 통계를 확인해요.",
    placeholder: "관리자 이메일을 입력해 주세요",
    button: "관리자로 로그인",
  },
};

const inputClass =
  "min-h-[52px] rounded-xl border-[1.5px] border-[#D6E5CF] bg-[#FCFEFB] px-4 text-base font-normal text-ink outline-leaf placeholder:text-[#7A8A82]";

export function LoginCard({ id }: { id?: string }) {
  const [role, setRole] = useState<RoleKey>("parent");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cur = ROLES[role];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setError("이메일 또는 비밀번호를 확인해 주세요.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
    if (!profile) {
      setError("등록된 프로필이 없습니다. 학교 관리자에게 문의해 주세요.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    // 페이지를 완전히 새로 불러와 이동한다: 이 브라우저에 숨겨 보관된 이전 화면(다른 사람의 화면일 수 있음)과
    // 입력했던 비밀번호를 메모리에서 모두 비운다.
    window.location.assign(homePathFor(profile.role));
  }

  return (
    <div
      id={id}
      className="box-border flex w-full max-w-[620px] min-w-0 scroll-mt-6 flex-col gap-[22px] rounded-[28px] border border-line bg-white px-6 py-8 shadow-[0_24px_60px_rgba(15,77,58,0.10)] sm:px-11 sm:py-10"
    >
      <div className="flex items-center gap-3.5">
        <LogoMark size={44} />
        <div>
          <div className="text-sm font-medium text-muted">{SCHOOL_NAME} ON:DAM AI 상담실</div>
          <h2 className="mt-0.5 text-[28px] font-black tracking-[-0.5px] text-heading">로그인</h2>
        </div>
      </div>

      <div role="tablist" aria-label="로그인 유형" className="grid grid-cols-3 gap-1.5 rounded-2xl bg-[#F1F7EC] p-1.5">
        {(Object.keys(ROLES) as RoleKey[]).map((k) => {
          const selected = role === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setRole(k)}
              className={
                "min-h-12 rounded-xl text-base " +
                (selected
                  ? "bg-deep-green font-bold text-white shadow-[0_4px_12px_rgba(15,77,58,0.18)]"
                  : "font-medium text-body hover:bg-white/60")
              }
            >
              {ROLES[k].label}
            </button>
          );
        })}
      </div>

      <div className="flex items-start gap-3 rounded-[14px] bg-[#F4F9F0] px-4 py-3.5 text-ok-fg">
        <span className="flex pt-px">
          <Icon name="circleCheck" />
        </span>
        <div className="flex flex-col gap-0.5">
          <strong className="text-[15px] font-bold">{cur.title}</strong>
          <span className="text-sm leading-[1.55] text-body">{cur.desc}</span>
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-[22px]">
        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-2 text-sm font-bold text-ink">
            이메일
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={cur.placeholder}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-bold text-ink">
            비밀번호
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력해 주세요"
              className={inputClass}
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger-fg">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex min-h-14 items-center justify-center gap-2.5 rounded-[14px] bg-deep-green text-[17px] font-bold text-white hover:bg-[#0A3A2B] disabled:opacity-60"
        >
          {loading ? "확인 중…" : cur.button}
          {!loading && <Icon name="arrowRight" />}
        </button>
      </form>

      <p className="text-center text-sm text-muted">처음 이용하시나요? 계정은 학교에서 발급해 드려요.</p>

      <div className="flex items-start gap-2.5 border-t border-dashed border-[#DDE9D6] pt-[18px] text-[13px] leading-[1.6] text-muted">
        <span className="flex pt-0.5 text-leaf">
          <Icon name="lock" size={16} />
        </span>
        <span>
          AI와 나눈 상담은 학부모님이 <strong className="text-ink">‘학교에 전달하기’</strong>를 선택하기 전까지
          선생님과 학교에 공개되지 않습니다.
        </span>
      </div>
    </div>
  );
}
