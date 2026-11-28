"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/brand/icons";
import { addDocument, deleteDocument } from "@/app/documents-actions";
import { DOC_BODY_MAX, DOC_SOURCE_MAX, DOC_TITLE_MAX, SCOPE_LABEL, type DocScope } from "@/lib/documents";
import type { DocItem } from "@/lib/documents-data";

// 학교 자료 등록·목록 (v2 C). 교장·교감: 학교 자료·교육법률 자료 / 담임: 우리 반 학급 자료.
// 등록하면 서버가 조각으로 나누고 검색용 임베딩을 만든다 → 학부모 AI 상담·교사 업무함의 "관련 학교 자료"에 쓰인다.
export function DocumentsManager({
  docs,
  scopes,
  area,
  classLabel,
}: {
  docs: DocItem[];
  scopes: DocScope[]; // 이 사람이 등록할 수 있는 종류
  area: "teacher" | "admin";
  classLabel?: string | null; // 담임의 반 (학급 자료)
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<DocScope>(scopes[0]);
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [askDelete, setAskDelete] = useState<string | null>(null);

  async function loadTxt(file: File | undefined) {
    if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name)) {
      setError("텍스트 파일(.txt)만 불러올 수 있어요. 한글(HWP)·PDF 는 본문을 복사해 붙여 넣어 주세요.");
      return;
    }
    const text = await file.text();
    setBody(text.slice(0, DOC_BODY_MAX));
    if (!title) setTitle(file.name.replace(/\.(txt|md)$/i, "").slice(0, DOC_TITLE_MAX));
    setError(text.length > DOC_BODY_MAX ? `본문이 길어 앞 ${DOC_BODY_MAX.toLocaleString()}자만 불러왔어요.` : null);
  }

  function save() {
    setError(null);
    setNotice(null);
    startSave(async () => {
      const res = await addDocument({ scope, title, source, body });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTitle("");
      setSource("");
      setBody("");
      setOpen(false);
      setNotice("자료를 등록했어요. 이제 AI 상담과 관련 자료 찾기에 쓰여요.");
      router.refresh();
    });
  }

  async function remove(id: string) {
    setAskDelete(null);
    setDeleting(id);
    setError(null);
    const res = await deleteDocument(id);
    setDeleting(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNotice("자료를 지웠어요. 이제 AI 상담에 쓰이지 않아요.");
    router.refresh();
  }

  const groups = (["SCHOOL", "CLASS", "LEGAL"] as DocScope[])
    .map((s) => ({ scope: s, items: docs.filter((d) => d.scope === s) }))
    .filter((g) => g.items.length);

  return (
    <div className="flex flex-col gap-5">
      {notice && (
        <p role="status" className="m-0 rounded-xl bg-ok-bg px-4 py-3 text-sm font-medium text-ok-fg">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger-fg">
          {error}
        </p>
      )}

      {!open ? (
        <div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-[50px] items-center gap-2 rounded-xl bg-deep-green px-[22px] text-base font-bold text-white"
          >
            <Icon name="pencil" size={18} />
            {area === "teacher" ? `${classLabel ?? "우리 반"} 학급 자료 등록` : "자료 등록"}
          </button>
        </div>
      ) : (
        <section aria-label="자료 등록" className="flex flex-col gap-3.5 rounded-3xl border border-line bg-white px-5 py-6 sm:px-7">
          <h2 className="m-0 text-lg font-black text-heading">자료 등록</h2>
          {scopes.length > 1 ? (
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-2 text-sm font-bold text-body">종류</legend>
              <div className="flex flex-wrap gap-2">
                {scopes.map((s) => (
                  <label
                    key={s}
                    className={
                      "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-white px-4 text-[15px] font-bold ring-1 " +
                      (scope === s ? "text-deep-green ring-2 ring-ai-bubble" : "text-body ring-line")
                    }
                  >
                    <input type="radio" name="doc-scope" checked={scope === s} onChange={() => setScope(s)} className="accent-[#2B8256]" />
                    {SCOPE_LABEL[s]}
                  </label>
                ))}
              </div>
              {scope === "LEGAL" && (
                <p className="m-0 text-[13px] text-warn-fg">교육·법률 자료는 교육부·교육청 등 검증된 공식 자료만 올려 주세요. 인터넷 글은 올리지 않아요.</p>
              )}
            </fieldset>
          ) : (
            <span className="text-sm font-bold text-body">종류 · {SCOPE_LABEL[scopes[0]]}{classLabel ? ` (${classLabel})` : ""}</span>
          )}
          <label className="flex flex-col gap-1.5 text-sm font-bold text-body">
            제목
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={DOC_TITLE_MAX}
              placeholder="예) 2026학년도 교외체험학습 운영 안내"
              className="min-h-11 rounded-xl border-[1.5px] border-[#D6E5CF] px-4 text-[15px] font-normal text-ink outline-leaf"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-bold text-body">
            출처 (선택)
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              maxLength={DOC_SOURCE_MAX}
              placeholder="예) 가정통신문 제2026-31호"
              className="min-h-11 rounded-xl border-[1.5px] border-[#D6E5CF] px-4 text-[15px] font-normal text-ink outline-leaf"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-bold text-body">
            <span className="flex flex-wrap items-center justify-between gap-2">
              본문
              <span className="text-xs font-normal text-muted">
                {body.length.toLocaleString()} / {DOC_BODY_MAX.toLocaleString()}자 · 한글(HWP)·PDF 는 본문을 복사해 붙여 넣어 주세요
              </span>
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={DOC_BODY_MAX}
              rows={12}
              placeholder="안내문 내용을 붙여 넣어 주세요. 학부모님 상담에서 이 내용을 근거로 안내해요."
              className="min-h-[240px] w-full resize-y rounded-xl border-[1.5px] border-[#D6E5CF] px-4 py-3 text-[15px] leading-[1.75] font-normal text-ink outline-leaf"
            />
          </label>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-bold text-deep-green underline underline-offset-4">
            <Icon name="fileText" size={16} />
            텍스트 파일(.txt) 불러오기
            <input type="file" accept=".txt,.md,text/plain" className="sr-only" onChange={(e) => loadTxt(e.target.files?.[0])} />
          </label>
          <p className="m-0 text-[13px] leading-[1.6] text-muted">
            학생·학부모 개인정보는 넣지 마세요. 등록한 자료는 {scope === "CLASS" ? `${classLabel ?? "우리 반"} 학부모님` : "우리 학교 학부모님"}의 AI 상담에서 근거로 쓰이고, 원문 보기로 볼 수 있어요.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={save}
              disabled={saving || !title.trim() || !body.trim()}
              className="inline-flex min-h-[50px] items-center gap-2 rounded-xl bg-deep-green px-[22px] text-base font-bold text-white disabled:opacity-50"
            >
              <Icon name="send" size={18} />
              {saving ? "검색용으로 준비하는 중…" : "등록하기"}
            </button>
            {!saving && (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-[50px] items-center px-3 text-[15px] text-muted underline underline-offset-4"
              >
                취소
              </button>
            )}
          </div>
        </section>
      )}

      {groups.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-[#CFE3C4] bg-white px-6 py-12 text-center">
          <Icon name="book" size={28} />
          <p className="m-0 text-[17px] font-bold text-heading">등록된 자료가 없어요</p>
          <p className="m-0 text-sm text-muted">자료를 등록하면 학부모님 AI 상담에서 근거로 안내해요.</p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.scope} aria-label={SCOPE_LABEL[g.scope]} className="flex flex-col gap-2.5">
          <h2 className="m-0 text-base font-black text-heading">
            {SCOPE_LABEL[g.scope]} <span className="text-muted">{g.items.length}</span>
          </h2>
          {g.items.map((d) => (
            <div key={d.id} className="flex flex-col gap-2 rounded-[18px] border border-line bg-white px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <a href={`/${area}/documents/${d.id}`} className="text-[16px] font-bold text-ink underline-offset-4 hover:underline">
                    {d.title}
                  </a>
                  <span className="text-[13px] text-muted">
                    {[d.classLabel, d.source, `${d.chars.toLocaleString()}자`].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {d.isSample && <span className="rounded-md bg-warn-bg px-2 py-0.5 text-xs font-bold text-warn-fg">시연용 가상 자료</span>}
                  {d.canDelete && askDelete !== d.id && (
                    <button
                      type="button"
                      onClick={() => setAskDelete(d.id)}
                      disabled={deleting === d.id}
                      className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 text-[13px] text-body disabled:opacity-50"
                    >
                      {deleting === d.id ? "지우는 중…" : "지우기"}
                    </button>
                  )}
                </div>
              </div>
              {askDelete === d.id && (
                <div role="alertdialog" aria-label="확인" className="flex flex-wrap items-center gap-2 rounded-xl bg-warn-bg px-4 py-3">
                  <span className="text-sm font-medium text-warn-fg">이 자료를 지울까요? 지우면 AI 상담에 더 이상 쓰이지 않아요.</span>
                  <button
                    type="button"
                    onClick={() => remove(d.id)}
                    className="inline-flex min-h-9 items-center rounded-lg bg-deep-green px-3 text-[13px] font-bold text-white"
                  >
                    지우기
                  </button>
                  <button
                    type="button"
                    onClick={() => setAskDelete(null)}
                    className="inline-flex min-h-9 items-center rounded-lg border border-line bg-white px-3 text-[13px] text-body"
                  >
                    취소
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
