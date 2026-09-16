"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryPicker } from "@/components/dashboard/category-picker";
import { offsetSection } from "@/lib/category-offset";
import { TransactionNote } from "@/components/dashboard/transaction-note";
import {
  getCategories,
  getIncomeCategoryHistory,
  getIncomeSummary,
  getTransactions,
  updateTransactionCategory,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import type { Category } from "@/lib/types";

/**
 * Drill-down for one income category: the month it is showing, that month's
 * receipts, and a category picker on each row so a misfiled payment can be
 * moved without leaving the sheet. Mirrors the expense detail sheet.
 */
export function IncomeDetailSheet({
  categoryId,
  from,
  onClose,
}: {
  categoryId: number | null;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const open = categoryId !== null;
  const [month, setMonth] = useState(() => from.slice(0, 7));

  useEffect(() => {
    if (open) setMonth(from.slice(0, 7));
  }, [open, from, categoryId]);

  const range = useMemo(() => monthRange(month), [month]);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full p-0 sm:max-w-xl! md:max-w-2xl! lg:max-w-[35vw]!"
      >
        {categoryId != null && (
          <Body
            categoryId={categoryId}
            month={month}
            onMonthChange={setMonth}
            range={range}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Body({
  categoryId,
  month,
  onMonthChange,
  range,
}: {
  categoryId: number;
  month: string;
  onMonthChange: (m: string) => void;
  range: { from: string; to: string };
}) {
  const tCat = useTranslations("categoriesSeeded");
  const queryClient = useQueryClient();

  const summaryQuery = useQuery({
    queryKey: ["income-summary", range.from, range.to],
    queryFn: () => getIncomeSummary(range),
  });
  const txnQuery = useQuery({
    queryKey: ["transactions", "income-cat", categoryId, range.from, range.to],
    queryFn: () =>
      getTransactions({
        from: range.from,
        to: range.to,
        category: categoryId,
        kind: "income",
        limit: 100,
      }),
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories", "income"],
    queryFn: () => getCategories("income"),
  });
  // These rows are income; the offset target is always the expense side.
  const expenseCategoriesQuery = useQuery({
    queryKey: ["categories", "expense"],
    queryFn: () => getCategories("expense"),
  });

  // 12 months of this category, in one request.
  const historyQuery = useQuery({
    queryKey: ["income-history", categoryId, month],
    queryFn: () => getIncomeCategoryHistory(categoryId, range),
  });

  const row = summaryQuery.data?.categories.find(
    (c) => c.categoryId === categoryId
  );
  const transactions = txnQuery.data?.transactions ?? [];

  const buildOptions = (all: Category[]) => {
    const roots = all.filter((c) => c.parentId == null);
    const out: Array<{ category: Category; depth: number }> = [];
    for (const root of roots) {
      out.push({ category: root, depth: 0 });
      for (const child of all.filter((c) => c.parentId === root.id)) {
        out.push({ category: child, depth: 1 });
      }
    }
    for (const c of all) {
      if (!out.some((o) => o.category.id === c.id)) {
        out.push({ category: c, depth: 0 });
      }
    }
    return out;
  };

  const pickerOptions = useMemo(
    () => buildOptions(categoriesQuery.data ?? []),
    [categoriesQuery.data]
  );
  const offset = useMemo(
    () => offsetSection("income", buildOptions(expenseCategoriesQuery.data ?? [])),
    [expenseCategoriesQuery.data]
  );

  const handleChangeCategory = async (id: number, newCategoryId: number) => {
    await updateTransactionCategory(id, newCategoryId);
    for (const key of [
      "income-summary",
      "income-history",
      "transactions",
      "summary",
      "home",
    ]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const name = row ? translateCategoryName(row.name, tCat) : "";
  const history = historyQuery.data?.history ?? [];
  const max = Math.max(...history.map((h) => h.amount), 1);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <SheetHeader
        className="gap-3 p-6 pb-5"
        style={{
          background: row
            ? `color-mix(in oklch, ${row.color} 16%, var(--card))`
            : undefined,
        }}
      >
        <div className="min-w-0">
          <div className="card-label">קטגוריית הכנסה</div>
          <SheetTitle className="truncate text-xl font-bold tracking-tight">
            {name || "טוען..."}
          </SheetTitle>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <Stat
            label="התקבל"
            value={row ? formatCurrency(row.received) : "—"}
            tone="var(--status-on-track)"
          />
          <Stat
            label="חודש קודם"
            value={row ? formatCurrency(row.previous) : "—"}
          />
          <Stat label="תקבולים" value={row ? String(row.count) : "—"} />
        </div>
      </SheetHeader>

      <div className="space-y-5 p-6 pt-3">
        <div className="surface p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="card-label">לפי חודשים</h3>
            <MonthStepper month={month} onChange={onMonthChange} />
          </div>
          {historyQuery.isLoading ? (
            <Skeleton className="h-32 w-full rounded-lg" />
          ) : (
            <>
              <div className="flex h-32 items-end gap-1.5" dir="ltr">
                {history.map((h) => (
                  <button
                    key={h.month}
                    type="button"
                    onClick={() => onMonthChange(h.month)}
                    title={`${h.month}: ${formatCurrency(h.amount)}`}
                    className="flex h-full flex-1 cursor-pointer flex-col justify-end outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className="w-full rounded-t-sm transition-all"
                      style={{
                        height: `${Math.max(2, (h.amount / max) * 100)}%`,
                        backgroundColor: "var(--status-on-track)",
                        opacity: h.month === month ? 1 : 0.35,
                      }}
                    />
                  </button>
                ))}
              </div>
              <div className="mt-1.5 flex gap-1.5" dir="ltr">
                {history.map((h) => (
                  <span
                    key={h.month}
                    className={`flex-1 text-center text-[10px] tabular-nums ${
                      h.month === month
                        ? "font-bold text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {Number(h.month.split("-")[1])}
                  </span>
                ))}
              </div>
            </>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            לחיצה על עמודה עוברת לאותו חודש.
          </p>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">
            תקבולים · {transactions.length}
          </h3>
          <div className="surface overflow-hidden">
            {txnQuery.isLoading ? (
              <div className="p-6">
                <Skeleton className="h-24 w-full" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                אין תקבולים בקטגוריה הזו בחודש שנבחר.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {transactions.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-[15px] font-semibold">
                        {t.description}
                      </div>
                      <div className="text-sm text-muted-foreground tabular-nums">
                        {formatDate(t.date)}
                      </div>
                      <TransactionNote id={t.id} note={t.userNote} />
                    </div>
                    <CategoryPicker
                      name={
                        t.categoryName
                          ? translateCategoryName(t.categoryName, tCat)
                          : "ללא קטגוריה"
                      }
                      color={t.categoryColor}
                      options={pickerOptions}
                      offset={offset}
                      disabled={false}
                      onSelect={(cid) => handleChangeCategory(t.id, cid)}
                    />
                    <div
                      className="metric-sm shrink-0"
                      style={{ color: "var(--status-on-track)" }}
                    >
                      {formatCurrency(Math.abs(t.chargedAmount))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl bg-background/60 p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="metric-sm mt-0.5" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
}

function addMonth(month: string, step: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + step, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function MonthStepper({
  month,
  onChange,
}: {
  month: string;
  onChange: (m: string) => void;
}) {
  const [y, m] = month.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString("he-IL", {
    month: "long",
    year: "numeric",
  });
  const thisMonth = `${new Date().getFullYear()}-${String(
    new Date().getMonth() + 1
  ).padStart(2, "0")}`;
  return (
    <div className="inline-flex h-8 items-center gap-0.5 rounded-lg border border-border bg-card px-1">
      <button
        type="button"
        onClick={() => onChange(addMonth(month, 1))}
        disabled={month >= thisMonth}
        aria-label="לחודש הבא"
        className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-accent disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <span className="min-w-24 text-center text-xs font-semibold">{label}</span>
      <button
        type="button"
        onClick={() => onChange(addMonth(month, -1))}
        aria-label="לחודש הקודם"
        className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
    </div>
  );
}
