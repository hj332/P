import { Suspense } from "react";
import { DocumentsManager } from "@/components/documents/DocumentsManager";
import { TeacherShell } from "@/components/teacher/TeacherShell";
import { requireRole } from "@/lib/auth";
import { loadDocuments } from "@/lib/documents-data";

// 교장·교감 — 학교 자료 (v2 C). 학교 자료·교육법률 자료 등록·삭제, 학급 자료는 보기·정리(삭제).
export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-muted">불러오는 중…</p>}>
      <Docs />
    </Suspense>
  );
}

async function Docs() {
  const { supabase, profile } = await requireRole(["ADMIN"]);
  const docs = await loadDocuments(supabase, profile, []);

  return (
    <TeacherShell area="admin" userName={profile.display_name} newCount={0} current="docs">
      <main className="flex max-w-[960px] flex-col gap-[22px] px-4 pt-[30px] pb-12 sm:px-8">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">교장·교감 · 학교 자료</span>
          <h1 className="m-0 text-[26px] font-black tracking-[-0.8px] text-heading sm:text-[32px]">학교 자료</h1>
          <p className="m-0 text-[15px] text-[#4D6157]">
            학교 규칙·학사일정·가정통신문 같은 학교 자료와 교육·법률 자료를 등록해요. 학부모님 AI 상담은 이 자료를 근거로만 학교 정보를 안내해요.
          </p>
        </div>
        <DocumentsManager docs={docs} scopes={["SCHOOL", "LEGAL"]} area="admin" />
      </main>
    </TeacherShell>
  );
}
