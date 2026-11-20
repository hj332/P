// 첫 화면 문구·데이터 (design/screens/Main.html 기준)
import type { IconName } from "@/components/brand/icons";

// 시연용 학교 이름 (supabase/seed_test.sql 의 학교와 같게)
export const SCHOOL_NAME = "온담초등학교";

export const HERO_POINTS: { icon: IconName; text: [string, string] }[] = [
  { icon: "heart", text: ["학부모의 마음을", "따뜻하게"] },
  { icon: "users", text: ["선생님의 업무를", "가볍게"] },
  { icon: "sprout", text: ["아이의 성장을", "함께"] },
];

export const VALUE_CARDS: { icon: IconName; title: string; desc: string }[] = [
  { icon: "users", title: "학부모는 안심합니다", desc: "언제든 편하게 고민을 이야기하고, AI가 차분히 들어줍니다." },
  { icon: "fileText", title: "선생님은 더 집중할 수 있습니다", desc: "AI가 미리 상담 내용을 정리해 교사의 업무 부담을 줄여줍니다." },
  { icon: "sprout", title: "아이는 더 건강하게 성장합니다", desc: "가정과 학교가 함께 아이의 마음을 이해하고 돕습니다." },
  { icon: "school", title: "학교는 더 나은 교육을 만듭니다", desc: "데이터 기반 사전상담으로 소통이 쉬운 교육 환경을 조성합니다." },
];

export const WHY_CARDS: { icon: IconName; title: string; lines: string[] }[] = [
  { icon: "home", title: "학부모", lines: ["궁금한 일이 생겨도", "언제, 어떻게 말해야 할지", "막막하셨죠?"] },
  { icon: "school", title: "학교", lines: ["단순 문의부터 감정적인", "민원까지, 교사가 직접", "응대해야 했습니다."] },
];

export const OLD_FLOW = ["학부모 문의 작성", "곧바로 학교에 접수", "교사가 처음부터 응대"];
export const ONDAM_FLOW = ["AI와 충분히 상담", "요약 직접 확인·수정", "전달 여부를 내가 선택"];

export const STEPS: { icon: IconName; title: string; desc: string }[] = [
  { icon: "heart", title: "공감", desc: "걱정·속상함·불안을 먼저 인정하고 충분히 들어요." },
  { icon: "search", title: "탐색", desc: "무슨 일이 있었는지 필요한 만큼만 차분히 여쭤봐요." },
  { icon: "fileText", title: "정리", desc: "사실 · 해석 · 요구사항을 나누어 정리해요." },
  { icon: "book", title: "안내", desc: "학교 규정과 교육·법률 기준을 근거와 함께 알려드려요." },
  { icon: "circleCheck", title: "확인 · 선택", desc: "학부모님이 요약을 직접 확인·수정하고 전달 여부를 정해요." },
];

export const DEMO_CHAT: { role: "parent" | "ai"; text: string }[] = [
  { role: "parent", text: "우리 아이가 요즘 학교에서 친구와 자주 다투는 것 같아요…" },
  { role: "ai", text: "걱정되시죠. 아이가 친구 관계로 힘들어하는 것 같아 마음이 쓰이셨겠어요. 함께 상황을 살펴볼게요." },
  { role: "ai", text: "언제부터 그런 이야기를 했는지, 특별히 힘들어하는 상황이 있었는지 조금 더 말씀해 주시겠어요?" },
];

export const DEMO_POINTS = ["감정 공감부터", "상황 정리까지", "관련 정보 확인 후", "전달 여부 선택!"];

export const CHANGES: { img: string; alt: string; imgHeight: number; title: string; point: string }[] = [
  { img: "/brand/char-parent.png", alt: "휴대폰을 든 학부모 일러스트", imgHeight: 140, title: "학부모에게", point: "내가 확인한 내용만 전달" },
  { img: "/brand/char-teacher.png", alt: "태블릿을 든 교사 일러스트", imgHeight: 140, title: "교사에게", point: "정리된 요약으로 핵심 업무 집중" },
  { img: "/brand/char-school.png", alt: "학교 건물 일러스트", imgHeight: 130, title: "학교에는", point: "고위험 사안 조기 파악·예방" },
];

export const NAV = [
  { href: "#about", label: "서비스 소개" },
  { href: "#process", label: "상담 진행 방식" },
  { href: "#tools", label: "학교를 위한 도구" },
  { href: "#faq", label: "자주 묻는 질문" },
];
