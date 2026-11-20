import "server-only";
import { createClient } from "@supabase/supabase-js";

// RLS 를 우회하는 관리자 클라이언트. 서버에서만 쓴다 ("server-only" 가 브라우저 번들에 들어가는 것을 막는다).
// 지금 쓰는 곳: AI 답변(role = 'assistant') 메시지 저장 하나뿐.
// 쓰기 전에 반드시 로그인한 사용자 권한(RLS)으로 그 상담이 본인 것인지 먼저 확인할 것.
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY 가 .env.local 에 없습니다.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
