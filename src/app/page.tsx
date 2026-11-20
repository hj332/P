import Image from "next/image";
import Link from "next/link";
import { AiAvatar, LogoMark, Wordmark } from "@/components/brand/Logo";
import { Icon } from "@/components/brand/icons";
import { LoginCard } from "@/components/landing/LoginCard";
import {
  CHANGES,
  DEMO_CHAT,
  DEMO_POINTS,
  HERO_POINTS,
  NAV,
  OLD_FLOW,
  ONDAM_FLOW,
  SCHOOL_NAME,
  STEPS,
  VALUE_CARDS,
  WHY_CARDS,
} from "@/components/landing/content";

// 첫 화면: 서비스 소개 + 역할별 로그인 (design/screens/Main.html)
export default function Home() {
  return (
    <div className="w-full overflow-x-hidden bg-bg text-ink">
      <SiteHeader />
      <main>
        <Hero />
        <ValueCards />
        <WhySection />
        <Process />
        <ChatDemo />
        <Changes />
        <Tools />
        <ClosingBanner />
      </main>
      <SiteFooter />
    </div>
  );
}

const container = "mx-auto max-w-[1280px] px-4 sm:px-8";
const sectionTitle = "m-0 text-[30px] font-black leading-[1.3] tracking-[-1px] text-heading sm:text-[40px]";

function SiteHeader() {
  return (
    <header className="border-b border-[#E3EEDD] bg-[rgba(250,253,248,0.94)]">
      <div className={`${container} flex flex-wrap items-center justify-between gap-4 py-3.5`}>
        <Link href="/" aria-label="온담 AI 첫 화면">
          <Wordmark />
        </Link>
        <nav aria-label="주요 메뉴" className="hidden flex-wrap gap-9 text-base font-medium lg:flex">
          {NAV.map((n, i) => (
            <a
              key={n.href}
              href={n.href}
              className={
                "pb-1.5 " +
                (i === 0 ? "border-b-[3px] border-deep-green font-bold text-deep-green" : "text-body hover:text-deep-green")
              }
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden min-h-11 items-center gap-2.5 rounded-full border border-[#DDE9D6] bg-white py-0 pr-[18px] pl-2 text-[15px] font-medium text-ink sm:flex">
            <span className="flex size-[30px] items-center justify-center rounded-full bg-parent-bubble text-deep-green">
              <Icon name="school" size={16} />
            </span>
            {SCHOOL_NAME}
          </span>
          <a
            href="#login"
            className="flex min-h-11 items-center rounded-full bg-deep-green px-5 text-[15px] font-bold text-white hover:bg-[#0A3A2B]"
          >
            로그인
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-bg-soft">
      <div aria-hidden className="absolute -top-[220px] -right-[180px] size-[720px] rounded-full bg-[#E3F0D8]" />
      <div aria-hidden className="absolute -bottom-[260px] -left-[140px] size-[520px] rounded-full bg-[#EAF5E2]" />
      <div className={`${container} relative flex flex-wrap items-center gap-14 pt-12 pb-16 sm:pt-[72px] sm:pb-[88px]`}>
        <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-[26px]">
          <span className="inline-flex items-center gap-2 self-start rounded-full bg-[#E2F0D6] px-[18px] py-[9px] text-[15px] font-medium text-ok-fg">
            <span className="flex text-leaf">
              <Icon name="sprout" size={16} />
            </span>
            학교와 가정을 잇는, 따뜻한 AI 상담 파트너
          </span>
          <h1 className="m-0 text-[48px] leading-[1.08] font-black tracking-[-2px] text-heading sm:text-[64px] lg:text-[76px]">
            온담 <span className="text-leaf">AI</span> 상담실
          </h1>
          <p
            aria-label="온담: 따뜻할 온(溫)과 이야기 담(談)"
            className="-mt-2 flex flex-wrap items-center gap-2.5 text-lg font-medium text-body"
          >
            <span className="text-2xl font-bold text-leaf">溫</span>따뜻할 온
            <span className="px-1.5 text-[#8CBF5F]">+</span>
            <span className="text-2xl font-bold text-leaf">談</span>이야기 담
          </p>
          <p className="m-0 text-2xl leading-[1.4] font-medium tracking-[-0.5px] text-[#12392D] sm:text-[32px]">
            따뜻하게 듣고, 함께 정리하는
            <br />
            학교의 AI 사전상담 서비스
          </p>
          <p className="m-0 max-w-[520px] text-lg leading-[1.75] text-body">
            학부모님의 고민을 온담 AI가 먼저 듣고 정리하여,
            <br className="hidden sm:block" /> 선생님이 아이에게 더 집중할 수 있는
            <br className="hidden sm:block" /> 따뜻한 교육 환경을 만들어갑니다.
          </p>
          <div className="flex flex-wrap gap-3.5 pt-1.5">
            <Link
              href="/parent"
              className="inline-flex min-h-14 items-center gap-3 rounded-full bg-deep-green px-[30px] text-lg font-bold text-white hover:bg-[#0A3A2B]"
            >
              <Icon name="chat" size={22} />
              상담 시작하기
              <Icon name="arrowRight" />
            </Link>
            <a
              href="#about"
              className="inline-flex min-h-14 items-center gap-3 rounded-full border-[1.5px] border-deep-green bg-white px-[30px] text-lg font-bold text-deep-green hover:bg-bg-soft"
            >
              <Icon name="book" size={22} />
              서비스 알아보기
            </a>
          </div>
          <ul className="m-0 flex list-none flex-wrap gap-7 p-0 pt-2.5">
            {HERO_POINTS.map((p) => (
              <li key={p.icon} className="flex items-center gap-3">
                <span className="flex size-[46px] items-center justify-center rounded-full bg-[#E2F0D6] text-deep-green">
                  <Icon name={p.icon} />
                </span>
                <span className="text-sm leading-normal text-body">
                  {p.text[0]}
                  <br />
                  {p.text[1]}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex min-w-0 flex-[1_1_460px] justify-center">
          <LoginCard id="login" />
        </div>
      </div>
    </section>
  );
}

function ValueCards() {
  return (
    <section id="about" className={`${container} flex scroll-mt-4 flex-col gap-10 pt-[72px] pb-10 sm:pt-[88px]`}>
      <div className="flex flex-col items-center gap-2.5 text-center">
        <span className="text-sm font-bold tracking-[1.5px] text-leaf">ON:DAM AI</span>
        <h2 className={sectionTitle}>온담 AI가 만드는 더 따뜻한 학교</h2>
        <p className="m-0 text-lg text-body">학부모, 선생님, 그리고 아이 모두를 위한 AI 상담 서비스입니다.</p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
        {VALUE_CARDS.map((c) => (
          <div key={c.title} className="flex items-center gap-[18px] rounded-[22px] border border-[#E3EEDD] bg-white p-[26px]">
            <span className="flex size-[72px] flex-none items-center justify-center rounded-full bg-parent-bubble text-deep-green">
              <Icon name={c.icon} size={30} />
            </span>
            <div>
              <h3 className="m-0 mb-1.5 text-[19px] font-bold">{c.title}</h3>
              <p className="m-0 text-[15px] leading-[1.6] text-[#4D6157]">{c.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FlowRow({ items, tone }: { items: string[]; tone: "old" | "ondam" }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 text-[15px] font-medium">
      {items.map((label, i) => {
        const last = i === items.length - 1;
        const chip =
          tone === "old" ? "bg-[#F4F1EA]" : last ? "bg-deep-green text-white" : "bg-parent-bubble";
        return (
          <span key={label} className="contents">
            <span className={`rounded-[10px] px-3.5 py-2 ${chip}`}>{label}</span>
            {!last && (
              <span className={tone === "old" ? "text-[#8A7A5A]" : "text-leaf"}>
                <Icon name="arrowRight" size={18} />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function WhySection() {
  return (
    <section className={`${container} flex flex-wrap items-stretch gap-10 py-14`}>
      <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-6">
        <h2 className="m-0 text-[30px] leading-[1.3] font-black tracking-[-1px] text-heading sm:text-4xl">
          학교와 가정의 소통,
          <br />
          <span className="text-[#2B7A4B]">왜 필요할까요?</span>
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          {WHY_CARDS.map((c) => (
            <div
              key={c.title}
              className="flex flex-col items-center gap-2.5 rounded-[20px] border border-[#E3EEDD] bg-white p-[26px] text-center"
            >
              <span className="text-deep-green">
                <Icon name={c.icon} size={32} />
              </span>
              <h3 className="m-0 text-lg font-bold">{c.title}</h3>
              <p className="m-0 text-[15px] leading-[1.65] text-[#4D6157]">
                {c.lines.map((l, i) => (
                  <span key={i}>
                    {l}
                    {i < c.lines.length - 1 && <br />}
                  </span>
                ))}
              </p>
            </div>
          ))}
        </div>
        <div className="self-center rounded-full bg-deep-green px-9 py-[18px] text-center text-lg leading-normal font-bold text-white">
          온담 AI가 새로운 <span className="text-highlight">사전상담 단계</span>로 이 문제를 해결합니다!
        </div>
      </div>

      <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-[22px] rounded-[28px] bg-bg-soft p-6 sm:p-9">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-[30px] font-black tracking-[-0.5px] text-heading">상담 ≠ 민원 접수</span>
          <span className="text-[15px] text-[#4D6157]">온담 AI의 가장 중요한 차이</span>
        </div>
        <div className="flex flex-col gap-3 rounded-[18px] border border-[#E3EEDD] bg-white px-[22px] py-5">
          <span className="text-sm font-bold text-[#6B5A3A]">기존 방식</span>
          <FlowRow items={OLD_FLOW} tone="old" />
        </div>
        <div className="flex flex-col gap-3 rounded-[18px] border-2 border-leaf bg-white px-[22px] py-5">
          <span className="text-sm font-bold text-[#2B7A4B]">온담 AI</span>
          <FlowRow items={ONDAM_FLOW} tone="ondam" />
          <span className="text-sm leading-[1.6] text-[#4D6157]">
            긴 대화를 나누었더라도 학교에 자동으로 전달되지 않습니다. ‘상담만 종료’하면 대화는 AI에서 끝납니다.
          </span>
        </div>
      </div>
    </section>
  );
}

function Process() {
  return (
    <section id="process" className="scroll-mt-4 bg-bg-soft">
      <div className={`${container} flex flex-col gap-11 py-20`}>
        <div className="flex flex-col gap-2.5">
          <h2 className={sectionTitle}>
            온담 AI, <span className="mark-highlight">이렇게</span> 진행돼요!
          </h2>
          <p className="m-0 text-lg text-body">공감 → 탐색 → 정리 → 안내 → 확인·선택, 다섯 단계의 상담 모델</p>
        </div>
        <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-[18px] p-0">
          {STEPS.map((s, i) => {
            const last = i === STEPS.length - 1;
            return (
              <li
                key={s.title}
                className={
                  "flex flex-col gap-3.5 rounded-[22px] px-[22px] py-7 " +
                  (last ? "bg-deep-green text-white" : "border border-line bg-white")
                }
              >
                <div className="flex items-center justify-between">
                  <span
                    className={
                      "flex size-16 items-center justify-center rounded-full " +
                      (last ? "bg-ai-bubble text-white" : "border-2 border-[#CFE6C2] bg-parent-bubble text-deep-green")
                    }
                  >
                    <Icon name={s.icon} size={28} />
                  </span>
                  <span className={"text-[28px] font-black " + (last ? "text-[#3E7A62]" : "text-[#CFE3C4]")}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="m-0 text-xl font-bold">{s.title}</h3>
                <p className={"m-0 text-[15px] leading-[1.6] " + (last ? "text-[#D9EBDF]" : "text-[#4D6157]")}>{s.desc}</p>
              </li>
            );
          })}
        </ol>
        <div className="flex items-center gap-3 self-center rounded-full border border-[#CFE6C2] bg-white px-[30px] py-4 text-[17px] font-medium text-ink">
          <span className="flex text-leaf">
            <Icon name="circleCheck" size={24} />
          </span>
          <span>
            이후, <strong className="font-bold">전달 여부를 선택한 경우에만</strong> 학교에 전달됩니다!
          </span>
        </div>
      </div>
    </section>
  );
}

function ChatDemo() {
  return (
    <section className={`${container} flex flex-wrap items-center gap-14 py-[72px] sm:py-[88px]`}>
      <div
        aria-label="상담 화면 예시"
        className="min-w-0 flex-[1_1_560px] overflow-hidden rounded-[26px] border border-line bg-white shadow-[0_20px_50px_rgba(15,77,58,0.08)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF4EA] px-6 py-[18px]">
          <div className="flex items-center gap-2.5">
            <LogoMark size={30} />
            <strong className="text-[17px] text-heading">{SCHOOL_NAME} ON:DAM AI 상담실</strong>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#DDE9D6] px-3.5 py-1.5 text-[13px] text-body">
            <span className="size-2 rounded-full bg-[#5FA33A]" />
            AI 사전상담 · 학교 미전달
          </span>
        </div>
        <div className="flex flex-col gap-3.5 bg-[#FCFEFA] px-6 py-7">
          {DEMO_CHAT.map((m, i) =>
            m.role === "parent" ? (
              <div
                key={i}
                className="max-w-[78%] self-end rounded-[18px_18px_4px_18px] border border-[#CFE3C4] bg-parent-bubble px-[18px] py-3.5 text-base leading-[1.6]"
              >
                {m.text}
              </div>
            ) : (
              <div key={i} className="flex max-w-[82%] items-start gap-2.5">
                <AiAvatar />
                <div className="rounded-[4px_18px_18px_18px] bg-ai-bubble px-[18px] py-3.5 text-base leading-[1.6] text-white">
                  {m.text}
                </div>
              </div>
            ),
          )}
          <div
            aria-label="AI가 입력 중"
            className="ml-12 flex gap-1.5 self-start rounded-[18px] bg-[#EEF4EA] px-[18px] py-3.5"
          >
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-2 rounded-full bg-[#8FB39E]" />
            ))}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-[22px]">
        <h2 className={sectionTitle}>
          실제 상담은 <span className="mark-highlight">이렇게!</span>
        </h2>
        <p className="m-0 text-[17px] leading-[1.7] text-body">
          AI는 잘잘못을 판단하지 않아요. 감정에는 공감하고, 확인되지 않은 사실은 단정하지 않습니다.
        </p>
        <ul className="m-0 flex list-none flex-col gap-3.5 p-0 text-lg font-medium">
          {DEMO_POINTS.map((p) => (
            <li key={p} className="flex items-center gap-3">
              <span className="flex text-ai-bubble">
                <Icon name="circleCheck" size={24} />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Changes() {
  return (
    <section className="bg-bg-soft">
      <div className={`${container} flex flex-col gap-10 py-20`}>
        <h2 className={sectionTitle}>
          온담 AI가 만드는
          <br />더 나은 변화
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[22px]">
          {CHANGES.map((c) => (
            <div key={c.title} className="flex flex-col overflow-hidden rounded-3xl border border-line bg-white">
              <div className="flex h-[150px] items-end justify-center bg-[#F5F8EE]">
                <Image
                  src={c.img}
                  alt={c.alt}
                  width={Math.round(c.imgHeight * 1.4)}
                  height={c.imgHeight}
                  // PNG 에 투명 배경이 없어 흰 사각형이 보이므로, 흰색을 배경색에 섞는다.
                  className="block w-auto mix-blend-multiply"
                  style={{ height: c.imgHeight, marginBottom: c.imgHeight < 140 ? 8 : 0 }}
                />
              </div>
              <div className="flex flex-col gap-3 px-[26px] pt-6 pb-7">
                <h3 className="m-0 text-center text-[21px] font-bold">{c.title}</h3>
                <div className="flex gap-2.5 text-base leading-normal">
                  <span className="flex text-ai-bubble">
                    <Icon name="circleCheck" />
                  </span>
                  {c.point}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Check({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 text-base">
      <span className="flex text-ai-bubble">
        <Icon name="circleCheck" />
      </span>
      {children}
    </div>
  );
}

function Tools() {
  return (
    <section id="tools" className={`${container} flex scroll-mt-4 flex-col gap-10 py-[72px] sm:py-[88px]`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className={sectionTitle}>학교를 위한 스마트한 도구</h2>
        <p className="m-0 text-base text-[#4D6157]">학부모가 전달에 동의한 사안만, 필요한 사람에게.</p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-6">
        <div className="flex flex-wrap gap-6 rounded-[26px] border border-line bg-white p-6 sm:p-[30px]">
          <div className="flex flex-[1_1_180px] flex-col gap-3.5">
            <h3 className="m-0 text-2xl font-black">교사 업무함</h3>
            <Check>정리된 상담 요약 확인</Check>
            <Check>AI 답변 초안</Check>
            <Check>필요 시 관리자 이관</Check>
          </div>
          <div aria-hidden className="flex flex-[1_1_220px] flex-col gap-2 rounded-2xl border border-line bg-[#F4F9F0] p-3.5">
            <div className="grid grid-cols-3 gap-1.5">
              <MiniKpi label="나에게 전달" value="4" dark />
              <MiniKpi label="관리자 이관" value="1" />
              <MiniKpi label="AI 종료" value="8" />
            </div>
            <MiniRow title="생활지도 관련 확인 요청" tag="민원" warn />
            <MiniRow title="친구 관계 상담 요청" tag="상담" />
            <MiniRow title="학습 적응 문의" tag="상담" />
          </div>
        </div>

        <div className="flex flex-wrap gap-6 rounded-[26px] border border-line bg-white p-6 sm:p-[30px]">
          <div className="flex flex-[1_1_180px] flex-col gap-3.5">
            <h3 className="m-0 text-2xl font-black">관리자 대시보드</h3>
            <Check>상담 통계 분석</Check>
            <Check>고위험 사안 관리</Check>
            <Check>도입 및 운영 지원</Check>
          </div>
          <div aria-hidden className="flex flex-[1_1_220px] flex-col gap-2.5 rounded-2xl bg-deep-green p-3.5">
            <div className="grid grid-cols-3 gap-1.5">
              {[
                ["상담 시작", "68", "text-white"],
                ["교사 전달", "21", "text-white"],
                ["긴급", "2", "text-[#FFB4A8]"],
              ].map(([l, v, c]) => (
                <div key={l} className="rounded-lg bg-[#1C5E49] p-2 text-[11px] text-[#CDE7D6]">
                  {l}
                  <div className={`text-xl font-black ${c}`}>{v}</div>
                </div>
              ))}
            </div>
            <div className="flex min-h-[90px] flex-1 items-end gap-2 rounded-lg bg-[#1C5E49] p-2.5">
              {[40, 70, 55, 90, 62].map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-[#8CC152]" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="m-0 text-sm text-muted">위 업무함·대시보드 그림은 화면 예시이며 실제 수치가 아닙니다.</p>
    </section>
  );
}

function MiniKpi({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className={"rounded-lg p-2 text-[11px] " + (dark ? "bg-deep-green text-white" : "bg-white text-[#4D6157]")}>
      {label}
      <div className={"text-xl font-black " + (dark ? "" : "text-ink")}>{value}</div>
    </div>
  );
}

function MiniRow({ title, tag, warn }: { title: string; tag: string; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-1.5 rounded-lg bg-white px-2.5 py-[9px] text-[11px]">
      <span>{title}</span>
      <span className={"rounded px-1.5 " + (warn ? "bg-warn-bg text-warn-fg" : "bg-ok-bg text-ok-fg")}>{tag}</span>
    </div>
  );
}

function ClosingBanner() {
  return (
    <section className={`${container} pb-[72px] sm:pb-[88px]`}>
      <div className="flex flex-wrap items-stretch overflow-hidden rounded-[32px] border border-line bg-bg-soft">
        <div className="flex min-w-0 flex-[1_1_520px] flex-col justify-center gap-[22px] p-8 sm:p-14">
          <h2 className="m-0 text-[30px] leading-[1.35] font-black tracking-[-1px] text-heading sm:text-[40px]">
            민원을 막는 AI가 아니라,
            <br />
            <span className="mark-highlight">서로 더 잘 이야기하도록</span> 돕는 AI
          </h2>
          <p className="m-0 text-lg leading-[1.7] text-body">온담 AI와 함께, 학교와 가정이 더 가까워집니다.</p>
          <Link
            href="/parent"
            className="inline-flex min-h-[52px] items-center gap-2.5 self-start rounded-full bg-deep-green px-[26px] text-[17px] font-bold text-white hover:bg-[#0A3A2B]"
          >
            지금 상담 시작하기
            <Icon name="arrowRight" />
          </Link>
        </div>
        <div className="relative min-h-[300px] flex-[1_1_420px]">
          <Image
            src="/brand/school-photo.jpg"
            alt="학교와 가정을 연결하는 온담 AI 이미지"
            fill
            sizes="(min-width: 1024px) 560px, 100vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer id="faq" className="bg-deep-green text-[#CFE4D6]">
      <div className={`${container} flex flex-wrap justify-between gap-6 py-11 text-sm leading-[1.7]`}>
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <LogoMark variant="lime" size={32} />
            <strong className="text-xl text-white">온담 AI</strong>
          </div>
          <span>溫談 — 따뜻한 공감과 대화로 학교와 가정을 잇는 AI 상담실</span>
        </div>
        <div className="flex max-w-[460px] flex-col gap-1">
          <strong className="text-white">긴급한 상황이라면 바로 연락해 주세요</strong>
          <span>경찰 112 · 소방·구급 119 · 자살예방상담 109</span>
          <span>AI는 사실관계나 잘잘못을 판단하지 않으며, 학교 규정과 공식 자료를 근거로 안내합니다.</span>
        </div>
        <div className="flex items-start gap-5 text-white">
          <span>이용약관</span>
          <span className="font-bold">개인정보처리방침</span>
          <span>문의하기</span>
        </div>
      </div>
    </footer>
  );
}
