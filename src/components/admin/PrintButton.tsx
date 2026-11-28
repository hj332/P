"use client";

import { Icon } from "@/components/brand/icons";

// 월간 보고서 인쇄 (브라우저 인쇄 창 → PDF 로 저장도 가능)
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-full bg-deep-green px-5 text-sm font-bold text-white"
    >
      <Icon name="fileText" size={16} />
      인쇄하기 · PDF 저장
    </button>
  );
}
