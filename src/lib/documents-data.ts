import "server-only";
import type { requireRole } from "@/lib/auth";
import type { DocScope } from "@/lib/documents";

// 교사·교장교감 화면의 학교 자료 목록. 로그인한 사람의 권한(RLS)으로 읽는다.
type Supa = Awaited<ReturnType<typeof requireRole>>["supabase"];

export type DocItem = {
  id: string;
  scope: DocScope;
  classLabel: string | null;
  title: string;
  source: string;
  isSample: boolean;
  createdAt: string;
  chars: number;
  canDelete: boolean;
};

export async function loadDocuments(supabase: Supa, me: { id: string; role: string }, homeroomClassIds: string[]) {
  const { data, error } = await supabase
    .from("documents")
    .select("id, scope, class_id, title, source, body, is_sample, created_at, created_by, classes(grade, class_no)")
    .order("scope")
    .order("created_at", { ascending: false });
  if (error) console.error("[documents]", error.message);
  return (data ?? []).map((d): DocItem => {
    const cls = d.classes as unknown as { grade: number; class_no: number } | null;
    return {
      id: d.id,
      scope: d.scope as DocScope,
      classLabel: cls ? `${cls.grade}학년 ${cls.class_no}반` : null,
      title: d.title,
      source: d.source,
      isSample: d.is_sample,
      createdAt: d.created_at,
      chars: (d.body as string).length,
      // DB 정책과 같은 기준 (화면 표시용): 교장·교감은 학교의 모든 자료, 담임은 자기 반 학급 자료
      canDelete: me.role === "ADMIN" || (d.scope === "CLASS" && !!d.class_id && homeroomClassIds.includes(d.class_id)),
    };
  });
}

export async function loadDocument(supabase: Supa, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase
    .from("documents")
    .select("id, scope, title, source, body, is_sample, created_at, classes(grade, class_no)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const cls = data.classes as unknown as { grade: number; class_no: number } | null;
  return {
    id: data.id,
    scope: data.scope as DocScope,
    classLabel: cls ? `${cls.grade}학년 ${cls.class_no}반` : null,
    title: data.title,
    source: data.source,
    body: data.body as string,
    isSample: data.is_sample,
    createdAt: data.created_at,
  };
}

export async function homeroomClasses(supabase: Supa, teacherId: string) {
  const { data } = await supabase
    .from("teacher_classes")
    .select("class_id, classes(grade, class_no)")
    .eq("teacher_id", teacherId)
    .eq("is_homeroom", true);
  return (data ?? []).map((r) => {
    const c = r.classes as unknown as { grade: number; class_no: number } | null;
    return { id: r.class_id as string, label: c ? `${c.grade}학년 ${c.class_no}반` : "우리 반" };
  });
}
