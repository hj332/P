// 시연용 가상 학교 자료 등록 (v2 C). 실행: npm.cmd run seed:docs
// - scripts/sample-documents.json 의 문서를 온담초등학교(테스트 학교)에 등록하고, 조각·임베딩을 만든다.
// - 0008_documents_rag.sql 과 seed_test.sql·seed_admin.sql 을 먼저 실행해 두어야 한다.
// - 같은 제목의 자료가 이미 있으면 건너뛴다 (여러 번 실행해도 된다). 단, 시연용 가상 자료의 내용이 바뀌었으면 본문·조각을 새로 만든다. 모두 is_sample = true (화면에 "시연용 가상 자료").
// - 서버 secret 키로 쓴다 (스크립트라 로그인한 사람이 없음). 학교 자료는 admin1, 학급 자료는 그 반 담임 이름으로 등록.
import fs from "node:fs";
import path from "node:path";
import { createAdminClient } from "../src/lib/supabase/admin";
import { embedTexts, toPgVector } from "../src/lib/ai/embed";
import { chunkDocument, type DocScope } from "../src/lib/documents";

type SampleDoc = { key: string; scope: DocScope; grade?: number; classNo?: number; title: string; source: string; body: string };

async function main() {
  const set = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "sample-documents.json"), "utf8")) as { documents: SampleDoc[] };
  const db = createAdminClient();

  const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
  const idOf = (email: string) => users?.users.find((u) => u.email === email)?.id;
  const adminId = idOf("admin1@example.com");
  if (!adminId) throw new Error("admin1@example.com 계정이 없습니다. seed_admin.sql 안내대로 먼저 만들어 주세요.");
  const { data: adminProfile } = await db.from("profiles").select("school_id").eq("id", adminId).single();
  if (!adminProfile) throw new Error("admin1 프로필이 없습니다. seed_admin.sql 을 먼저 실행해 주세요.");
  const schoolId = adminProfile.school_id;

  const { data: existing } = await db.from("documents").select("id, title, body, is_sample").eq("school_id", schoolId);
  const have = new Map((existing ?? []).map((d) => [d.title, d]));

  let added = 0;
  let updated = 0;
  for (const d of set.documents) {
    const prev = have.get(d.title);
    if (prev) {
      // 시연용 가상 자료(is_sample)이고 내용이 바뀌었으면 본문·조각을 새로 만든다 (문서 id 는 그대로 — 예전 근거 카드 링크 유지).
      // 사람이 직접 등록한 자료(is_sample=false)는 건드리지 않는다.
      if (!prev.is_sample || prev.body === d.body) {
        console.log(`- 이미 있음: ${d.title}`);
        continue;
      }
      const chunks = chunkDocument(d.title, d.body);
      const vectors = await embedTexts(chunks, "DOCUMENT");
      const { error: uErr } = await db.from("documents").update({ body: d.body, source: d.source }).eq("id", prev.id);
      if (uErr) throw new Error(`문서 수정 실패 (${d.title}): ${uErr.message}`);
      const { error: dErr } = await db.from("document_chunks").delete().eq("document_id", prev.id);
      if (dErr) throw new Error(`이전 조각 정리 실패 (${d.title}): ${dErr.message}`);
      const { error: cErr } = await db
        .from("document_chunks")
        .insert(chunks.map((content, i) => ({ document_id: prev.id, chunk_index: i, content, embedding: toPgVector(vectors[i]) })));
      if (cErr) throw new Error(`조각 저장 실패 (${d.title}): ${cErr.message}`);
      updated++;
      console.log(`↻ 내용 바뀜, 다시 등록: ${d.title} (조각 ${chunks.length}개)`);
      continue;
    }
    let classId: string | null = null;
    let createdBy = adminId;
    if (d.scope === "CLASS") {
      const { data: cls } = await db
        .from("classes")
        .select("id, teacher_classes(teacher_id, is_homeroom)")
        .eq("school_id", schoolId)
        .eq("grade", d.grade!)
        .eq("class_no", d.classNo!)
        .maybeSingle();
      if (!cls) {
        console.log(`- 반이 없어 건너뜀: ${d.title}`);
        continue;
      }
      classId = cls.id;
      const homeroom = (cls.teacher_classes as { teacher_id: string; is_homeroom: boolean }[]).find((t) => t.is_homeroom);
      if (homeroom) createdBy = homeroom.teacher_id;
    }

    const chunks = chunkDocument(d.title, d.body);
    const vectors = await embedTexts(chunks, "DOCUMENT");
    const { data: doc, error } = await db
      .from("documents")
      .insert({ school_id: schoolId, scope: d.scope, class_id: classId, title: d.title, source: d.source, body: d.body, is_sample: true, created_by: createdBy })
      .select("id")
      .single();
    if (error || !doc) throw new Error(`문서 등록 실패 (${d.title}): ${error?.message}`);
    const { error: cErr } = await db
      .from("document_chunks")
      .insert(chunks.map((content, i) => ({ document_id: doc.id, chunk_index: i, content, embedding: toPgVector(vectors[i]) })));
    if (cErr) {
      await db.from("documents").delete().eq("id", doc.id);
      throw new Error(`조각 저장 실패 (${d.title}): ${cErr.message}`);
    }
    added++;
    console.log(`✓ ${d.title} (조각 ${chunks.length}개)`);
  }
  console.log(`\n새로 등록 ${added}건 · 내용 바뀜 ${updated}건 · 전체 ${set.documents.length}건`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
