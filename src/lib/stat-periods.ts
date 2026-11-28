// 교장·교감 통계의 기간 (v2 D, 2026-11-28). 한국 시간(KST, UTC+9) 기준으로 계산해 ISO 문자열(UTC)로 돌려준다.
//   이번 주: 월요일 0시부터 / 이번 달: 1일 0시부터 / 이번 학기: 1학기 3월 1일~, 2학기 9월 1일~(다음 해 2월까지) / 전체
// school_stats(p_from, p_to) 에 그대로 넘긴다 (to 는 "미만").

export type PeriodKey = "week" | "month" | "semester" | "all";
export type Period = { key: PeriodKey; label: string; from: string | null; to: string | null; range: string };

const KST = 9 * 60 * 60 * 1000;

// KST 의 연·월·일(월은 1부터) 0시를 UTC 시각으로
const kstMidnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d) - KST);

function kstParts(now: number) {
  const k = new Date(now + KST);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate(), dow: k.getUTCDay() };
}

const fmt = (d: Date) => {
  const k = new Date(d.getTime() + KST);
  return `${k.getUTCMonth() + 1}.${k.getUTCDate()}`;
};

export function semesterStart(now: number) {
  const { y, m } = kstParts(now);
  if (m >= 3 && m <= 8) return { start: kstMidnight(y, 3, 1), label: `${y}학년도 1학기` };
  if (m >= 9) return { start: kstMidnight(y, 9, 1), label: `${y}학년도 2학기` };
  return { start: kstMidnight(y - 1, 9, 1), label: `${y - 1}학년도 2학기` }; // 1~2월은 지난해 2학기
}

export function statPeriods(now: number): Period[] {
  const { y, m, d, dow } = kstParts(now);
  const today = kstMidnight(y, m, d);
  const weekStart = new Date(today.getTime() - ((dow + 6) % 7) * 24 * 60 * 60 * 1000); // 월요일
  const monthStart = kstMidnight(y, m, 1);
  const sem = semesterStart(now);
  const until = `~ ${fmt(new Date(now))}`;
  return [
    { key: "week", label: "이번 주", from: weekStart.toISOString(), to: null, range: `${fmt(weekStart)} ${until}` },
    { key: "month", label: "이번 달", from: monthStart.toISOString(), to: null, range: `${m}월 1일 ${until}` },
    { key: "semester", label: "이번 학기", from: sem.start.toISOString(), to: null, range: `${sem.label} (${fmt(sem.start)} ${until})` },
    { key: "all", label: "전체", from: null, to: null, range: "처음부터 지금까지" },
  ];
}

// 월간 보고서: "2026-11" → 그 달 1일 0시 ~ 다음 달 1일 0시 (KST)
export function monthRange(ym: string | undefined, now: number) {
  const cur = kstParts(now);
  const mt = /^(\d{4})-(\d{1,2})$/.exec(ym ?? "");
  let y = mt ? Number(mt[1]) : cur.y;
  let mo = mt ? Number(mt[2]) : cur.m;
  if (mo < 1 || mo > 12 || y < 2000 || y > 2100) ({ y, m: mo } = cur);
  const from = kstMidnight(y, mo, 1);
  const to = mo === 12 ? kstMidnight(y + 1, 1, 1) : kstMidnight(y, mo + 1, 1);
  const key = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}`;
  return {
    y,
    m: mo,
    from: from.toISOString(),
    to: to.toISOString(),
    prev: mo === 1 ? key(y - 1, 12) : key(y, mo - 1),
    next: mo === 12 ? key(y + 1, 1) : key(y, mo + 1),
    isFuture: from.getTime() > now,
    isCurrent: y === cur.y && mo === cur.m,
  };
}
