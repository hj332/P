// 역할과 역할별 첫 화면. 서버(requireRole)와 브라우저(로그인 카드)가 함께 쓴다.
export type Role = "PARENT" | "TEACHER" | "MANAGER" | "ADMIN";

// 로그인 직후·잘못 들어온 화면에서 보낼 곳
export function homePathFor(role: string) {
  if (role === "PARENT") return "/parent";
  // 교장·교감(ADMIN)과 학년부장(MANAGER)은 공유받은 문의 목록으로
  if (role === "ADMIN" || role === "MANAGER") return "/admin";
  return "/teacher/inbox";
}
