// 학교에 전달된 문의(Case)의 상태와 선생님 답변. 교사·관리자·학부모 화면이 함께 쓴다.
// DB: cases.status (case_status), case_replies (0003_replies_escalation.sql)
//
// 흐름: NEW → TEACHER_REVIEWING → (관리자와 공유 시 ESCALATED → ADMIN_REVIEWING) → RESOLVED(답변) → CLOSED(학부모 확인)

export type CaseReply = { body: string; authorName: string; createdAt: string };

export const REPLY_MAX = 4000;

// 교사·관리자 화면의 상태 표시
export const CASE_STATUS: Record<string, { label: string; fg: string }> = {
  NEW: { label: "미확인", fg: "text-warn-fg" },
  TEACHER_REVIEWING: { label: "확인 중", fg: "text-ok-fg" },
  ESCALATED: { label: "관리자 공유", fg: "text-[#4B3A84]" },
  ADMIN_REVIEWING: { label: "관리자 확인 중", fg: "text-[#4B3A84]" },
  RESOLVED: { label: "답변 완료", fg: "text-muted" },
  CLOSED: { label: "학부모 확인 완료", fg: "text-muted" },
};

export function caseStatusOf(status: string) {
  return CASE_STATUS[status] ?? { label: status, fg: "text-muted" };
}

// 답변을 보낼 수 있는 상태 (DB 함수 reply_to_case 와 같은 기준)
export function canReply(status: string) {
  return ["NEW", "TEACHER_REVIEWING", "ESCALATED", "ADMIN_REVIEWING"].includes(status);
}

// 공유 대상 (DB 함수 escalate_case 의 p_target)
export type ShareTarget = "MANAGER" | "ADMIN";
export const SHARE_TARGETS: Record<ShareTarget, { label: string; who: string }> = {
  MANAGER: { label: "학년부장 선생님께", who: "학년부장 선생님" },
  ADMIN: { label: "교장·교감 선생님께", who: "교장·교감 선생님" },
};

// 공유할 때 남긴 메모 (교직원만 봄)
// 메모 받는 사람: 공유 대상(학년부장·교장교감) + 담임 (교장·교감이 담임에게 남기는 메모, 0007)
export type NoteTarget = ShareTarget | "TEACHER";
export const NOTE_TO: Record<NoteTarget, string> = {
  TEACHER: "담임 선생님",
  MANAGER: "학년부장 선생님",
  ADMIN: "교장·교감 선생님",
};
export type ShareNote = { authorName: string; target: NoteTarget; note: string; createdAt: string };

// 보는 사람이 아직 공유할 수 있는 대상 (DB 함수 escalate_case 와 같은 기준)
//   담임: 답변 전이면 학년부장·교장교감 각각 한 번 / 학년부장: 교장·교감에게만 / 교장·교감: 없음
export function shareableTargets(
  c: { status: string; sharedManagerAt: string | null; sharedAdminAt: string | null },
  viewerRole: string,
) {
  if (!canReply(c.status)) return [] as ShareTarget[];
  const out: ShareTarget[] = [];
  if (viewerRole === "TEACHER" && !c.sharedManagerAt) out.push("MANAGER");
  if ((viewerRole === "TEACHER" || viewerRole === "MANAGER") && !c.sharedAdminAt) out.push("ADMIN");
  return out;
}

// 학부모 화면: 누구와 함께 확인한 문의인지
export function sharedWithLabel(sharedManagerAt: string | null, sharedAdminAt: string | null) {
  const who = [sharedManagerAt && "학년부장 선생님", sharedAdminAt && "교장·교감 선생님"].filter(Boolean);
  return who.length ? who.join(", ") : null;
}

export function hasReply(status: string | null | undefined) {
  return status === "RESOLVED" || status === "CLOSED";
}

// 답변 초안에서 선생님이 채워야 하는 [빈칸] 이 남아 있는지
export const BLANK_PATTERN = /\[[^\[\]\n]{1,40}\]/;

// "11.20 (금) 15:10" (한국 시간)
export function formatCaseTime(iso: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.month}.${parts.day} (${parts.weekday}) ${parts.hour}:${parts.minute}`;
}

// 답변을 보낸 지 2일이 지난 문의는 "지난 문의함"으로 옮긴다 (사용자 요청 2026-11-24)
export const ARCHIVE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

export function splitArchived<T extends { reply: { createdAt: string } | null }>(cases: T[], now: number) {
  const isArchived = (c: T) => !!c.reply && now - Date.parse(c.reply.createdAt) >= ARCHIVE_AFTER_MS;
  return { active: cases.filter((c) => !isArchived(c)), archived: cases.filter(isArchived) };
}
