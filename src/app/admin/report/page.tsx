import Link from "next/link";
import { Suspense } from "react";
import { StatsBody } from "@/components/admin/SchoolStats";
import { PrintButton } from "@/components/admin/PrintButton";
import { getMonthlyReport } from "../../teacher/data";

// 월간 보고서 (v2 D, AdminDashboard.html "월간 보고서") — 교장·교감(ADMIN)만.
// school_stats(그 달 1일, 다음 달 1일) 결과를 인쇄하기 좋은 한 장으로 보여 준다. 건수만, 개인정보·내용 없음.
export default function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  return (
    <Suspense fallback={<p className="p-6 text-muted">불러오는 중…</p>}>
      <Report searchParams={searchParams} />
    </Suspense>
  );
}

const ROWS: { key: "consultations" | "closedByAi" | "sentToSchool" | "shared" | "replied" | "level3" | "highRisk" | "repeats"; label: string }[] = [
  { key: "consultations", label: "AI 상담" },
  { key: "closedByAi", label: "AI에서 종료" },
  { key: "sentToSchool", label: "학교 전달" },
  { key: "shared", label: "관리자 공유" },
  { key: "replied", label: "답변 완료" },
  { key: "level3", label: "Level 3" },
  { key: "highRisk", label: "고위험 후보" },
  { key: "repeats", label: "반복 문의" },
];

async function Report({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const { profile, now, r, stats, schoolName } = await getMonthlyReport(month);
  const lastDay = new Date(new Date(r.to).getTime() - 1 + 9 * 3600_000).getUTCDate();
  const made = new Date(now + 9 * 3600_000);

  return (
    <main className="mx-auto flex max-w-[960px] flex-col gap-6 bg-white px-4 pt-6 pb-14 sm:px-8 print:max-w-none print:p-0">
      <nav className="flex flex-wrap items-center gap-2 print:hidden" aria-label="보고서 이동">
        <Link href="/admin" className="mr-auto text-sm font-bold text-deep-green no-underline">
          ← 공유받은 문의로
        </Link>
        <Link
          href={`/admin/report?month=${r.prev}`}
          className="inline-flex min-h-[40px] items-center rounded-full border border-[#DDE9D6] px-4 text-sm text-body no-underline"
        >
          ‹ 이전 달
        </Link>
        {r.isCurrent ? (
          <span className="inline-flex min-h-[40px] items-center rounded-full border border-[#EEF2EA] px-4 text-sm text-muted">다음 달 ›</span>
        ) : (
          <Link
            href={`/admin/report?month=${r.next}`}
            className="inline-flex min-h-[40px] items-center rounded-full border border-[#DDE9D6] px-4 text-sm text-body no-underline"
          >
            다음 달 ›
          </Link>
        )}
        <PrintButton />
      </nav>

      <header className="flex flex-col gap-1 border-b border-line pb-4">
        <span className="text-sm text-muted">{schoolName} · 온담 AI 학부모 사전상담</span>
        <h1 className="m-0 text-[26px] font-black tracking-[-0.6px] text-heading sm:text-[30px]">
          {r.y}년 {r.m}월 월간 보고서
        </h1>
        <span className="text-[13px] text-muted">
          집계 기간 {r.m}.1 ~ {r.m}.{lastDay}
          {r.isCurrent && ` (진행 중 · ${made.getUTCMonth() + 1}.${made.getUTCDate()} 기준)`} · 작성 {made.getUTCFullYear()}.{made.getUTCMonth() + 1}.
          {made.getUTCDate()} · {profile.display_name}
        </span>
      </header>

      {r.isFuture ? (
        <p className="m-0 text-muted">아직 오지 않은 달이에요.</p>
      ) : !stats ? (
        <p className="m-0 text-danger-fg">
          통계를 불러오지 못했어요. Supabase 에 <code>0010_stats_period_subject.sql</code> 이 적용되어 있는지 확인해 주세요.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-4 break-inside-avoid" aria-label="학교 전체">
            <h2 className="m-0 text-lg font-black text-heading">학교 전체</h2>
            <StatsBody cur={stats.all} />
          </section>

          {stats.grades.length > 0 && (
            <section className="flex flex-col gap-2.5 break-inside-avoid" aria-label="학년별">
              <h2 className="m-0 text-lg font-black text-heading">학년별</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-bg-soft text-body print:[print-color-adjust:exact]">
                      <th className="px-2 py-2 text-left font-bold">학년</th>
                      {ROWS.map((c) => (
                        <th key={c.key} className="px-2 py-2 text-right font-bold">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.grades.map((g) => (
                      <tr key={g.grade} className="border-b border-line">
                        <td className="px-2 py-2 font-bold text-ink">{g.grade}학년</td>
                        {ROWS.map((c) => (
                          <td key={c.key} className="px-2 py-2 text-right text-ink">
                            {g[c.key] ?? "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <span className="text-xs text-muted">학급 단위 통계는 만들지 않아요.</span>
            </section>
          )}

          <footer className="border-t border-line pt-3 text-xs leading-[1.7] text-muted">
            건수만 담았어요 — 학생·학부모 이름과 상담 내용은 들어 있지 않아요. 위험도·주제 분야는 AI 가 분류한 참고용이에요.
            상담은 시작한 날, 학교 전달 문의는 전달한 날 기준으로 셌어요.
          </footer>
        </>
      )}
    </main>
  );
}
