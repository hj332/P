import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

// design/DESIGN.md 4장: Noto Sans KR (400 / 500 / 700 / 900)
const notoSansKr = Noto_Sans_KR({
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-sans-kr",
});

export const metadata: Metadata = {
  title: "온담 AI 상담실",
  description: "충분히 이야기한 뒤, 내가 확인한 내용만 학교에 전달합니다.",
  icons: { icon: "/brand/logo-badge.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${notoSansKr.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
