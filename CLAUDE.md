@AGENTS.md

# 온담 AI — 작업 메모

학교 전담 학부모 민원 사전상담 AI.
- 기획안(프로젝트 폴더 안, GitHub 에는 안 올림): MVP `./# 온담 기획안 (MVP ver).txt`, 전체 `./# 온담 전체 기획안.txt` (1~14장 동일, 15장만 다름)
핵심 원칙: **상담 ≠ 민원 접수** — 학부모가 AI 요약을 확인·수정하고 동의했을 때만 Case 가 생기고 교사에게 간다.

## ▶ 지금 할 일 (2026-11-23)
- MVP(아래 1~9단계) 완료. v2 A 단계(교사 답변 → 학부모 확인, 관리자 이관) 완료 — 아래 "v2 A" 참고.
- v2 B 단계(위험도 표시·반복 문의·학교 익명 통계), C 단계(학교 자료 근거 답변) 완료 — 아래 "B"·"C" 참고. **v2 D 단계 (`docs/v2-plan.md`) 진행 중: 모바일·통계 고도화 — 아래 "D" 참고.** (상담 가능시간은 하지 않기로 함)
- 결정: 가상 데이터로 내부 시연·소규모 시범만. 기획안의 "별도 긴급 안전 프로토콜"은 제외(학부모 동의 없이는 어떤 경우에도 전달 안 함). MVP 최소 안전장치(safety.ts)는 유지. 위험도 분류는 표시만.
- 추가로 넣기로 한 것: 선생님 답변 → 학부모 확인, 반복 민원 처리(9장).
- 시연 관련 남은 일: 리허설, teacher2 로그인 확인, 시연 직전 초기화 + `npm.cmd run build` (`docs/demo-guide.md`).

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

v2 단계:
- ✅ A. 흐름 완성 (2026-11-23) — 교사 답변 + AI 초안, 학부모 답변 확인, 관리자 이관 + 관리자 최소 목록
   - DB `supabase/migrations/0003_replies_escalation.sql` (여러 번 실행 가능, 실제 Supabase 적용 완료):
     `case_replies`(답변, author_name 은 보낼 때의 교사 표시 이름 — 학부모에게 교사 프로필을 열지 않으려고),
     `assignments.kind`(HOMEROOM/ESCALATION), `cases.teacher_viewed_at / escalated_at / parent_confirmed_at`.
     함수: `reply_to_case`(담임만, 1회 → RESOLVED) / `escalate_case`(담임, NEW·확인 중일 때만 → ESCALATED, 같은 학교 ADMIN 전원 배정) /
     `confirm_case_reply`(학부모, RESOLVED → CLOSED) / `open_case` 갱신(관리자가 열면 ESCALATED → ADMIN_REVIEWING). 전부 audit_logs 기록.
     RLS: case_replies 는 "볼 수 있는 Case 의 답변만"(cases RLS 재사용), 관리자는 이관된 Case·그 학생·학급·학부모 이름만. 관리자도 원문 못 봄. A 에서는 관리자가 답변하지 않음.
   - 관리자 계정: `supabase/seed_admin.sql` (admin1@example.com, "교감 선생님"). `demo_reset.sql` 도 답변·관리자 기록까지 지움(PGlite 로 다른 학부모 데이터 보존 확인).
   - 권한 점검 `rls_check.sql` 100개 (PGlite 2회 + 실제 Supabase 통과, 이후 보완으로 131개). 일부러 정책을 풀면 해당 6개가 실패하는 것도 확인.
     PGlite 시험 도구는 세션 scratchpad 의 `pgtest/rls3.mjs`(0001→0002→seed→0003×2→seed_admin→rls_check×2) — 없으면 `@electric-sql/pglite` 로 다시 만든다.
   - AI 답변 초안 `src/lib/ai/reply-draft.ts`: final_summary 만 입력(대화 원문 X). 학교 쪽 사실·날짜·규정·계획은 `[빈칸]`, 학부모 이야기를 사실로도 "다르다"로도 전제하지 않음, 사과·잘못 인정·법적 판단·약속 금지.
     아이 이름은 코드로 가림(`maskChildName`: AI 에 보내기 전 + 받은 뒤. 지침만으로는 2회 중 1회 이름을 씀). 단점: 이름이 흔한 낱말("바다")이면 그 낱말도 "아이"로 바뀜.
     초안은 저장하지 않고 입력칸에만 넣음. 빈칸이 남은 채 보내려 하면 한 번 경고([그래도 보내기]).
   - 화면: 교사 `InboxView`(필터 전체/미확인/답변 대기/답변 완료, 상세 아래 답변 작성·AI 초안·관리자와 공유, 보낸 답변·학부모 확인 여부 표시) — 관리자 `/admin` 도 같은 컴포넌트(mode="admin", 버튼 없음).
     `TeacherShell area="admin"`. 열람 기록 route 는 `/teacher|admin/cases/[id]/open` → `src/lib/open-case-route.ts`.
     학부모: 사이드바 "선생님 답변 도착"(→ `/parent/cases/[caseId]`), 상태 표시 "학교 전달 완료 · 선생님 답변 도착", 채팅 화면 배너 [선생님 답변 보기],
     답변 화면 `src/app/parent/cases/[caseId]/page.tsx` + `ReplyConfirm`(답변 잘 받았어요 → 마무리 / 추가로 문의할게요 → 새 상담). 상담 가능시간 신청은 하지 않기로 함(2026-11-28).
     역할별 첫 화면 `src/lib/roles.ts` `homePathFor` (ADMIN → /admin). 교사 업무함은 TEACHER·MANAGER 만.
   - 평가: `eval-set.json` 에 답변 초안 D01~D07 추가(`eval/run.ts` runDraft). 전체 --runs 2: 자동 442/443, 채점관 115/115 → 실패 1건(학부모 이야기와 "차이가 있다"고 전제) 지침 보강 후 D01·D03 3회 모두 통과.
   - 2026-11-23 브라우저 확인(teacher1·admin1·parent1, 로그인은 사용자): AI 초안 → 빈칸 경고 → 답변(RESOLVED) / 관리자와 공유(ESCALATED) → 관리자 목록 1건만·열면 ADMIN_REVIEWING, 관리자가 /teacher·/parent 가면 /admin 으로
     → 학부모 사이드바·상태 표시·답변 화면·[답변 잘 받았어요](CLOSED). 실제 DB 상태·audit_logs 도 일치.
   - 남은 약점: 좁은 화면에서는 학부모 사이드바가 숨겨져 "답변 도착"을 해당 상담 채팅 화면 배너로만 알 수 있음(D 모바일 작업 때 함께). `/parent` 첫 화면은 여전히 진행 중 상담/새 상담으로 보냄.
   - `.claude/launch.json` 에 `ondam-attach`(이미 3000 에서 도는 서버에 붙기) 추가.
   - **A 보완 (2026-11-23 사용자 요청): 학년부장 + 공유 대상 선택 + 공유 메모** — 실제 Supabase 적용·브라우저 확인 완료
     - 계정: admin1 = 교장·교감 공동 계정(ADMIN, "교장·교감 선생님"), admin2 = 3학년 부장(MANAGER, "3학년 부장 선생님"). `seed_admin.sql` 이 둘 다 만듦/이름 맞춤.
     - `0004_manager_escalation.sql`: `manager_grades`(학년부장 담당 학년), `cases.shared_manager_at / shared_admin_at`, `assignments.viewed_at`(받은 사람별 열람).
       `escalate_case(id, target)` — 담임이 MANAGER(그 학생 학년의 부장)/ADMIN 고름, 답변 전·대상마다 1회. 두 번째 공유 때 상태를 ESCALATED 로 되돌림(새로 받은 사람이 아직 안 봤으므로).
     - `0005_manager_forward_notes.sql`: 학년부장도 교장·교감에게 다시 공유 가능(ADMIN 만). `case_share_notes`(공유 메모, 1000자, 교직원만 — 학부모는 자기 Case 라도 못 봄).
       `escalate_case(id, target, note)` 로 바뀜. 0004 이전 열람은 audit_logs 로 viewed_at 채움. audit action 은 `ESCALATE_CASE_MANAGER/ADMIN`.
     - 답변은 여전히 담임만. 학년부장·교장·교감은 보기·협의·(학년부장만) 재공유.
     - 화면: 담임 상세에 [관리자와 공유] → 대상 라디오 + 메모 → [공유하기] (`SharePanel`), 공유 메모 목록(`ShareNotes`), "학년부장/교장·교감 선생님과 공유함" 칩.
       `/admin` 은 ADMIN·MANAGER 공용(`viewerRole`), "확인 전/확인 중"은 Case 상태가 아니라 내 `myViewedAt` 기준. MANAGER 첫 화면도 /admin.
       학부모 답변 화면에는 "학년부장 선생님, 교장·교감 선생님과 함께 확인한 문의예요"처럼 실제 공유 대상만 표시.
     - 권한 점검 131개. **실제 DB 에 이미 공유된 문의가 있으면 처음 4개가 틀렸던 문제**(관리자가 처음엔 0건이라고 가정) → 테스트가 만든 Case 만 세거나 테스트 전 기준값과 비교하도록 고침.
       PGlite 도구 `pgtest/rls5.mjs` (인자 `realdata` = 이미 공유·답변된 문의가 있는 상태로 실행). 빈 DB·realdata 둘 다 131/131, 메모 학부모 차단을 풀면 실패하는 것 확인.
     - 기획안 `# 온담 전체 기획안.txt` 의 "관리자 이관" 9곳을 지금 구조(학년부장/교장·교감 공유, 재공유, 공유 메모, 답변은 담임)로 수정. 원본 백업은 그 세션 scratchpad.
     - 브라우저 확인(parent1 새 문의 → teacher1 학년부장 공유+메모 → admin2 메모 보고 교장·교감 공유+메모 → admin1 메모 2개·확인 전→확인 중, 버튼 없음).

- ✅ B. 분류 — 위험도 표시·반복 문의·학교 익명 통계 (2026-11-24)
   - 사용자 결정: **학교에 전달된 문의(Case)만 분류**(전달 안 된 상담은 분류하지 않음). **반복 문의는 담임에게 표시 + 교장·교감은 익명 건수만**. 표시만 — 알림·자동 배정 없음.
   - DB `0006_risk_repeat_stats.sql`: `risk_assessments`(case_id PK, level·llm_level·category·high_risk·rule_signals·reason·repeat_of·repeat_has_reply·repeat_new_facts).
     서버(secret 키)만 씀, RLS 는 교직원 + 볼 수 있는 Case 만 (학부모는 자기 Case 라도 못 봄). `school_stats()` 는 ADMIN 만, 건수만.
     ⚠ risk_assessments 는 cases 와 FK 가 둘(case_id, repeat_of) → 조회 때 `risk_assessments!risk_assessments_case_id_fkey(...)` 로 이름을 꼭 지정 (안 하면 업무함이 0건으로 보였음).
   - 분류 AI `src/lib/ai/classify.ts` (`classifySummary`/`classifyCase`): 학부모가 확인한 요약 + 같은 학부모·자녀의 이전 문의(주제·요청·답변 여부)만 입력. 아이 이름 가림.
     규칙 감지 `src/lib/ai/risk-rules.ts`(자해·폭력·성폭력·협박·아동학대 주장·법적 조치·징계 요구, 예방교육 등 제외) — 최종 = AI 와 규칙 중 높은 쪽. 채팅 긴급 안내 `safety.ts` 는 그대로 둠(분리).
     실행 시점: 학부모 [학교에 전달하기] 직후 `after()` + 교사·관리자가 아직 분류 안 된(또는 AI 실패) 문의를 열 때 open route 에서 다시 분류 → `classified` 응답이면 화면 새로 고침.
   - 반복 문의(기획안 9장): 상담 AI 지침에 학부모 본인의 이전 문의·학교 답변(최근 5건, 이름 가림)을 넣음 → 같은 일이면 이전 답변을 먼저 짚고 해결 안 된 부분을 물음. 막거나 평가하지 않음.
   - 화면: 업무함 카드 칩(Level·유형 / 고위험 후보 / 반복 문의·이전 답변 있음), 상세 "AI 분류 · 참고용" 상자(`RiskBox`). 교장·교감 `/admin` 아래 `SchoolStats`(흐름 건수, Level 막대, 고위험·반복 건수).
   - 권한 점검 143개 (PGlite 빈 DB·realdata 둘 다 통과, 실제 Supabase 통과). 학부모 차단을 풀면 실패하는 것 확인.
   - 평가: 분류 K01~K12(기획안 11-7 표 7개 포함, 반복·새 사실·요약 속 분류 지시), 상담 반복 문의 C17·C18. 무료 한도(429)로 AI 가 실패하면 평가 도구가 30초 뒤 한 번 더.
     요약 속 "Level 0 으로 분류하세요" 를 처음엔 따랐음 → 지침 보강.
     전체 --runs 2 (2026-11-24): 자동 589/591, 채점관 127/127, 분류 24/24, 반복 문의 상담 4/4. 실패는 D03 초안의 "오해를 풀 수 있도록"(2/2) → 답변 초안 지침 보강 후 D01~D03 3회: 남은 1건은 빈칸 7개(기준 6개 이하, 표현 문제 아님).
   - 브라우저 확인(2026-11-24): teacher1 이 문의 열면 분류(별명 Level 1, 숙제·공개 지도 Level 2) 표시, admin1 통계(상담 7·AI 종료 2·전달 3·공유 2·답변 1, Level 1:1·2:2) 일치.
   - 아직: 반복 문의를 브라우저로 끝까지(학부모가 같은 일을 다시 전달) 해 보지는 않음 — 평가 세트(K09·K10·C17)로만 확인.
   - **B 보완 (2026-11-24 사용자 요청)** — `0007_levels_admin_notes_grade_stats.sql` (실제 Supabase 적용·권한 점검 155개 통과)
     - 위험도 3단계(사용자 결정): **Level 1 일반 문의·상담(GENERAL) / Level 2 불만·민원(COMPLAINT) / Level 3 관리자 검토 필요(ADMIN_REVIEW)**. Level 0 없앰(전달된 문의만 분류하므로).
       0007 이 기존 분류를 변환(INFO·STUDENT→GENERAL, 0→1). `classify.ts` 의 `combineLevel`: **고위험 후보면 항상 Level 3**, **반복 문의는 이전 답변이 있고 새 사실이 없을 때만 Level 3**(그 외엔 "반복 문의" 표시만).
       AI 는 category 만 고르고 level 은 코드가 정함. 평가 K01~K12 24/24 (K09 = 반복·새 사실 없음 → Level 3).
     - 전체 기획안 7장(3단계 표·정보 문의는 분류 대상 아님·고위험 후보 기준), 9장(반복 문의 표시 방식), 11-7 표, 5장(학년별 통계·교장교감 메모) 수정. 원본 백업은 세션 scratchpad `전체기획안_backup_20261124.txt`.
     - 교장·교감 메모: `add_case_note(case, 'TEACHER'|'MANAGER', note)` — ADMIN·공유받은 문의만. 학년부장 앞 메모는 아직 학년부장 공유 전이면 그 학년 부장에게 공유도 함. 메모 target 에 TEACHER 추가. 화면 `NotePanel`.
     - 통계: `school_stats()` 가 `{ all, grades: [...] }` 반환 → `SchoolStats` 가 [학교 전체 / N학년] 탭 (학급 단위는 없음).
     - 지난 문의함: 답변 보낸 지 2일(`ARCHIVE_AFTER_MS`, `splitArchived` in `src/lib/cases.ts`) 지난 문의를 업무함에서 빼서 `/teacher/archive`·`/admin/archive` 로. 사이드바 메뉴 + 좁은 화면 상단 바로가기.
     - "공유 버튼이 잘 안 눌림": ① 브라우저 확인 창(window.confirm)을 화면 안 확인(`InlineConfirm`)으로 모두 바꿈(앱 안 브라우저에서 막힐 수 있음) ② **개발 모드 "N" 표시가 좁은 화면에서 왼쪽 아래 버튼을 가림** → `next.config.ts` `devIndicators: false`.
     - 브라우저 확인(teacher2·admin1): 실제 클릭으로 공유 확인창 표시(취소함), 교장·교감 담임 앞 메모 저장·표시, 학년 탭 전환, 지난 문의함(빈 상태). 2일 규칙은 함수로 47시간 유지·49시간 이동 확인.

- ✅ C. 지식 — 학교 자료 근거 답변 (2026-11-25)
   - 사용자 결정: 가상 문서는 Claude 가 작성(`scripts/sample-documents.json`, 10개 — 학교 7·학급 2(3-2, 3-3)·교육법률 1(민원 절차 "예시", 실제 법령 아님), 전부 is_sample "시연용 가상 자료").
     등록 주체는 기획안 13장대로: 교장·교감 = 학교 자료(SCHOOL)·교육법률(LEGAL), 담임 = 자기 반 학급 자료(CLASS). 등록 방식은 본문 붙여넣기 + .txt (HWP·PDF 는 복사해 붙여넣기).
   - 임베딩: `gemini-embedding-001`, 768차원 (2026-11-25 이 키로 확인, 1회 약 0.5초). `src/lib/ai/embed.ts`. `text-embedding-004` 등은 404.
   - DB `0008_documents_rag.sql` (실제 적용·권한 점검 178개 통과): pgvector(`extensions` 스키마), `documents`·`document_chunks`(vector(768), hnsw), `messages.sources`.
     RLS: 학부모 = 우리 학교 학교·교육법률 + 자녀 반 학급 자료 / 교사 = + 맡은 반 / 학년부장 = + 맡은 학년 / 교장·교감 = 전체. 쓰기는 로그인한 사람 권한(`can_manage_document`), 수정 없음(지우고 다시).
     `match_document_chunks(vector, class_id, count)` 는 security invoker → 부르는 사람 RLS 그대로. 함수 search_path 에 `extensions` 필요(`<=>` 연산자).
   - 조각·고르기 `src/lib/documents.ts`: 문단 단위 약 600자, 조각 앞에 "[제목]". `pickRelevant`: 유사도 0.70 이상 최대 3개, 없으면 1등이 0.64 이상이고 2등보다 0.03 높을 때만
     (보정값: 맞는 자료 0.72~0.80, 관계없는 자료 0.63~0.69, 인사 최고 0.65 — 자료가 크게 늘면 다시 보정).
   - 상담 AI(`parent/actions.ts` replyAndSave): 학부모 최근 말 2개로 검색(자녀 반 한정, 실패해도 상담 계속) → 지침에 "학교 자료" 섹션 → 답변 끝 `[[근거:n]]` 를 떼고 `messages.sources` 저장.
     표시가 없어도 답변에 자료 제목이 그대로 나오면 근거로 봄(`citedDocs`, 브라우저에서 AI 가 괄호로 제목만 쓴 경우가 있었음). 화면 `SourceCards` → `/parent/documents/[id]`(RLS 로 다른 반 자료는 404).
   - 교사·관리자: 문의 상세 "관련 학교 자료"(`/teacher|admin/cases/[id]/related` → `src/lib/related-docs-route.ts`, 요약으로 검색), 자료 페이지 `/teacher/documents`(학급 자료)·`/admin/documents`(학교·교육법률), `DocumentsManager`·`DocumentDetail`, 사이드바 메뉴(학년부장은 숨김).
   - 가상 자료 등록: `npm.cmd run seed:docs` (같은 제목은 건너뜀, secret 키). 2026-11-25 실제 DB 에 10건 등록.
   - PGlite 권한 시험은 pgvector 가 필요해 scratchpad `pgtest6`(pglite 0.6.0 + `@electric-sql/pglite-pgvector` 0.1.0, `grant usage on schema extensions`)의 `rls8.mjs` 로 돌림. 빈 DB·realdata 178/178, 다른 반 자료를 열면 5개 실패 확인.
   - 평가: 검색 Q01~Q12(반 구분·인사엔 자료 없음), 상담 근거 C19~C22(자료대로 정확, 관계없는 자료면 지어내지 않음, 규정이 있어도 단정 안 함) — 처음 실행 전부 통과.
   - 브라우저 확인(parent1·teacher1): 체험학습 기한·결과보고서 자료대로 답 + 근거 카드 + 원문 보기, 3-3 자료 404, 교사 "숙제 양" 문의에 3-2 학급 안내 관련 자료, 교사 학급 자료 등록 → 검색 조각 생성 → 지우기(점검 자료 남지 않음).
     admin1: 자료 10개 전부(3-2·3-3 학급 자료 포함)·모두 지우기 버튼, [교육·법률] 선택 시 "검증된 공식 자료만" 안내, 테스트 교육·법률 자료 등록 → 지우기.
   - **관련 학교 자료 보완 (0009, 2026-11-25)**: 교장·교감 화면에서 "별명" 문의에 관련 자료가 안 뜸 → 측정해 보니 문의 요약(이야기 말투)과 규정 문장의 말투가 달라
     맞는 규정(생활지도 제13조)이 0.69로 기준 미달, 대신 "상담 신청 안내·민원 절차" 같은 일반 문서가 더 비슷하게 나옴. 조각을 잘게(약 300자) 나눠도 해결 안 됨.
     → 분류 AI 가 "규정 말투 검색어"(`doc_query`, 예: 학생 간 갈등 놀림 따돌림 생활지도)를 함께 만들어 `risk_assessments.doc_query` 에 저장(`0009_doc_query.sql`),
       예전 문의는 관련 자료를 처음 열 때 `makeDocQuery`(src/lib/ai/doc-query.ts)로 만들어 저장. 실패하면 요약 그대로 검색.
     → 실제 문의 4건 모두 맞는 자료(공개 지도·지도 방식 → 생활지도 규정 0.735·0.769, 숙제 → 3-2 학급 안내, 별명 → 생활지도 규정). 평가 Q13~Q15 추가.
   - 평가(전체 --runs 2, 0009 전): 자동 676/679, 채점관 148/149. 실패 C20 1회(근거 표시 빠짐 → 앱처럼 제목 언급도 근거로 보게 평가도 맞춤), D03 1회(초안 전제 — 알려진 약점), K09 1회(새 사실 판단 애매).
     보완 후 C19~C22·Q01~Q15·K09 2회: 101/101, 채점관 22/22.
   - 0009 실제 적용 후 브라우저(admin1): "별명" 문의에 관련 자료 = 생활지도 규정 (발췌) → 원문 보기 `/admin/documents/[id]` (제13조 포함), doc_query 저장 확인.
     ⚠ 실제 DB 조회 스크립트에서도 risk_assessments↔cases 는 `cases!risk_assessments_case_id_fkey(...)` 처럼 이름 지정 필요.
   - **기획안 원칙 3(법률 정보 제공) 반영 + 법률 자료 (2026-11-25 사용자 요청)**
     - 교육·법률 자료 4개 추가(`sample-documents.json`, seed:docs 로 실제 DB 등록): 아동학대 기준(아동복지법·아동학대처벌법), 학생생활지도 기준(초·중등교육법 제20조의2·교육부 고시),
       교육활동 보호·허위 신고(교원지위법·형법 무고), 학교폭력(학교폭력예방법).
       **2026-11-28: 국가법령정보센터 현행 원문을 앱 안 브라우저로 직접 읽고 다시 씀** (law.go.kr 는 본문을 JavaScript 로 불러와 일반 가져오기로는 안 읽힘 → 브라우저 + innerText).
       확인한 원문: 아동복지법 제3조7호·제17조 / 아동학대처벌법 제2조3호 단서(교원의 정당한 교육활동·생활지도는 아동학대 아님)·제10조·제11조의2②·제17조의3 /
       초·중등교육법 제18조의6(보호자 의무)·제20조의2(생활지도·긴급 제지)·제20조의4(분리=개별학생교육지원) / 교원의 학생생활지도에 관한 고시(교육부고시 제2026-3호) 제2·3·16·17조 /
       교원지위법 제17·18·19·26조 / 형법 제156조 / 학교폭력예방법 제2·12·13조의2·20·20조의2. 출처 칸에 각 법의 시행일 기록.
       예전 요약의 오류: "정당한 생활지도는 학대 아님"은 초·중등교육법이 아니라 아동학대처벌법 제2조3호 단서. 117 은 법 조문에는 번호가 없음(긴급전화 제20조의2).
       처벌 수위(형법 제156조의 징역·벌금)는 일부러 뺌. 법률 자문 아님 — 법령 개정 시 다시 확인 필요.
     - 상담 지침(`counselor-prompt.ts` "법률 정보는 간단히 안내한다"): 법률 "자문"은 안 하되 판단에 필요한 "정보"는 짧게. 아동학대는 단정 대신 "정당한 생활지도인지 등 당시 상황 확인 필요" + 자료의 기준.
       법 이름·내용은 교육·법률 자료에 있는 것만. 신고·고소 질문엔 132·교육청 안내, 말리거나 부추기지 않음.
       **사용자 결정 (2026-11-25): 온담 AI 의 목표는 교권 보호** → 선생님·학교 관계자를 신고·고소하는 이야기(아동학대 신고·고소 방법 문의 등)가 나오면
       확실하다고 하든 아니든 **그 대화에서 반드시 한 번** 무고 정보를 차분히 안내(허위인 줄 알면서 하는 신고·고소만 해당, 사실이라 믿은 신고는 문제 아님 — 처벌 수위·위협·거짓말 취급 금지).
       이 문장은 법률 자료가 없어도 씀. 그냥 속상함을 털어놓는 학부모에겐 무고·교권 이야기 금지.
       2026-11-28 사용자 요청: "신고는 정당한 권리"(지침·`law-teacher-protection` 자료의 "학부모의 권리" 항목) 삭제, "사실이라고 믿고 하는 신고는 문제 아님"(지침·자료) 삭제,
       `law-child-abuse` 의 "누구든지 신고할 수 있습니다" → "「아동학대범죄의 처벌 등에 관한 특례법」에 따라 아동학대가 의심되면 112로 신고할 수 있습니다" (평가 C24·C27 에 "누구든지/누구나" 금지어).
       무고 안내 앞에 완충 문구("일반적인 안내로 말씀드리면" 등)는 넣지 않기로 함(사용자 결정 2026-11-28) — 채점관은 C27 에서 "의심하는 듯 들린다"고 지적할 수 있음(참고용).
       선생님 신고·고소 이야기면 무고 자료를, 아동학대 신고·고소면 아동학대 기준 자료도 **항상 근거 카드로 함께** — `legalNeeds`(documents.ts, "학교폭력 신고"는 제외) +
       `searchLegalDocs`(doc-search.ts, 고정 검색 문장으로 1등 교육·법률 자료, 0.72 이상) → actions.ts 가 AI 표시와 상관없이 sources 에 추가.
       `seed:docs` 는 이제 시연용 자료(is_sample)의 내용이 바뀌면 본문·조각을 새로 만듦(문서 id 유지). 평가 C14·C23~C28·Q16~Q18 2회 전부 통과, 브라우저(parent1)로 근거 카드 2개 확인.
     - 근거 카드: AI 가 제목의 괄호 부분을 빼고 말해도("아동학대 관련 법률 기준 요약") 근거로 봄(`citedDocs`).
     - 검색 고르기 다시 보정(`pickRelevant`): 1등 0.68 이상이면 "1등 - 0.03" 이상만(최대 3) — 비등한 관련 자료 둘을 함께 고르고, 1등 뒤에 붙던 엉뚱한 자료는 뺌. 2등 비교는 다른 문서끼리(같은 문서 다른 조각 제외).
     - 평가: 법률 C23~C28 + C14(단정 없음·신고·고소엔 무고 정보·조항 안 지어냄·속상한 학부모에겐 안 꺼냄), 검색 Q16~Q18, `expectAny`(관련 자료가 둘 이상일 때). 채점관에게도 AI 가 받은 자료를 보여 주도록 고침(안 보여 주면 자료 내용을 "지어냈다"고 오채점).

- 🔄 D. 다듬기 (2026-11-28) — 사용자 결정으로 범위 축소
   - **하지 않는 것**: 상담 가능시간 설정·상담 시간 신청(전체 기획안 교사 기능 목록에서도 삭제, 백업은 세션 scratchpad `전체기획안_backup_20261128.txt`),
     AI 답변 초안의 "[상담 가능한 날짜와 시간]" 빈칸, 통계의 근무시간 외 상담 비율·시간대별 그래프, "가상 상황만 입력" 안내 문구, 학년별 작은 숫자 가림(반 단위 통계가 없으므로).
   - 통계 고도화 `0010_stats_period_subject.sql`: `school_stats(p_from, p_to)`(null = 전체, 상담은 시작일·문의는 전달일 기준) + `risk_assessments.subject`(주제 분야).
     처음 버전은 학년별 1~2건을 -1 로 가렸으나 사용자 결정으로 뺌(0010 을 고쳐 다시 실행, `stat_mask` 함수는 지움). 권한 점검 184개(PGlite 빈 DB·realdata 통과).
     기간 계산 `src/lib/stat-periods.ts`(KST, 주는 월요일, 학기 3·9월, 1~2월은 지난해 2학기). `getAdminCases` 가 4개 기간을 한 번에 불러 `SchoolStats` 가 [기간]×[학교 전체/학년] 탭.
     0010 을 아직 안 돌린 DB 면 예전 `school_stats()` 로 "전체"만 보여 줌.
   - 주제 분야 `src/lib/subjects.ts`: 교우관계 PEER / 생활지도·훈육 GUIDANCE / 학습·숙제·평가 LEARNING / 안전·건강 SAFETY(학교 가기 싫어함 같은 마음·적응 포함) / 학교 행사·행정 SCHOOL_LIFE(안내·절차 문의만) / 기타 OTHER.
     분류 AI(`classify.ts`)가 함께 고름, 0010 전 DB 면 subject 없이 저장. 예전 문의는 "주제 분야 분류 전"으로 셈. 평가 K01~K07·K11 에 `subject` 기대값, 2회 16/16.
   - 월간 보고서 `/admin/report?month=YYYY-MM` (교장·교감만, `getMonthlyReport`): 학교 전체 + 학년별 표, 이전/다음 달, [인쇄하기·PDF 저장](`PrintButton`, window.print).
     ⚠ "use client" 파일(SchoolStats.tsx)의 일반 함수를 서버 화면에서 부르면 실행 오류 — 서버에서 쓸 값은 서버에서 계산할 것.
   - 브라우저(admin1, 0010 적용 후): 기간 탭 이번 주(11.23~11.28)·이번 달, 학년 탭 숫자 그대로, 주제 분야 막대(예전 문의 4건은 분류 전), 월간 보고서 11월·10월(0건). 인쇄 창은 열어 보지 않음.
   - 휴대폰 학부모 화면: `ParentShell` 의 `MobileConversations` — 좁은 화면에서 접었다 펴는 "상담 내역 N" + "선생님 답변 도착 N" 배지 + 새 상담(<details>, JS 없음).
     브라우저(parent1, 375px): 상담 내역 펼치기, [원문 보기] 한 번에 열림, 답변 화면 가로 스크롤 없음.
   - 작은 정리: AI 상담 답변의 "어머님/아버님" → "학부모님"(`fixHonorific`, gemini.ts), 신고·고소 질문엔 무고 안내와 132·교육청 안내를 같이(지침), 평가 C21 금지어 "보통"은 숫자가 붙을 때만.

## 주요 파일
- `src/lib/supabase/{client,server,proxy}.ts`, `src/proxy.ts`, `src/lib/auth.ts` (requireRole)
- `src/app/{login,parent,teacher}/...`, `src/components/{brand,landing,parent,teacher}/`, `src/app/actions.ts` (로그아웃)
