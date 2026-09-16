import { NextResponse } from "next/server";
import {
  getIncomeBreakdown,
  getIncomeCategoryHistory,
  getIncomeStability,
  getTopIncomeSources,
  getMonthlyTotals,
} from "@/server/db/queries/analytics";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { toLocalISODate } from "@/server/lib/date-utils";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);

  const now = new Date();
  const from =
    searchParams.get("from") ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const to =
    searchParams.get("to") ??
    toLocalISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  // The preceding period of the same length, for a like-for-like comparison.
  const fromDate = new Date(from);
  const prevFrom = toLocalISODate(
    new Date(fromDate.getFullYear(), fromDate.getMonth() - 1, 1)
  );
  const prevTo = toLocalISODate(
    new Date(fromDate.getFullYear(), fromDate.getMonth(), 0)
  );

  const monthKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const historyFrom = monthKey(
    new Date(fromDate.getFullYear(), fromDate.getMonth() - 11, 1)
  );
  const historyTo = monthKey(fromDate);

  // A categoryId narrows the response to that category's own monthly history,
  // which is what the drill-down sheet needs (and avoids 12 round trips).
  const categoryId = Number(searchParams.get("categoryId"));
  if (Number.isFinite(categoryId) && categoryId > 0) {
    return NextResponse.json({
      history: getIncomeCategoryHistory(
        workspaceId,
        categoryId,
        historyFrom,
        historyTo
      ),
    });
  }

  const categories = getIncomeBreakdown(workspaceId, from, to, prevFrom, prevTo);
  const total = categories.reduce((s, c) => s + c.received, 0);
  const previousTotal = categories.reduce((s, c) => s + c.previous, 0);

  return NextResponse.json({
    period: { from, to },
    total,
    previousTotal,
    transactionCount: categories.reduce((s, c) => s + c.count, 0),
    categories,
    sources: getTopIncomeSources(workspaceId, from, to, 8),
    history: getMonthlyTotals(workspaceId, historyFrom, historyTo, "income"),
    stability: getIncomeStability(workspaceId, historyFrom, historyTo),
  });
}
