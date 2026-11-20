import Image from "next/image";

// design/DESIGN.md 6장 로고. 파일은 public/brand/ (design/assets 에서 복사).
//  badge: 딥그린 둥근 사각형 + 라임 소용돌이 (밝은 배경 헤더용)
//  lime : 라임 소용돌이 단독 (다크 배경, AI 아바타용)
//  green: 초록 소용돌이 단독 (밝은 배경, 아이콘 크기용)
const SRC = {
  badge: "/brand/logo-badge.svg",
  lime: "/brand/logo-mark-lime.svg",
  green: "/brand/logo-mark-green.svg",
} as const;

export function LogoMark({ variant = "badge", size = 40 }: { variant?: keyof typeof SRC; size?: number }) {
  return <Image src={SRC[variant]} alt="" width={size} height={size} unoptimized aria-hidden="true" />;
}

// 헤더용 로고: 배지 + "온담 AI"
export function Wordmark({ size = 40 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5 text-deep-green">
      <LogoMark size={size} />
      <span className="text-[26px] font-black tracking-[-0.5px]">
        온담 <span className="font-bold text-leaf">AI</span>
      </span>
    </span>
  );
}

// AI 아바타: ai-bubble 원 + 라임 소용돌이
export function AiAvatar({ size = 38 }: { size?: number }) {
  return (
    <span
      className="flex flex-none items-center justify-center rounded-full bg-ai-bubble"
      style={{ width: size, height: size }}
    >
      <LogoMark variant="lime" size={Math.round(size * 0.63)} />
    </span>
  );
}
