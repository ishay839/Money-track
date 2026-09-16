import { NextResponse } from "next/server";
import {
  getPeriodTotal,
  getTopMerchants,
} from "@/server/db/queries/transactions";
import {
  getBankHealth,
  getCashFlow,
  getCategorySnapshot,
  getHistoricalTrend,
  getNeedsAttentionCounts,
  getRecentTransactionsForHome,
} from "@/server/db/queries/home";
import { getWorkspaceSetting } from "@/server/db/queries/settings";
import { getNextRunAt } from "@/server/sync/scheduler";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import {
  daysInMonth,
  dayWithinMonth,
  daysUntil,
  nextPayday,
  pacePhrase,
} from "@/server/lib/pace";
import { toLocalISODate } from "@/server/lib/date-utils";
import type {
  HomeBankHealthItem,
  HomeCashFlow,
  HomeCategorySnapshotItem,
  HomeHistoricalTrendPoint,
  HomeNeedsAttention,
  HomePayload,
  HomeRecentTransaction,
  HomeSection,
  HomeSectionError,
  HomeThisMonth,
  HomeTopMerchant,
} from "@/lib/types";

const HISTORICAL_MONTHS = 8;
const RECENT_TXN_LIMIT = 8;
const TOP_MERCHANT_LIMIT = 6;
const CATEGORY_SNAPSHOT_LIMIT = 6;

function safe<T>(
  section: HomeSection,
  errors: HomeSectionError[],
  fn: () => T
): T | null {
  try {
    return fn();
  } catch (err) {
    errors.push({
      section,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const url = new URL(request.url);
  const periodMode = url.searchParams.get("mode") === "year" ? "year" : "month";
  const anchorMatch = /^(\d{4})-(\d{2})$/.exec(url.searchParams.get("anchor") ?? "");
  const now = new Date();
  const anchor = anchorMatch
    ? new Date(Number(anchorMatch[1]), Number(anchorMatch[2]) - 1, 1)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  const periodStart = periodMode === "year" ? new Date(year, 0, 1) : anchor;
  const periodEnd = periodMode === "year"
    ? new Date(year, 11, 31)
    : new Date(year, month + 1, 0);
  const from = toLocalISODate(periodStart);
  const to = toLocalISODate(periodEnd);
  const monthLabel = anchor.toLocaleDateString("he-IL", { month: "long" });
  const periodLabel = periodMode === "year"
    ? `שנת ${year} עד כה`
    : anchor.toLocaleDateString("he-IL", { month: "long", year: "numeric" });

  const totalDays = daysInMonth(year, month);
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const elapsedDays = isCurrentMonth
    ? Math.max(1, dayWithinMonth(now, year, month))
    : totalDays;
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const annualElapsed = Math.max(1, Math.floor((now.getTime() - yearStart.getTime()) / 86400000) + 1);
  const annualDays = Math.floor((yearEnd.getTime() - yearStart.getTime()) / 86400000) + 1;
  const timeElapsedPercent = periodMode === "year"
    ? Math.min(100, (annualElapsed / annualDays) * 100)
    : Math.min(100, (elapsedDays / totalDays) * 100);

  const paydayDay = Number(getWorkspaceSetting(workspaceId, "payday_day") ?? "1");
  const payday = nextPayday(now, paydayDay);
  const daysUntilPayday = Math.max(0, daysUntil(payday));

  const errors: HomeSectionError[] = [];

  const thisMonth = safe<HomeThisMonth>("thisMonth", errors, () => {
    const spent = getPeriodTotal(workspaceId, from, to);
    const monthlyTargetRaw = getWorkspaceSetting(workspaceId, "monthly_target");
    const parsed = monthlyTargetRaw != null ? Number(monthlyTargetRaw) : NaN;
    const monthlyBudget = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    const budget = periodMode === "year" ? monthlyBudget * (month + 1) : monthlyBudget;

    // Same window last month: from day 1 to today's day-of-month (clamped).
    const prevMonthStart = new Date(year, month - 1, 1);
    const prevElapsedDay = Math.min(
      elapsedDays,
      daysInMonth(prevMonthStart.getFullYear(), prevMonthStart.getMonth())
    );
    const prevMonthMtdEnd = new Date(
      prevMonthStart.getFullYear(),
      prevMonthStart.getMonth(),
      prevElapsedDay
    );
    const prevSpent = getPeriodTotal(
      workspaceId,
      toLocalISODate(prevMonthStart),
      toLocalISODate(prevMonthMtdEnd)
    );
    const deltaVsLastMonth = periodMode === "month" && prevSpent > 0
      ? ((spent - prevSpent) / prevSpent) * 100
      : null;

    const phrase = pacePhrase(spent, spent, budget, timeElapsedPercent, periodLabel);

    return {
      spent,
      budget,
      deltaVsLastMonth,
      pacePhrase: phrase,
      daysUntilPayday,
      timeElapsedPercent,
      monthLabel,
      periodMode,
      periodLabel,
    };
  });

  const cashFlow = safe<HomeCashFlow>("cashFlow", errors, () =>
    getCashFlow(workspaceId, from, to)
  );

  const categorySnapshot = safe<HomeCategorySnapshotItem[]>(
    "categorySnapshot",
    errors,
    () => getCategorySnapshot(
      workspaceId,
      from,
      to,
      CATEGORY_SNAPSHOT_LIMIT,
      periodMode === "year" ? month + 1 : 1
    )
  );

  const historicalTrend = safe<HomeHistoricalTrendPoint[]>(
    "historicalTrend",
    errors,
    () => getHistoricalTrend(workspaceId, HISTORICAL_MONTHS)
  );

  const recentTransactions = safe<HomeRecentTransaction[]>(
    "recentTransactions",
    errors,
    () => getRecentTransactionsForHome(workspaceId, RECENT_TXN_LIMIT)
  );

  const topMerchants = safe<HomeTopMerchant[]>("topMerchants", errors, () => {
    const rows = getTopMerchants(workspaceId, from, to, TOP_MERCHANT_LIMIT);
    return rows.map((m) => ({
      name: m.name,
      total: m.amount,
      count: m.count,
    }));
  });

  const needsAttention = safe<HomeNeedsAttention>(
    "needsAttention",
    errors,
    () => getNeedsAttentionCounts(workspaceId)
  );

  const bankHealth = safe<HomeBankHealthItem[]>("bankHealth", errors, () =>
    getBankHealth(workspaceId)
  );

  const payload: HomePayload = {
    thisMonth,
    cashFlow,
    categorySnapshot,
    historicalTrend,
    recentTransactions,
    topMerchants,
    needsAttention,
    bankHealth,
    nextScheduledSync: getNextRunAt(),
    errors,
  };

  return NextResponse.json(payload);
}
