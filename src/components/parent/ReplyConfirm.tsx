"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { Icon } from "@/components/brand/icons";
import { confirmReply } from "@/app/parent/actions";

// 답변 화면 아래 [답변 잘 받았어요] / [추가로 문의할게요] (design/screens/ParentReply.html RESPONSE)
// 상태는 서버(DB)의 Case 상태로만 정한다: RESOLVED → 버튼, CLOSED → 마무리 안내.
export function ReplyConfirm({ caseId, status }: { caseId: string; status: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (status === "CLOSED") {
    return (
      <section className="flex flex-wrap items-center gap-[18px] rounded-[22px] bg-deep-green p-7 text-white">
        <span className="flex size-[60px] flex-none items-center justify-center rounded-full bg-[#1C5E49]">
          <LogoMark variant="lime" size={36} />
        </span>
        <div className="flex flex-[1_1_300px] flex-col gap-1">
          <strong className="text-xl">상담이 마무리되었어요</strong>
          <span className="text-[15px] text-[#CFE4D6]">선생님께 ‘답변 잘 받았어요’를 전해 드렸어요. 언제든 다시 이야기 나눠요.</span>
        </div>
        <Link
          href="/parent/chat"
          className="inline-flex min-h-11 items-center rounded-full border border-[#5E9A7E] px-[18px] text-sm text-white"
        >
          새 상담 시작하기
        </Link>
      </section>
    );
  }

  if (status !== "RESOLVED") return null;

  return (
    <section className="flex flex-col gap-3.5 rounded-[22px] bg-bg-soft px-5 py-6 sm:px-7">
      <h3 className="m-0 text-xl font-black text-heading">답변이 궁금한 점을 해결해 주었나요?</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const res = await confirmReply(caseId);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.refresh();
            });
          }}
          className="flex min-h-[60px] items-center justify-center gap-2.5 rounded-[14px] bg-deep-green text-[17px] font-bold text-white disabled:opacity-60"
        >
          <Icon name="heart" size={20} />
          {pending ? "전하는 중…" : "답변 잘 받았어요"}
        </button>
        <Link
          href="/parent/chat"
          className="flex min-h-[60px] items-center justify-center gap-2.5 rounded-[14px] border-[1.5px] border-[#9CCB84] bg-white text-[17px] font-bold text-ok-fg"
        >
          <Icon name="chat" size={20} />
          추가로 문의할게요
        </Link>
      </div>
      {error && (
        <p role="alert" className="m-0 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger-fg">
          {error}
        </p>
      )}
      <p className="m-0 text-[13px] leading-[1.6] text-[#4D6157]">
        추가 문의는 온담 AI가 먼저 듣고 정리한 뒤, 학부모님이 확인하신 내용만 다시 선생님께 전달돼요.
      </p>
    </section>
  );
}
