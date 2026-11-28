import { Suspense } from "react";
import { DocumentsManager } from "@/components/documents/DocumentsManager";
import { TeacherShell } from "@/components/teacher/TeacherShell";
import { requireRole } from "@/lib/auth";
import { homeroomClasses, loadDocuments } from "@/lib/documents-data";

// 교사 — 학교·학급 자료 (v2 C). 학교 자료·교육법률 자료는 보기만, 우리 반 학급 자료는 등록·삭제.
export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-muted">불러오는 중…</p>}>
      <Docs />
    </Suspense>
  );
}

async function Docs() {
  const { supabase, profile } = await requireRole(["TEACHER"]);
  const classes = await homeroomClasses(supabase, profile.id);
  const docs = await loadDocuments(supabase, profile, classes.map((c) => c.id));

  return (
    <TeacherShell userName={profile.display_name} newCount={0} current="docs">
      <main className="flex max-w-[960px] flex-col gap-[22px] px-4 pt-[30px] pb-12 sm:px-8">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">교사 · 학교·학급 자료</span>
          <h1 className="m-0 text-[26px] font-black tracking-[-0.8px] text-heading sm:text-[32px]">학교·학급 자료</h1>
          <p className="m-0 text-[15px] text-[#4D6157]">
            학부모님이 AI에게 학교생활을 물으면 이 자료를 근거로 안내해요. 우리 반 준비물·학급 일정 같은 학급 자료를 직접 올릴 수 있어요.
            학교 자료는 교장·교감 선생님이 등록해요.
          </p>
        </div>
        <DocumentsManager docs={docs} scopes={["CLASS"]} area="teacher" classLabel={classes[0]?.label ?? null} />
      </main>
    </TeacherShell>
  );
}
