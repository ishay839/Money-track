"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { CircleAlert, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { AddTransactionDialog } from "@/components/transactions/add-transaction-dialog";
import { TransactionsTable } from "@/components/dashboard/transactions-table";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { AINotConnectedBanner } from "@/components/ai-not-connected-banner";
import { KpiCards } from "./kpi-cards";
import { WidgetsRow } from "./widgets-row";
import {
  getCategories,
  getLatestTransactionDate,
  getTransactions,
  getTransactionsSummary,
} from "@/lib/api";
import type { TransactionKindFilter } from "@/lib/api";
import {
  addMonths,
  formatMonthLabel,
  getMonthRange,
} from "@/lib/formatters";
import type { Locale } from "@/i18n/routing";
import { useSelectedMonth, isCurrentMonth } from "@/lib/selected-month";

export function TransactionsPage() {
  const t = useTranslations("transactions");
  const locale = useLocale() as Locale;
  const searchParams = useSearchParams();
  const { selectedDate, setSelectedDate } = useSelectedMonth();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | undefined>();
  const [page, setPage] = useState(0);
  const [kind, setKind] = useState<TransactionKindFilter>("all");
  const [reviewOnly, setReviewOnly] = useState(() => searchParams.get("review") === "1");
  // Card settlements and bank-to-bank moves are hidden by default: the card's
  // own transactions are already listed, so the settlement looks like a double.
  const [showTransfers, setShowTransfers] = useState(false);
  const [adding, setAdding] = useState(false);
  const [sort, setSort] = useState("date");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  // Clicking the active column flips direction; a new column starts descending,
  // which is what you want first for both dates and amounts.
  const handleSortChange = (column: string) => {
    if (column === sort) {
      setOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setSort(column);
      setOrder("desc");
    }
    setPage(0);
  };

  const latestDateQuery = useQuery({
    queryKey: ["transactions-latest-date"],
    queryFn: getLatestTransactionDate,
  });
  const latestDate = latestDateQuery.data?.latestDate;
  const effectiveDate =
    selectedDate ??
    (latestDate ? new Date(`${latestDate.slice(0, 10)}T12:00:00`) : new Date());

  const filterOptions: { value: TransactionKindFilter; label: string }[] = [
    { value: "all", label: t("filterAll") },
    { value: "income", label: t("filterIncome") },
    { value: "expense", label: t("filterExpenses") },
  ];

  const { from, to } = getMonthRange(effectiveDate);

  const allCategoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
  });
  const expandedFilter = (() => {
    if (categoryFilter === undefined) {
      return { category: undefined, categoryIds: undefined };
    }
    const all = allCategoriesQuery.data ?? [];
    const childIds = all
      .filter((c) => c.parentId === categoryFilter)
      .map((c) => c.id);
    if (childIds.length > 0) {
      return { category: undefined, categoryIds: [categoryFilter, ...childIds] };
    }
    return { category: categoryFilter, categoryIds: undefined };
  })();

  const transactionsQuery = useQuery({
    queryKey: [
      "transactions",
      from,
      to,
      search,
      categoryFilter,
      page,
      kind,
      reviewOnly,
      showTransfers,
      sort,
      order,
    ],
    queryFn: () =>
      getTransactions({
        // A search is a question about all of history ("when did I pay X?"),
        // so it deliberately ignores the month being viewed. Same for the
        // review queue, which is a backlog rather than a period.
        from: reviewOnly || search ? undefined : from,
        to: reviewOnly || search ? undefined : to,
        search: search || undefined,
        category: expandedFilter.category,
        categoryIds: expandedFilter.categoryIds,
        limit: 50,
        offset: page * 50,
        kind,
        needsReview: reviewOnly || undefined,
        includeTransfers: showTransfers || undefined,
        sort,
        order,
      }),
  });

  const summaryQuery = useQuery({
    queryKey: ["transactions-summary", from, to],
    queryFn: () => getTransactionsSummary({ from, to }),
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories", kind === "income" ? "income" : "expense"],
    queryFn: () =>
      kind === "income" ? getCategories("income") : getCategories("expense"),
  });

  const monthLabel = formatMonthLabel(effectiveDate, locale);

  return (
    <>
      <PageHeader
        title={t("pageTitle")}
        meta={monthLabel}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setAdding(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              תנועה ידנית
            </Button>
            <PeriodSelector
              label={monthLabel}
              isCurrent={isCurrentMonth(effectiveDate)}
              onCurrent={() => setSelectedDate(null)}
              onPrev={() => setSelectedDate(addMonths(effectiveDate, -1))}
              onNext={() => setSelectedDate(addMonths(effectiveDate, 1))}
            />
          </div>
        }
      />

      <div className="space-y-6 p-4 md:p-6 lg:p-8">
        <AINotConnectedBanner />
        <KpiCards summary={summaryQuery.data} loading={summaryQuery.isLoading} />

        <WidgetsRow
          summary={summaryQuery.data}
          loading={summaryQuery.isLoading}
          onReview={() => {
            setReviewOnly(true);
            setPage(0);
          }}
        />

        <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border bg-card p-1 w-fit">
          {filterOptions.map((opt) => {
            const active = kind === opt.value && !reviewOnly;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setKind(opt.value);
                  setReviewOnly(false);
                  setPage(0);
                  setCategoryFilter(undefined);
                }}
                className={
                  active
                    ? "rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors"
                    : "rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                }
              >
                {opt.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setReviewOnly(true);
              setKind("all");
              setCategoryFilter(undefined);
              setPage(0);
            }}
            className={
              reviewOnly
                ? "inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors"
                : "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            }
          >
            <CircleAlert className="h-3.5 w-3.5" />
            {t("filterNeedsReview")}
          </button>
        </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-muted-foreground">
            <input
              type="checkbox"
              checked={showTransfers}
              onChange={(e) => {
                setShowTransfers(e.target.checked);
                setPage(0);
              }}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            הצגת העברות פנימיות
            <span
              className="text-muted-foreground/70"
              title="חיובי כרטיס אשראי והעברות בין החשבונות שלך. העסקאות עצמן כבר מופיעות מהכרטיס, לכן הן מוסתרות כברירת מחדל."
            >
              (?)
            </span>
          </label>
        </div>

        <TransactionsTable
          transactions={transactionsQuery.data?.transactions ?? []}
          total={transactionsQuery.data?.total ?? 0}
          categories={categoriesQuery.data ?? []}
          loading={transactionsQuery.isLoading}
          search={search}
          onSearchChange={setSearch}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          sort={sort}
          order={order}
          onSortChange={handleSortChange}
          page={page}
          onPageChange={setPage}
        />
      </div>
      <AddTransactionDialog open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
