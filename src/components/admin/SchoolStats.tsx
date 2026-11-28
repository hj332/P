"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/brand/icons";
import { SUBJECTS, SUBJECT_LABEL } from "@/lib/subjects";
import type { Period, PeriodKey } from "@/lib/stat-periods";

// 교장·교감용 학교 익명 통계 — 기간(이번 주/이번 달/이번 학기/전체) × 범위(학교 전체/학년별).
// DB 함수 school_stats(p_from, p_to) 가 건수만 돌려준다 (0010). 학생·학부모·학급·내용은 없다.
// 위험도·주제 분야는 "학교에 전달된 문의"만 분류한다 (사용자 결정 2026-11-24). 전달 안 된 상담은 건수만 센다.
// 학년별 숫자도 그대로 보여 준다 (반 단위 통계는 없음 — 2026-11-28 사용자 결정으로 1~2건 가림 없음).
// (2026-11-28 사용자 결정: 근무시간 외 상담 비율·시간대별 그래프는 넣지 않는다)

export type StatBlock = {
  grade: number | null;
  consultations: number;
  closedByAi: number;
  inProgress: number;
  sentToSchool: number;
  shared: number;
  replied: number;
  level1: number;
  level2: number;
  level3: number;
  highRisk: number;
  repeats: number;
  unclassified: number;
  subjects?: Record<string, number>;
};

export type SchoolStatsData = { all: StatBlock; grades: StatBlock[] };
export type PeriodStats = Period & { stats: SchoolStatsData };

const LEVELS: { key: "level1" | "level2" | "level3"; label: string }[] = [
  { key: "level1", label: "Level 1 · 일반 문의·상담" },
  { key: "level2", label: "Level 2 · 불만·민원" },
  { key: "level3", label: "Level 3 · 관리자 검토 필요" },
];

const countText = (v: number | undefined) => (v === undefined ? "-" : String(v));
const barValue = (v: number | undefined) => v ?? 0;

export function SchoolStats({ periods }: { periods: PeriodStats[] }) {
  const [periodKey, setPeriodKey] = useState<PeriodKey>(periods.some((p) => p.key === "month") ? "month" : periods[0].key);
  const [grade, setGrade] = useState<number | null>(null);
  const period = periods.find((p) => p.key === periodKey) ?? periods[0];
  const s = period.stats;
  const cur = grade === null ? s.all : (s.grades.find((g) => g.grade === grade) ?? s.all);
  const tabs: { key: number | null; label: string }[] = [
    { key: null, label: "학교 전체" },
    ...s.grades.map((g) => ({ key: g.grade, label: `${g.grade}학년` })),
  ];

  return (
    <section aria-label="학교 익명 통계" className="flex flex-col gap-4 rounded-3xl border border-line bg-white px-5 py-6 sm:px-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-xl font-black text-heading">익명 통계</h2>
          <span className="text-[13px] text-muted">건수만 보여요 · 학생·학부모·내용은 볼 수 없어요</span>
        </div>
        <Link
          href="/admin/report"
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-[#DDE9D6] bg-white px-4 text-sm font-bold text-deep-green no-underline"
        >
          <Icon name="fileText" size={16} />
          월간 보고서
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        <Pills
          label="기간"
          items={periods.map((p) => ({ key: p.key, label: p.label }))}
          value={periodKey}
          onChange={(k) => setPeriodKey(k as PeriodKey)}
        />
        <span className="text-xs text-muted">{period.range}</span>
        <Pills label="통계 범위" items={tabs} value={grade} onChange={(k) => setGrade(k as number | null)} />
      </div>

      <StatsBody cur={cur} />
    </section>
  );
}

// 통계 본문 — 화면과 월간 보고서가 같이 쓴다
export function StatsBody({ cur }: { cur: StatBlock }) {
  const levelMax = Math.max(1, ...LEVELS.map((l) => barValue(cur[l.key])));
  const subjects = SUBJECTS.map((k) => ({ key: k, label: SUBJECT_LABEL[k], v: cur.subjects?.[k] }));
  const subjectMax = Math.max(1, ...subjects.map((x) => barValue(x.v)));
  const noSubject = cur.subjects?.NONE ?? 0;

  return (
    <>
      {/* 흐름: AI 상담 → (AI에서 종료 | 학교 전달) → 관리자 공유 / 답변 완료 */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
        <Tile label="AI 상담 시작" value={cur.consultations} sub={`진행 중 ${countText(cur.inProgress)}`} />
        <Tile label="AI 상담에서 종료" value={cur.closedByAi} sub="학교에 전달 안 됨" />
        <Tile label="학교에 전달" value={cur.sentToSchool} sub="학부모가 동의한 문의" strong />
        <Tile label="관리자 공유" value={cur.shared} sub="학년부장·교장·교감" />
        <Tile label="답변 완료" value={cur.replied} sub="담임 선생님 답변" />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Bars
          title="학교에 전달된 문의의 위험도 (AI 분류 · 참고용)"
          rows={LEVELS.map((l) => ({ key: l.key, label: l.label, v: cur[l.key] }))}
          max={levelMax}
          foot={cur.unclassified ? `아직 분류 전 ${countText(cur.unclassified)}건` : undefined}
        />
        <Bars
          title="학교에 전달된 문의의 주제 분야 (AI 분류 · 참고용)"
          rows={subjects}
          max={subjectMax}
          foot={noSubject ? `주제 분야 분류 전 ${countText(noSubject)}건` : undefined}
        />
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-2xl bg-danger-bg px-4 py-3 text-danger-fg">
          <Icon name="shieldCheck" size={20} />
          <span className="flex-1 text-sm font-bold">안전 관련 고위험 후보</span>
          <span className="text-2xl font-black">{countText(cur.highRisk)}</span>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-warn-bg px-4 py-3 text-warn-fg">
          <Icon name="clock" size={20} />
          <span className="flex-1 text-sm font-bold">동일 사안 반복 문의</span>
          <span className="text-2xl font-black">{countText(cur.repeats)}</span>
        </div>
      </div>
      <p className="m-0 text-xs leading-[1.6] text-muted">
        표시만 해요 — 알림이나 자동 배정은 없어요. 내용은 담임 선생님이 공유한 문의만 볼 수 있어요.
      </p>
    </>
  );
}

function Pills<K extends string | number | null>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={label}>
      {items.map((t) => (
        <button
          key={String(t.key) + t.label}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={
            "min-h-[38px] rounded-full px-3.5 text-sm " +
            (value === t.key ? "bg-deep-green font-bold text-white" : "border border-[#DDE9D6] bg-white text-body")
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Bars({ title, rows, max, foot }: { title: string; rows: { key: string; label: string; v: number | undefined }[]; max: number; foot?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold text-body">{title}</span>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((r) => (
          <li
            key={r.key}
            className="grid grid-cols-[minmax(110px,170px)_minmax(0,1fr)_40px] items-center gap-2 text-[13px]"
            title={`${r.label}: ${countText(r.v)}건`}
          >
            <span className="text-body">{r.label}</span>
            <span className="h-3 rounded-full bg-[#EEF4EA] print:border print:border-[#cfdcc8]">
              <span
                className="block h-3 rounded-full bg-ai-bubble print:[print-color-adjust:exact]"
                style={{ width: `${(barValue(r.v) / max) * 100}%`, minWidth: r.v ? 6 : 0 }}
              />
            </span>
            <span className="text-right font-bold text-ink">{countText(r.v)}</span>
          </li>
        ))}
      </ul>
      {foot && <span className="text-xs text-muted">{foot}</span>}
    </div>
  );
}

function Tile({ label, value, sub, strong }: { label: string; value: number; sub: string; strong?: boolean }) {
  return (
    <div
      className={
        "flex flex-col gap-1 rounded-2xl px-4 py-3.5 print:[print-color-adjust:exact] " +
        (strong ? "bg-deep-green text-white" : "bg-bg-soft text-ink")
      }
    >
      <span className={"text-[13px] " + (strong ? "text-[#CDE7D6]" : "text-body")}>{label}</span>
      <span className="text-[30px] leading-none font-black">
        {countText(value)}
        <span className="ml-1 text-sm font-medium">건</span>
      </span>
      <span className={"text-xs " + (strong ? "text-[#B9E08A]" : "text-muted")}>{sub}</span>
    </div>
  );
}
