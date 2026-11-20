import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getParentContext } from "./data";
import { isOpen } from "@/lib/summary";

// /parent → 진행 중인 상담이 있으면 그 상담으로, 없으면 새 상담으로 보낸다.
export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-muted">불러오는 중…</p>}>
      <Go />
    </Suspense>
  );
}

async function Go(): Promise<never> {
  const { conversations } = await getParentContext();
  const open = conversations.find((c) => isOpen(c.status));
  redirect(open ? `/parent/chat/${open.id}` : "/parent/chat");
}
