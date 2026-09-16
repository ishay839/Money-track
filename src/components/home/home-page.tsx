"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getActivity, getHome } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/app-shell";
import { SyncButton } from "@/components/dashboard/sync-button";
import { CategorizeButton } from "@/components/dashboard/categorize-button";
import { AINotConnectedBanner } from "@/components/ai-not-connected-banner";
import { ThisMonthCard } from "./this-month-card";
import { CashFlowCard } from "./cash-flow-card";
import { CategorySnapshotCard } from "./category-snapshot-card";
import { HistoricalTrendCard } from "./historical-trend-card";
import { RecentTransactionsCard } from "./recent-transactions-card";
import { TopMerchantsCard } from "./top-merchants-card";
import { NeedsAttentionCard } from "./needs-attention-card";
import { SearchCard } from "./search-card";
import { BankHealthCard } from "./bank-health-card";
import { IncomeExpenseCard } from "./income-expense-card";
import { ThisMonthIncomeCard } from "./this-month-income-card";
import { SyncStatusPill } from "./sync-status-pill";
import { SyncFailureBanner } from "./sync-failure-banner";
import { CardError, CardSkeleton } from "./card-shell";
import type { HomePayload, HomeSection } from "@/lib/types";

// Expenses and income get equal width; the cash-flow summary sits beside them.
const ROW_1 = "col-span-12 md:col-span-6 lg:col-span-4";
const ROW_1_SIDE = "col-span-12 md:col-span-12 lg:col-span-4";
const ROW_2 = "col-span-12 md:col-span-6 lg:col-span-7";
const ROW_2_SIDE = "col-span-12 md:col-span-6 lg:col-span-5";
// Last row splits evenly so nothing is left stranded beside empty space.
const ROW_3 = "col-span-12 md:col-span-6 lg:col-span-4";

export function HomePage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [autoStartSync] = useState(() => searchParams.get("sync") === "1");
  const today = useMemo(() => new Date(), []);
  const [periodMode, setPeriodMode] = useState<"month" | "year">("month");
  const [anchor, setAnchor] = useState(
    () => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
  );
  const t = useTranslations("home");
  const skeletonLabels = useMemo<Record<HomeSection, string>>(
    () => ({
      thisMonth: t("thisMonthLabel", { month: "" }).trim() || t("topCategoriesTitle"),
      cashFlow: t("cashFlowTitle"),
      categorySnapshot: t("topCategoriesTitle"),
      historicalTrend: t("last8Months"),
      recentTransactions: t("recentActivity"),
      topMerchants: t("topMerchants"),
      needsAttention: t("needsAttention"),
      bankHealth: t("bankConnections"),
    }),
    [t]
  );

  useEffect(() => {
    if (autoStartSync) {
      router.replace("/", { scroll: false });
    }
  }, [autoStartSync, router]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["home", periodMode, anchor],
    queryFn: () => getHome(periodMode, anchor),
  });

  const [activityPopoverOpen, setActivityPopoverOpen] = useState(false);
  const { data: activity } = useQuery({
    queryKey: ["activity"],
    queryFn: getActivity,
    refetchInterval: (q) => {
      const a = q.state.data;
      if (activityPopoverOpen) return 3000;
      if (a?.sync.active) return 3000;
      return 15000;
    },
    refetchIntervalInBackground: false,
  });

  const handleActivityOpenChange = useCallback(
    (open: boolean) => {
      setActivityPopoverOpen(open);
      if (open) queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
    [queryClient]
  );

  const handleSyncOrCategorizeComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["home"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    queryClient.invalidateQueries({ queryKey: ["activity"] });
  }, [queryClient]);

  return (
    <>
      <PageHeader
        title={t("pageTitle")}
        actions={
          <>
            <SyncStatusPill
              items={data?.bankHealth ?? null}
              nextScheduledSync={data?.nextScheduledSync ?? null}
              activity={activity ?? null}
              onOpenChange={handleActivityOpenChange}
            />
            <CategorizeButton onApplied={handleSyncOrCategorizeComplete} />
            <SyncButton
              onComplete={handleSyncOrCategorizeComplete}
              autoStart={autoStartSync}
            />
          </>
        }
      />

      <div className="p-4 md:p-6 lg:p-8">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="inline-flex h-11 items-center rounded-xl border border-border bg-card p-1" role="group" aria-label="טווח תצוגה">
            <button
              type="button"
              className={`h-9 rounded-lg px-5 text-base font-semibold transition-colors ${
                periodMode === "month"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              onClick={() => setPeriodMode("month")}
            >
              חודשי
            </button>
            <button
              type="button"
              className={`h-9 rounded-lg px-5 text-base font-semibold transition-colors ${
                periodMode === "year"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              onClick={() => setPeriodMode("year")}
            >
              שנתי מצטבר
            </button>
          </div>
          <SearchCard />
          <PeriodPicker anchor={anchor} mode={periodMode} onChange={setAnchor} />
        </div>
        <SyncFailureBanner
          items={data?.bankHealth ?? null}
          className="mb-4 md:mb-5 lg:mb-6"
        />
        <AINotConnectedBanner className="mb-4 md:mb-5 lg:mb-6" />
        <div className="grid grid-cols-12 gap-4 md:gap-5 lg:gap-6">
          {renderSection("needsAttention", data, isLoading, isError, "col-span-12", skeletonLabels)}
          {renderSection("thisMonth", data, isLoading, isError, ROW_1, skeletonLabels)}
          <div className={ROW_1}>
            {data?.cashFlow && data?.thisMonth ? (
              <ThisMonthIncomeCard
                cashFlow={data.cashFlow}
                thisMonth={data.thisMonth}
              />
            ) : (
              <CardSkeleton label="הכנסות" height={180} />
            )}
          </div>
          {renderSection("cashFlow", data, isLoading, isError, ROW_1_SIDE, skeletonLabels)}
          {renderSection("categorySnapshot", data, isLoading, isError, ROW_2, skeletonLabels)}
          {renderSection("historicalTrend", data, isLoading, isError, ROW_2_SIDE, skeletonLabels)}
          {renderSection("recentTransactions", data, isLoading, isError, ROW_2, skeletonLabels)}
          {renderSection("topMerchants", data, isLoading, isError, ROW_2_SIDE, skeletonLabels)}
          <div className="col-span-12">
            <IncomeExpenseCard />
          </div>
          {renderSection("bankHealth", data, isLoading, isError, "col-span-12", skeletonLabels)}
        </div>
      </div>
    </>
  );
}

function PeriodPicker({
  anchor,
  mode,
  onChange,
}: {
  anchor: string;
  mode: "month" | "year";
  onChange: (value: string) => void;
}) {
  const [year, month] = anchor.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  const label = mode === "year"
    ? String(year)
    : date.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
  const move = (step: number) => {
    const next = mode === "year"
      ? new Date(year + step, month - 1, 1)
      : new Date(year, month - 1 + step, 1);
    onChange(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  };
  return (
    <div className="inline-flex h-11 items-center gap-1 rounded-xl border border-border bg-card px-1">
      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={() => move(1)} aria-label="לתקופה הבאה">
        <ChevronRight className="h-5 w-5" />
      </Button>
      <div className="min-w-40 text-center text-base font-bold">{label}</div>
      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={() => move(-1)} aria-label="לתקופה הקודמת">
        <ChevronLeft className="h-5 w-5" />
      </Button>
    </div>
  );
}

function renderSection(
  section: HomeSection,
  data: HomePayload | undefined,
  isLoading: boolean,
  isError: boolean,
  spanClass: string,
  skeletonLabels: Record<HomeSection, string>
) {
  if (isLoading || !data) {
    return (
      <div key={section} className={spanClass}>
        <CardSkeleton label={skeletonLabels[section]} height={SKELETON_HEIGHTS[section]} />
      </div>
    );
  }

  const sectionHasError =
    isError || data.errors.some((e) => e.section === section);

  if (sectionHasError) {
    return (
      <div key={section} className={spanClass}>
        <CardError label={skeletonLabels[section]} />
      </div>
    );
  }

  return (
    <div key={section} className={spanClass}>
      {renderCard(section, data)}
    </div>
  );
}

function renderCard(section: HomeSection, data: HomePayload) {
  switch (section) {
    case "thisMonth":
      return data.thisMonth ? <ThisMonthCard data={data.thisMonth} /> : null;
    case "cashFlow":
      return data.cashFlow ? <CashFlowCard data={data.cashFlow} /> : null;
    case "categorySnapshot":
      return data.categorySnapshot ? (
        <CategorySnapshotCard items={data.categorySnapshot} />
      ) : null;
    case "historicalTrend":
      return data.historicalTrend ? (
        <HistoricalTrendCard data={data.historicalTrend} />
      ) : null;
    case "recentTransactions":
      return data.recentTransactions ? (
        <RecentTransactionsCard items={data.recentTransactions} />
      ) : null;
    case "topMerchants":
      return data.topMerchants ? (
        <TopMerchantsCard items={data.topMerchants} />
      ) : null;
    case "needsAttention":
      return data.needsAttention ? (
        <NeedsAttentionCard data={data.needsAttention} />
      ) : null;
    case "bankHealth":
      return data.bankHealth ? (
        <BankHealthCard items={data.bankHealth} />
      ) : null;
  }
}

const SKELETON_HEIGHTS: Record<HomeSection, number> = {
  thisMonth: 180,
  cashFlow: 160,
  categorySnapshot: 220,
  historicalTrend: 180,
  recentTransactions: 280,
  topMerchants: 220,
  needsAttention: 160,
  bankHealth: 160,
};
