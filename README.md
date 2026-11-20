# 온담 AI (MVP)

> 충분히 이야기한 뒤, 내가 확인한 내용만 학교에 전달합니다.

기획안: `../# 온담 기획안 (MVP ver).txt`

## 처음 설정하기

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만든다 (Region: Seoul 권장).
2. 대시보드 → **SQL Editor** 에 `supabase/migrations/0001_init.sql` 전체를 붙여넣고 실행한다.
3. 대시보드 → **Project Settings → API Keys** 에서 Project URL 과 Publishable key 를 복사한다.
4. `.env.local.example` 을 복사해 `.env.local` 로 만들고 위 값을 넣는다.
5. 개발 서버 실행:

   ```bash
   npm run dev
   ```

   http://localhost:3000 에서 확인한다.

## 구조

| 경로 | 내용 |
|---|---|
| `src/app/login` | 로그인 |
| `src/app/parent` | 학부모 AI 상담실 (채팅은 다음 단계) |
| `src/app/teacher` | 교사 업무함 — 전달 동의된 Case 만 보임 |
| `src/lib/supabase` | Supabase 클라이언트 (브라우저 / 서버 / proxy) |
| `src/proxy.ts` | 세션 갱신, 비로그인 사용자를 /login 으로 보냄 |
| `supabase/migrations` | DB 스키마 + RLS |

## 권한 원칙 (DB 에서 강제)

- 상담(`conversations`, `messages`)은 **학부모 본인만** 볼 수 있다. 교사용 정책이 아예 없다.
- `cases` 는 `consent_and_create_case()` 함수로만 생긴다. 상담이 `CONSENT_PENDING` 상태이고 본인 자녀일 때만 가능하다.
- 교사는 **배정받은 + 담당 학급 학생**의 Case 만 볼 수 있다.
- 상태 변경은 `set_conversation_status()` / `decline_and_close()` / `consent_and_create_case()` 함수로만 한다.
- 교사가 Case 를 열면 `open_case()` 가 `audit_logs` 에 기록한다.

MVP 에는 위험도 분류·긴급 안전 프로토콜이 없으므로 **내부 테스트·시연용으로만** 사용한다.
