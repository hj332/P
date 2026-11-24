"use client";

import { useState } from "react";
import { Icon } from "@/components/brand/icons";

// 교장·교감용 학교 익명 통계 — 학교 전체 / 학년별 (AdminDashboard.html 의 KPI·FlowBar·BarList 를 단순하게).
// DB 함수 school_stats() 가 건수만 돌려준다. 학생·학부모·학급·내용은 없다.
// 위험도는 "학교에 전달된 문의"만 분류한다 (사용자 결정 2026-11-24). 전달 안 된 상담은 건수만 센다.
// ⚠ 학년별 건수가 작으면 누가 상담했는지 짐작될 수 있다 — 교장·교감만 보고, 학급 단위는 보여 주지 않는다.

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
};

export type SchoolStatsData = { all: StatBlock; grades: StatBlock[] };

const LEVELS: { key: "level1" | "level2" | "level3"; label: string }[] = [
  { key: "level1", label: "Level 1 · 일반 문의·상담" },
  { key: "level2", label: "Level 2 · 불만·민원" },
  { key: "level3", label: "Level 3 · 관리자 검토 필요" },
];

export function SchoolStats({ s }: { s: SchoolStatsData }) {
  const [grade, setGrade] = useState<number | null>(null);
  const cur = grade === null ? s.all : (s.grades.find((g) => g.grade === grade) ?? s.all);
  const max = Math.max(1, ...LEVELS.map((l) => cur[l.key]));
  const tabs: { key: number | null; label: string }[] = [
    { key: null, label: "학교 전체" },
    ...s.grades.map((g) => ({ key: g.grade, label: `${g.grade}학년` })),
  ];

  return (
    <section aria-label="학교 익명 통계" className="flex flex-col gap-3.5 rounded-3xl border border-line bg-white px-5 py-6 sm:px-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-xl font-black text-heading">익명 통계</h2>
        <span className="text-[13px] text-muted">건수만 보여요 · 학생·학부모·내용은 볼 수 없어요</span>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="통계 범위">
        {tabs.map((t) => (
          <button
            key={t.label}
            type="button"
            role="tab"
            aria-selected={grade === t.key}
            onClick={() => setGrade(t.key)}
            className={
              "min-h-[38px] rounded-full px-3.5 text-sm " +
              (grade === t.key ? "bg-deep-green font-bold text-white" : "border border-[#DDE9D6] bg-white text-body")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 흐름: AI 상담 → (AI에서 종료 | 학교 전달) → 관리자 공유 / 답변 완료 */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
        <Tile label="AI 상담 시작" value={cur.consultations} sub={`진행 중 ${cur.inProgress}`} />
        <Tile label="AI 상담에서 종료" value={cur.closedByAi} sub="학교에 전달 안 됨" />
        <Tile label="학교에 전달" value={cur.sentToSchool} sub="학부모가 동의한 문의" strong />
        <Tile label="관리자 공유" value={cur.shared} sub="학년부장·교장·교감" />
        <Tile label="답변 완료" value={cur.replied} sub="담임 선생님 답변" />
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold text-body">학교에 전달된 문의의 AI 분류 (참고용)</span>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {LEVELS.map((l) => (
              <li
                key={l.key}
                className="grid grid-cols-[170px_minmax(0,1fr)_32px] items-center gap-2 text-[13px]"
                title={`${l.label}: ${cur[l.key]}건`}
              >
                <span className="text-body">{l.label}</span>
                <span className="h-3 rounded-full bg-[#EEF4EA]">
                  <span
                    className="block h-3 rounded-full bg-ai-bubble"
                    style={{ width: `${(cur[l.key] / max) * 100}%`, minWidth: cur[l.key] ? 6 : 0 }}
                  />
                </span>
                <span className="text-right font-bold text-ink">{cur[l.key]}</span>
              </li>
            ))}
          </ul>
          {cur.unclassified > 0 && <span className="text-xs text-muted">아직 분류 전 {cur.unclassified}건</span>}
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-3 rounded-2xl bg-danger-bg px-4 py-3 text-danger-fg">
            <Icon name="shieldCheck" size={20} />
            <span className="flex-1 text-sm font-bold">안전 관련 고위험 후보</span>
            <span className="text-2xl font-black">{cur.highRisk}</span>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-warn-bg px-4 py-3 text-warn-fg">
            <Icon name="clock" size={20} />
            <span className="flex-1 text-sm font-bold">동일 사안 반복 문의</span>
            <span className="text-2xl font-black">{cur.repeats}</span>
          </div>
          <p className="m-0 text-xs leading-[1.6] text-muted">
            표시만 해요 — 알림이나 자동 배정은 없어요. 내용은 담임 선생님이 공유한 문의만 볼 수 있어요.
            {grade !== null && " 학년 통계는 건수가 적으면 누구인지 짐작될 수 있으니 외부에 공유하지 마세요."}
          </p>
        </div>
      </div>
    </section>
  );
}

function Tile({ label, value, sub, strong }: { label: string; value: number; sub: string; strong?: boolean }) {
  return (
    <div className={"flex flex-col gap-1 rounded-2xl px-4 py-3.5 " + (strong ? "bg-deep-green text-white" : "bg-bg-soft text-ink")}>
      <span className={"text-[13px] " + (strong ? "text-[#CDE7D6]" : "text-body")}>{label}</span>
      <span className="text-[30px] leading-none font-black">
        {value}
        <span className="ml-1 text-sm font-medium">건</span>
      </span>
      <span className={"text-xs " + (strong ? "text-[#B9E08A]" : "text-muted")}>{sub}</span>
    </div>
  );
}
