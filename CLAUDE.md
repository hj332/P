@AGENTS.md

# 온담 AI (MVP) — 작업 메모

학교 전담 학부모 민원 사전상담 AI. 기획안: `./# 온담 기획안 (MVP ver).txt` (프로젝트 폴더 안, 15장이 MVP 범위).
핵심 원칙: **상담 ≠ 민원 접수** — 학부모가 AI 요약을 확인·수정하고 동의했을 때만 Case 가 생기고 교사에게 간다.

## 작업 방식
- 사용자에게는 한국어로, 비개발자도 이해할 수 있게 설명한다.
- Windows PowerShell 은 npm.ps1 실행이 막혀 있다 → `npm.cmd install`, `npm.cmd run dev` 처럼 `npm.cmd` 를 쓴다.
- Next.js 16 (Cache Components 켜짐): `middleware` 대신 `src/proxy.ts`, 로그인 정보를 읽는 화면은 `<Suspense>` 안에서 렌더링.
- 권한은 화면이 아니라 DB RLS 로 막는다. service_role(secret) 키는 브라우저에 절대 노출하지 않는다.

## 진행 상황
MVP 단계 (1~9):
1. ✅ 준비물 / 2. ✅ Next.js + Supabase 뼈대
3. ✅ DB 스키마·RLS — `supabase/migrations/0001_init.sql`
   - 상담(conversations/messages)은 학부모 본인만. 교사용 정책 없음.
   - Case 는 `consent_and_create_case()` 로만 생성 (CONSENT_PENDING + 본인 자녀일 때). 담임(teacher_classes.is_homeroom)에게 자동 배정.
   - 상태 변경: `set_conversation_status()` / `decline_and_close()`. 교사 열람: `open_case()` → audit_logs 기록.
   - 기획안에 없던 `classes`, `students` 테이블 추가.
   - 권한 점검: 실제 Supabase 에서 `supabase/tests/rls_check.sql` 49개 통과 (아래 4단계 참고).
4. ✅ 테스트 계정 — `supabase/seed_test.sql` (parent1/2, teacher1/2 @example.com). 2026-11-19 parent1 실제 로그인 → /parent 에 자녀(박하늘 3-2) 표시 확인.
   - 2026-11-19: OneDrive → `C:\Ondam` 이전 때 빠진 src/supabase/public 을 복사해 복구. `.env.local` URL 끝의 `/rest/v1/` 제거 → 연결·테이블 10개 확인됨.
   - 남은 것(선택): teacher1 로그인.
   - `0002_parent_messages_only.sql`: 학부모는 role='parent' 메시지만 insert (AI 답변 위조 차단). AI 답변은 서버가 secret 키로 저장해야 함(5단계).
   - `supabase/tests/rls_check.sql`: 실제 Supabase SQL Editor 용 권한 점검 49개. 계정을 바꿔가며 확인 후 전부 롤백. PGlite·실제 Supabase 모두 49/49 통과 (2026-11-19, 0002 적용 후).
   - 주의: Supabase 프로젝트는 가입 시 확인메일 필요(autoconfirm 꺼짐) → 사용자 추가 시 "Auto Confirm User" 체크.
5. ✅ 학부모 AI 채팅 — LLM: Gemini 무료 API (`@google/genai`). 기본 순서 `gemini-3.5-flash-lite` → `gemini-3.8-flash` (`GEMINI_MODEL` 에 쉼표로 바꿀 수 있음).
   - 2026-11-19 확인: `gemini-flash-latest`·`gemini-2.5-flash` 는 이 키로 사용 불가, 3.8/3.7-flash 는 503(혼잡) 잦음. SDK 기본 재시도(최대 5회·1분 대기)는 끄고 모델 순서대로 넘어감.
   - 실제 대화 확인: 일반 상담(공감 → 질문), 위험 표현("죽고 싶다") → 112/119/109 안내 먼저 + AI 는 번호 반복 없이 안전 확인.
   - `requireRole()` 맨 앞 `await connection()` — Supabase 내부 Date.now() 때문에 나던 Next.js prerender 오류 해결.
   - 지침 `src/lib/ai/counselor-prompt.ts`, 호출 `src/lib/ai/gemini.ts`, 서버 함수 `src/app/parent/actions.ts`, 화면 `src/components/parent/ChatView.tsx` (6단계에서 옛 `Chat.tsx` 대체).
   - 학부모 메시지·상담 생성은 학부모 권한(RLS). AI 답변만 `src/lib/supabase/admin.ts`(SUPABASE_SECRET_KEY, server-only)로 저장.
   - 안전: `src/lib/ai/safety.ts` 가 위험 표현을 감지하면 AI 결과와 상관없이 112/119/109 안내를 답변 맨 앞에 붙임 (AI 실패 시에도 저장).
   - ⚠ Gemini 무료 등급은 Google 이 입출력을 사람이 검토·학습에 사용할 수 있고 개인정보 입력 금지 → 가상 시연 데이터만. 실제 운영 전 유료 등급 등으로 전환 필요.
   - .env.local: GEMINI_API_KEY, SUPABASE_SECRET_KEY 설정됨 (서버 전용).
   - 참고: AI 실패 시 학부모 메시지는 저장된 채 남음(다시 보내면 이어짐). 상태는 아직 ACTIVE 만 사용 — 요약·동의는 6단계.
- 🎨 디자인 적용 (2026-11-20): 기준 `design/DESIGN.md` + `design/screens/*.html`(참고용 마크업, 그대로 배포 X).
   - 토큰은 `src/app/globals.css` 에 DESIGN.md 3장 그대로 (Tailwind 클래스 `bg-deep-green`, `text-heading`, `bg-bg-soft` 등). 기존 이름(accent/card/foreground/background)은 새 토큰에 연결해 둠 → 화면을 다시 만들 때 새 이름으로 교체.
   - 글꼴 Noto Sans KR(next/font, 400/500/700/900). 한국어 줄바꿈 `word-break: keep-all`. 다크 모드 없음(디자인에 없음).
   - 에셋은 `design/assets` → `public/brand/` 로 복사해서 사용. 로고 `src/components/brand/Logo.tsx`, 아이콘 `icons.tsx`.
   - ✅ 첫 화면 `/` = Main.html (`src/app/page.tsx`, 문구 `src/components/landing/content.ts`, 로그인 카드 `LoginCard.tsx` — `/login` 에서도 재사용).
     로그인 카드: 아이디는 이메일, 이동은 탭이 아닌 실제 역할 기준, "로그인 상태 유지·아이디 찾기·가입" 은 기능이 없어 뺌.
   - 라우트는 아직 `/parent`, `/teacher` 유지 (DESIGN 제안: `/parent/chat/[id]`, `/teacher/inbox`) — 해당 화면 작업 때 정리.
   - 남은 화면: ParentChat·ParentSummary(6단계), TeacherInbox(7단계), ParentReply·AdminDashboard(MVP 이후).
6. ✅ 요약(사실/해석/요구사항) → 학부모 수정 → [전달]/[상담만 종료]/[수정해서 전달]
   - 2026-11-20 브라우저로 전체 흐름 확인: 상담 → 정리 → 수정 → 전달(Case NEW, 3-2 담임 배정, CONSENTED 기록, 수정 내용 그대로) / 조금 더 상담하기(→ACTIVE) / 상담만 종료(CLOSED_AI, Case 없음, DECLINED 기록).
   - Gemini 가 느릴 때(2026-11-20: lite 10초+, 3.8-flash 40초+): 모델 순서 lite→lite, 20초/25초. 실패하면 학부모 메시지는 남고 [답변 다시 받기](retryReply) 버튼이 뜸. 10초 넘으면 "늦어지고 있어요" 안내.
   - 정리 제안 (2026-11-20 변경): 고정 규칙(학부모 2회) 대신 상담 AI 가 정리 단계 답변 끝에 `[[정리제안]]`(SUMMARY_MARKER) 을 붙일 때만 "정리해 드릴까요?" 표시.
     표시는 DB 에 그대로 저장, 화면·AI 기록·요약 AI 로 넘길 때 `splitSummaryMarker`/`withSummaryFlag`(src/lib/summary.ts)로 뗌. 마크다운 `**`·`#` 도 화면에서 지움.
     입력창 위 작은 [상담 내용 정리하기] 버튼은 학부모가 한 번이라도 말했으면 항상 보임. AI 시험 10회 중 9회 의도대로(첫 마디 정리 요청 1회는 질문을 더 함).
   - 시험용 Case 1건(47a02832…, "수업 중 팔을 잡고 제지한 행동에 대한 설명 요청") → 7단계 교사 업무함 확인용.
   - 라우트: `/parent` → 진행 중 상담 또는 `/parent/chat`(새 상담) / `/parent/chat/[id]` / `/parent/chat/[id]/summary`.
   - 요약 형식 `src/lib/summary.ts` (topic·facts·interpretation·unknowns·requests). 요약 AI `src/lib/ai/summarize.ts` (상담 AI 와 분리, JSON 스키마, 아이 이름 제외).
   - 서버 함수 `src/app/parent/actions.ts`: createSummary(→CONSENT_PENDING) / saveSummaryDraft / sendToSchool(consent_and_create_case) / endConsultation(decline_and_close) / continueConsultation(→ACTIVE). 전부 학부모 RLS 권한.
   - 화면: `src/components/parent/{ParentShell,ChatView,SummaryView}.tsx` — ParentChat.html·ParentSummary.html 기준. 근거자료 카드·알림·파일첨부는 MVP 제외라 뺌.
   - "상담만 종료" 후에는 다시 전달 불가(DB 함수가 막음) → 디자인 문구 "나중에 다시 전달" 은 "새 상담 시작" 으로 바꿈.
7. ✅ 교사 업무함 상세 카드 — `/teacher` → `/teacher/inbox`. TeacherInbox.html 기준.
   - 2026-11-20 사용자 요청: 첫 문의 자동 열기 없음. 교사가 목록에서 직접 눌렀을 때만 상세 + 열람 기록(+확인 중).
     주소에 선택을 남기지 않음(새로 고침으로 다시 열려 기록되지 않게). 좁은 화면은 누르면 상세로 스크롤. 확인: 들어가기만 하면 기록 0, 누르면 +1.
   - 데이터 `src/app/teacher/data.ts` (교사 RLS: 배정 + 담당 학급 Case 만). 화면 `src/components/teacher/{TeacherShell,InboxView}.tsx`.
   - 상세: 있었던 일 / 우려하는 부분 / 요청사항 / 아직 확인되지 않은 부분 (final_summary). 검색·[전체/미확인/확인 중] 필터.
   - 열람 기록: 상세가 화면에 뜨면 브라우저가 `POST /teacher/cases/[id]/open` (route handler → open_case()). 같은 화면에서는 Case 당 1번.
     Server Action 을 화면이 막 뜬 순간(useEffect)에 부르면 Next 16 이 버리는 경우가 있어 route handler 로 바꿈. 렌더 중에 기록하지 않음(미리 불러오기 방지).
   - 2026-11-20 teacher1 로 확인: 목록·상세 표시, 미확인→확인 중, 같은 항목 반복 클릭은 추가 기록 없음, 교사가 /parent/chat/[id] 열면 업무함으로 되돌려짐.
   - 뺀 것(MVP 밖): 위험도 칩, AI 답변 초안·답변 작성·관리자 공유, 상담 가능시간, 알림, "AI 상담만 종료 N건" 익명 통계(DB 함수 필요 + 소규모 학급에서 식별 우려).
   - 참고: 시험 중 수동 호출 1건 포함해 시험용 Case 의 audit_logs 에 열람 기록 여러 건 있음.
8. ✅ Evaluation Set — `eval/` (README.md 참고). **지침·모델을 바꾸면 `npm.cmd run eval -- --runs 2` 로 다시 돌린다.**
   - `eval/eval-set.json`: 안전 규칙 14(R), 상담 AI 16(C), 요약 AI 6(S). 전부 가상 사례.
   - `eval/run.ts` (tsx, `--conditions=react-server` 로 server-only 우회, `--env-file=.env.local`): 자동 검사(금지 표현·질문 수·긴급 안내·정리 표시·요약 칸 포함/제외어) + AI 채점관(같은 Gemini, 참고용). 결과 `eval/results/*.md|json`.
   - "전달하면 안 되는 상담이 전달되지 않는지"는 `supabase/tests/rls_check.sql` 이 담당.
   - 2026-11-20 1차(--runs 2): 자동 98%, 채점관 86%. 실패: 학교 규정 지어냄("보통 3일 전", 2/2), 위험 표현 다음 턴에 안전 잊음(2/2), "자살예방교육 언제?"·"고소 방법?" 에 긴급 연락처 과잉 안내, "웃겨 죽겠다" 오탐.
   - 고친 것: 지침(숫자·날짜 지어내지 않기, 정보 문의엔 긴급 목록 금지, 법률 문의는 법률구조공단 132·교육청 안내, "바로 전달해 줘" 대응), earlierRisk(앞선 위험 표현이 있으면 109 재안내 — actions.ts 가 판단해 지침에 알림), safety.ts 관용 표현 예외.
   - 2차: 자동 259/259(검사 쪽 질문 인식 보완 후), 채점관 73/73. 상담 답변 직접 읽어 개선 확인.
   - 아직 약점 후보(문항 추가 필요): 학부모가 하지 않은 말을 짐작해 덧붙임("지쳐서 잠든", "아이 표정이 어둡거나") — C01·C11 은 통과했지만 표본이 적음.
9. 🔄 내부 시연 준비 완료 (시연 자체는 사용자가 진행) — 위험도 분류·긴급 프로토콜 없이는 실제 학부모 운영 금지
   - 시연 가이드 `docs/demo-guide.md`: 점검표, 대본(문장 그대로), 문제 대처, 말해야 할 한계.
   - `npm.cmd run build` 성공(2026-11-20), `npm.cmd run start` 로 화면·이미지·교사 업무함 확인. `.claude/launch.json` 에 ondam-prod(3001) 추가.
   - `supabase/demo_reset.sql`: 테스트 계정 4개의 상담·메시지·Case·배정·동의·열람 기록만 삭제(계정·학생·담임 배정 유지, 재실행 안전). PGlite 로 다른 학부모 데이터는 안 지우는 것 확인. 실제 Supabase 에서는 아직 실행 안 함.
   - 2026-11-20 저녁: 평가 1회 전부 통과(자동 149/149, 채점관 41/41) → 사용자 승인 후 테스트 데이터 삭제(상담 6·메시지 25·Case 1·열람 10, 계정·학생·담임 유지)
     → `npm.cmd run build` 후 배포 모드(`ondam-prod`, 3000)로 실행, teacher1 업무함 0건 확인. 남은 것: 사용자 리허설, teacher2 로그인 확인, 시연 직전 재초기화.
   - 2026-11-23 리허설 버그: 상담 종료 후 [새 상담 시작하기]가 가끔 예전 대화를 보여 줌.
     원인: Next 16 Cache Components 는 떠난 화면을 React Activity 로 숨겨 보관(최대 3개) → `/parent/chat` 의 ChatView 상태(첫 메시지로 만든 상담)가 남아 있다가 다시 나타남.
     수정: ChatView 가 새 상담 모드(initialId=null)일 때 useLayoutEffect 정리 함수로 숨겨질 때 상태 초기화 (Next 문서 preserving-ui-state 방식). 브라우저로 재현 경로 확인 완료.
     같이: 로그아웃(`LogoutButton`)·로그인(`LoginCard`)은 `window.location` 으로 페이지를 완전히 새로 불러옴 — 같은 브라우저에서 다른 계정으로 바꿀 때 이전 사람 화면이 메모리에 남지 않게.
     ⚠ 다른 화면도 "떠났다 돌아오면 상태가 남는다"는 점을 기억할 것 (새로 시작해야 하는 화면은 같은 방식으로 초기화).
   - GitHub: https://github.com/hj332/P (공개, hj332 계정으로 push). 기획안·design/·eval/results/ 는 .gitignore 로 제외.
   - 2026-11-20 결정: 발표자 노트북에서만 시연 (배포 안 함). 나중에 여러 사람이 접속해야 하면 배포(Vercel 등) 필요.

## 주요 파일
- `src/lib/supabase/{client,server,proxy}.ts`, `src/proxy.ts`, `src/lib/auth.ts` (requireRole)
- `src/app/{login,parent,teacher}/...`, `src/components/{brand,landing,parent,teacher}/`, `src/app/actions.ts` (로그아웃)
