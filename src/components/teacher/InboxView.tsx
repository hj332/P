"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/brand/icons";
import type { InboxCase } from "@/app/teacher/data";

type Filter = "all" | "new" | "reviewing";

const STATUS: Record<string, { label: string; fg: string }> = {
  NEW: { label: "미확인", fg: "text-warn-fg" },
  TEACHER_REVIEWING: { label: "확인 중", fg: "text-ok-fg" },
  RESOLVED: { label: "처리 완료", fg: "text-muted" },
  ESCALATED: { label: "관리자 이관", fg: "text-muted" },
  ADMIN_REVIEWING: { label: "관리자 확인 중", fg: "text-muted" },
  CLOSED: { label: "종료", fg: "text-muted" },
};

function formatTime(iso: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.month}.${parts.day} (${parts.weekday}) ${parts.hour}:${parts.minute}`;
}

// 교사 업무함 목록 + 상세 카드 (design/screens/TeacherInbox.html)
export function InboxView({ cases }: { cases: InboxCase[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  // 처음에는 아무것도 열지 않는다. 교사가 목록에서 직접 눌렀을 때만 상세를 열고 열람 기록을 남긴다.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const counts = {
    all: cases.length,
    new: cases.filter((c) => c.status === "NEW").length,
    reviewing: cases.filter((c) => c.status === "TEACHER_REVIEWING").length,
  };

  const visible = useMemo(() => {
    const q = query.trim();
    return cases.filter((c) => {
      if (filter === "new" && c.status !== "NEW") return false;
      if (filter === "reviewing" && c.status !== "TEACHER_REVIEWING") return false;
      if (!q) return true;
      return c.studentName.includes(q) || (c.summary?.topic ?? "").includes(q);
    });
  }, [cases, filter, query]);

  const selected = cases.find((c) => c.id === selectedId) ?? null;

  // 상세를 실제로 열었을 때만 열람 기록을 남긴다 (같은 Case 는 화면에 있는 동안 한 번만)
  const logged = useRef(new Set<string>());
  useEffect(() => {
    if (!selected || logged.current.has(selected.id)) return;
    logged.current.add(selected.id);
    const wasNew = selected.status === "NEW";
    fetch(`/teacher/cases/${selected.id}/open`, { method: "POST" })
      .then((r) => {
        if (r.ok && wasNew) router.refresh(); // 미확인 → 확인 중 반영
      })
      .catch(() => logged.current.delete(selected.id)); // 네트워크 실패면 다음에 다시 시도
  }, [selected, router]);

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
        <h2 className="m-0 text-xl font-black text-heading">아직 전달된 문의가 없어요</h2>
        <p className="m-0 text-[15px] text-body">학부모님이 요약을 확인하고 전달에 동의하면 이곳에 나타나요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-5">
      {/* 목록 */}
      <section aria-label="전달된 문의 목록" className="flex max-w-[420px] min-w-0 flex-[1_1_320px] flex-col gap-2.5">
        <label className="flex min-h-11 items-center gap-2.5 rounded-xl bg-white px-3.5 text-muted ring-1 ring-[#E3EEDD]">
          <Icon name="search" size={18} />
          <span className="sr-only">업무함 검색</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="학생 이름, 상담 주제로 검색"
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-[#7A8A82]"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="상태로 거르기">
          {(
            [
              ["all", `전체 ${counts.all}`],
              ["new", `미확인 ${counts.new}`],
              ["reviewing", `확인 중 ${counts.reviewing}`],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={
                "min-h-[38px] rounded-full px-3.5 text-sm " +
                (filter === key ? "bg-deep-green font-bold text-white" : "border border-[#DDE9D6] bg-white text-body")
              }
            >
              {label}
            </button>
          ))}
        </div>

        {visible.map((c) => {
          const active = c.id === selectedId;
          const st = STATUS[c.status] ?? { label: c.status, fg: "text-muted" };
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
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-ok-bg px-2.5 py-0.5 text-xs font-bold text-ok-fg">
                  <Icon name="circleCheck" size={14} />
                  학부모 전달 동의
                </span>
                <span className="text-xs text-muted">{formatTime(c.createdAt)}</span>
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
          학부모가 ‘상담만 종료’한 대화는 업무함에 나타나지 않아요.
        </p>
      </section>

      {/* 상세 카드 */}
      <div ref={detailRef} className="flex min-w-0 flex-[999_1_480px] scroll-mt-4">
        {selected ? (
          <CaseDetail c={selected} />
        ) : (
          <div className="flex w-full flex-col items-center gap-3 rounded-3xl border border-dashed border-[#CFE3C4] bg-white px-6 py-14 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-parent-bubble text-deep-green">
              <Icon name="fileText" size={26} />
            </span>
            <p className="m-0 text-[17px] font-bold text-heading">목록에서 문의를 선택해 주세요</p>
            <p className="m-0 text-sm text-muted">문의를 열면 ‘확인 중’으로 바뀌고 열람 기록이 남아요.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CaseDetail({ c }: { c: InboxCase }) {
  const s = c.summary;
  return (
    <article
      aria-label="문의 상세"
      className="w-full min-w-0 overflow-hidden rounded-3xl border border-line bg-white"
    >
      <div className="flex flex-wrap items-start justify-between gap-3.5 border-b border-[#EEF4EA] px-5 py-6 sm:px-[30px]">
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-2xl font-black tracking-[-0.5px] sm:text-[26px]">{s?.topic ?? "상담 요청"}</h2>
          <span className="text-[15px] text-[#4D6157]">
            {c.classLabel ? `${c.classLabel} ` : ""}
            {c.studentName} 학부모 · 접수 {formatTime(c.createdAt)}
          </span>
        </div>
        <span className="inline-flex items-center gap-2 rounded-xl bg-ok-bg px-3.5 py-2 text-sm font-bold text-ok-fg">
          <Icon name="circleCheck" size={18} />
          학부모 전달 동의함
        </span>
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

      <div className="flex items-center gap-2 border-t border-[#EEF4EA] bg-[#FAFCF8] px-5 py-3.5 text-xs text-muted sm:px-[30px]">
        <Icon name="lock" size={14} />
        학부모가 확인한 요약만 표시됩니다 · 대화 원문은 볼 수 없어요 · 열람 기록이 남아요
      </div>
    </article>
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
