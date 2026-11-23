import { handleOpenCase } from "@/lib/open-case-route";

// POST /admin/cases/[caseId]/open — 관리자가 공유받은 Case 상세를 실제로 열었을 때 (설명은 handleOpenCase)
export async function POST(_req: Request, ctx: RouteContext<"/admin/cases/[caseId]/open">) {
  const { caseId } = await ctx.params;
  return handleOpenCase(caseId);
}
