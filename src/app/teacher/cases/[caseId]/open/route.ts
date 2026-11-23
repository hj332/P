import { handleOpenCase } from "@/lib/open-case-route";

// POST /teacher/cases/[caseId]/open — 담임이 Case 상세를 실제로 열었을 때 (설명은 handleOpenCase)
export async function POST(_req: Request, ctx: RouteContext<"/teacher/cases/[caseId]/open">) {
  const { caseId } = await ctx.params;
  return handleOpenCase(caseId);
}
