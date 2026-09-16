import { NextResponse } from "next/server";
import {
  getMonthlyTotals,
  getYearCategoryComparison,
} from "@/server/db/queries/analytics";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());

  const current = getMonthlyTotals(workspaceId, `${year}-01`, `${year}-12`);
  const previous = getMonthlyTotals(
    workspaceId,
    `${year - 1}-01`,
    `${year - 1}-12`
  );
  const currentIncome = getMonthlyTotals(
    workspaceId,
    `${year}-01`,
    `${year}-12`,
    "income"
  );
  const previousIncome = getMonthlyTotals(
    workspaceId,
    `${year - 1}-01`,
    `${year - 1}-12`,
    "income"
  );

  return NextResponse.json({
    year,
    current,
    previous,
    currentIncome,
    previousIncome,
    categories: getYearCategoryComparison(workspaceId, year),
  });
}
