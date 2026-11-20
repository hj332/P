import Link from "next/link";
import { Wordmark } from "@/components/brand/Logo";
import { LoginCard } from "@/components/landing/LoginCard";

// 로그인이 필요한 화면에 바로 들어왔을 때 오는 곳. 첫 화면과 같은 로그인 카드를 쓴다.
export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-8 bg-bg-soft px-4 py-12 sm:py-16">
      <Link href="/" aria-label="온담 AI 첫 화면">
        <Wordmark />
      </Link>
      <LoginCard />
    </main>
  );
}
