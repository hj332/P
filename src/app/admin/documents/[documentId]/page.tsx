import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DocumentDetail } from "@/components/documents/DocumentDetail";
import { TeacherShell } from "@/components/teacher/TeacherShell";
import { requireRole } from "@/lib/auth";
import { loadDocument } from "@/lib/documents-data";

// 학교 자료 원문 (교직원). RLS: 볼 수 있는 자료만 — 아니면 404.
export default function Page(props: PageProps<"/admin/documents/[documentId]">) {
  return (
    <Suspense fallback={<p className="p-6 text-muted">불러오는 중…</p>}>
      <Doc params={props.params} />
    </Suspense>
  );
}

async function Doc({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const { supabase, profile } = await requireRole(["ADMIN", "MANAGER"]);
  const doc = await loadDocument(supabase, documentId);
  if (!doc) notFound();
  return (
    <TeacherShell area="admin" userName={profile.display_name} newCount={0} current="docs" showDocs={profile.role !== "MANAGER"}>
      <DocumentDetail doc={doc} backHref={profile.role === "MANAGER" ? "/admin" : "/admin/documents"} />
    </TeacherShell>
  );
}
