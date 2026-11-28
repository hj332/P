import { handleRelatedDocs } from "@/lib/related-docs-route";

// GET /admin/cases/[caseId]/related — 문의 상세의 "관련 학교 자료" (설명은 handleRelatedDocs)
export async function GET(_req: Request, ctx: RouteContext<"/admin/cases/[caseId]/related">) {
  const { caseId } = await ctx.params;
  return handleRelatedDocs(caseId);
}
