"use server";

import { createClient } from "@/lib/supabase/server";

// 로그아웃. 화면 이동은 부르는 쪽(LogoutButton)이 페이지를 완전히 새로 불러오며 한다.
// (Next.js 16 은 떠난 화면을 브라우저에 숨겨 보관하므로, 다른 사람이 같은 브라우저로 로그인할 때
//  앞 사람의 상담 화면이 메모리에 남지 않도록 새로 불러온다)
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
