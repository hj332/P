import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";

// /teacher → 교사 업무함 (design/DESIGN.md 1장 라우트)
// Cache Components 에서는 요청 시점 작업(connection) 뒤에 redirect 해야 미리 그리기 검사 오류가 나지 않는다.
export default function Page() {
  return (
    <Suspense>
      <Go />
    </Suspense>
  );
}

async function Go(): Promise<never> {
  await connection();
  redirect("/teacher/inbox");
}
