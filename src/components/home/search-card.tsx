"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Check,
  MoreHorizontal,
  Pencil,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryPicker } from "@/components/dashboard/category-picker";
import { offsetSection } from "@/lib/category-offset";
import { TransactionNote } from "@/components/dashboard/transaction-note";
import {
  deleteTransaction,
  getCategories,
  getTransactions,
  updateTransactionAmount,
  updateTransactionCategory,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import type { Category, TransactionWithCategory } from "@/lib/types";

const LIMIT = 30;

/**
 * Free search over the whole ledger, sized to sit in the home header row
 * rather than take a card of its own.
 *
 * Deliberately ignores the month being viewed: a search is a question about
 * all of history ("when did I pay for the dentist?"), not about the current
 * period. Results are fully editable in place - the point of finding a
 * transaction here is usually to fix it, and bouncing to /transactions to
 * scroll for it again defeats that.
 */
export function SearchCard() {
  const t = useTranslations("home");
  const tCat = useTranslations("categoriesSeeded");
  const queryClient = useQueryClient();

  const [term, setTerm] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingAmountId, setEditingAmountId] = useState<number | null>(null);
  const [amountDraft, setAmountDraft] = useState("");

  // Only fires on submit: typing a merchant name should not hammer the
  // database on every keystroke.
  const [submitted, setSubmitted] = useState<{
    search?: string;
    from?: string;
    to?: string;
    minAmount?: number;
    maxAmount?: number;
  } | null>(null);

  const hasInput =
    term.trim() !== "" || from !== "" || to !== "" || min !== "" || max !== "";
  const activeFilters =
    (from ? 1 : 0) + (to ? 1 : 0) + (min ? 1 : 0) + (max ? 1 : 0);

  const { data, isFetching } = useQuery({
    queryKey: ["home-search", submitted],
    queryFn: () =>
      getTransactions({
        ...submitted,
        limit: LIMIT,
        includeTransfers: true,
        sort: "date",
        order: "desc",
      }),
    enabled: submitted !== null,
  });

  const expenseCategories = useQuery({
    queryKey: ["categories", "expense"],
    queryFn: () => getCategories("expense"),
    enabled: submitted !== null,
  });
  const incomeCategories = useQuery({
    queryKey: ["categories", "income"],
    queryFn: () => getCategories("income"),
    enabled: submitted !== null,
  });

  // Parents first with their children indented, matching the transactions page.
  const optionsFor = useMemo(() => {
    const build = (list: Category[]) => {
      const byParent = new Map<number, Category[]>();
      for (const c of list) {
        if (c.parentId == null) continue;
        const kids = byParent.get(c.parentId) ?? [];
        kids.push(c);
        byParent.set(c.parentId, kids);
      }
      const out: Array<{ category: Category; depth: number }> = [];
      for (const top of list
        .filter((c) => c.parentId == null)
        .sort((a, b) => a.name.localeCompare(b.name, "he"))) {
        out.push({ category: top, depth: 0 });
        for (const kid of (byParent.get(top.id) ?? []).sort((a, b) =>
          a.name.localeCompare(b.name, "he")
        )) {
          out.push({ category: kid, depth: 1 });
        }
      }
      return out;
    };
    return {
      expense: build(expenseCategories.data ?? []),
      income: build(incomeCategories.data ?? []),
    };
  }, [expenseCategories.data, incomeCategories.data]);

  const refresh = async () => {
    await Promise.all(
      [
        "home-search",
        "transactions",
        "transactions-summary",
        "summary",
        "home",
        "category-detail",
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))
    );
  };

  const run = () => {
    if (!hasInput) return;
    setSubmitted({
      search: term.trim() || undefined,
      from: from || undefined,
      to: to || undefined,
      minAmount: min === "" ? undefined : Number(min),
      maxAmount: max === "" ? undefined : Number(max),
    });
  };

  const clear = () => {
    setTerm("");
    setFrom("");
    setTo("");
    setMin("");
    setMax("");
    setSubmitted(null);
    setShowFilters(false);
  };

  const changeCategory = async (id: number, categoryId: number) => {
    setBusyId(id);
    try {
      await updateTransactionCategory(id, categoryId);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "עדכון הסיווג נכשל");
    } finally {
      setBusyId(null);
    }
  };

  const saveAmount = async (txn: TransactionWithCategory) => {
    const parsed = Number(amountDraft);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("יש להזין סכום תקין");
      return;
    }
    setBusyId(txn.id);
    try {
      // Keep the original direction: the field edits magnitude, not sign.
      const signed =
        txn.chargedAmount < 0 ? -Math.abs(parsed) : Math.abs(parsed);
      await updateTransactionAmount(txn.id, signed);
      await refresh();
      setEditingAmountId(null);
      toast.success("הסכום עודכן");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "עדכון הסכום נכשל");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (txn: TransactionWithCategory) => {
    if (
      !window.confirm(
        `למחוק את התנועה "${txn.description}"? היא לא תחזור בסנכרון הבא.`
      )
    ) {
      return;
    }
    setBusyId(txn.id);
    try {
      await deleteTransaction(txn.id);
      await refresh();
      toast.success("התנועה נמחקה");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "מחיקת התנועה נכשלה");
    } finally {
      setBusyId(null);
    }
  };

  const rows = data?.transactions ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="relative min-w-0 flex-1">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="flex items-center gap-2"
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchTitle")}
            className="h-11 ps-9 text-base"
          />
        </div>
        <Button
          type="button"
          variant={showFilters || activeFilters > 0 ? "default" : "outline"}
          className="h-11 shrink-0 gap-1.5"
          onClick={() => setShowFilters((v) => !v)}
          aria-label={t("searchFilters")}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeFilters > 0 && (
            <span className="tabular-nums">{activeFilters}</span>
          )}
        </Button>
        <Button type="submit" className="h-11 shrink-0" disabled={!hasInput}>
          {t("searchAction")}
        </Button>
        {(submitted || hasInput) && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={clear}
            aria-label={t("searchClear")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </form>

      {/* Filters and results float over the dashboard rather than pushing it
          down, so the header keeps its single-row height. */}
      {(showFilters || submitted) && (
        <div className="absolute inset-x-0 top-full z-40 mt-2 rounded-xl border border-border bg-card p-3 shadow-lg">
          {showFilters && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-muted-foreground">
                  {t("searchDateRange")}
                </span>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    aria-label={t("searchDateFrom")}
                    className="h-10"
                  />
                  <Input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    aria-label={t("searchDateTo")}
                    className="h-10"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-muted-foreground">
                  {t("searchAmountRange")}
                </span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    value={min}
                    onChange={(e) => setMin(e.target.value)}
                    placeholder={t("searchAmountMin")}
                    className="h-10 tabular-nums"
                  />
                  <Input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    value={max}
                    onChange={(e) => setMax(e.target.value)}
                    placeholder={t("searchAmountMax")}
                    className="h-10 tabular-nums"
                  />
                </div>
              </div>
            </div>
          )}

          {submitted && (
            <div className={showFilters ? "mt-3 border-t border-border pt-3" : ""}>
              {isFetching ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("searchSearching")}
                </p>
              ) : rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("searchNoResults")}
                </p>
              ) : (
                <>
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {t("searchResults", { count: total })}
                    </span>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {t("searchSum")}{" "}
                      {formatCurrency(
                        rows.reduce((s, r) => s + Math.abs(r.chargedAmount), 0)
                      )}
                      {total > rows.length
                        ? ` · ${t("searchShowingFirst", { count: rows.length })}`
                        : ""}
                    </span>
                  </div>

                  <ul className="max-h-[26rem] divide-y divide-border overflow-y-auto">
                    {rows.map((txn) => {
                      const isIncome = txn.chargedAmount > 0;
                      const options = isIncome
                        ? optionsFor.income
                        : optionsFor.expense;
                      return (
                        <li
                          key={txn.id}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5"
                        >
                          <span className="w-20 shrink-0 text-sm text-muted-foreground tabular-nums">
                            {formatDate(txn.date)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[15px] font-semibold">
                              {txn.description}
                            </div>
                            <TransactionNote id={txn.id} note={txn.userNote} />
                          </div>

                          <CategoryPicker
                            name={
                              txn.categoryName
                                ? translateCategoryName(txn.categoryName, tCat)
                                : "ללא קטגוריה"
                            }
                            color={txn.categoryColor}
                            options={options}
                            offset={offsetSection(
                              isIncome ? "income" : "expense",
                              isIncome ? optionsFor.expense : optionsFor.income
                            )}
                            disabled={busyId === txn.id}
                            onSelect={(cid) => void changeCategory(txn.id, cid)}
                          />

                          {editingAmountId === txn.id ? (
                            <form
                              className="flex shrink-0 items-center gap-1"
                              onSubmit={(e) => {
                                e.preventDefault();
                                void saveAmount(txn);
                              }}
                            >
                              <input
                                autoFocus
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                aria-label={`עריכת סכום ${txn.description}`}
                                value={amountDraft}
                                onChange={(e) => setAmountDraft(e.target.value)}
                                className="h-8 w-24 rounded-md border bg-background px-2 text-sm tabular-nums"
                              />
                              <button
                                type="submit"
                                disabled={busyId === txn.id}
                                title="שמירת סכום"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingAmountId(null)}
                                title="ביטול"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </form>
                          ) : (
                            <span
                              className="shrink-0 text-[15px] font-bold tabular-nums"
                              style={{
                                color: isIncome
                                  ? "var(--status-on-track)"
                                  : "var(--foreground)",
                              }}
                            >
                              {isIncome ? "+" : "−"}
                              {formatCurrency(txn.chargedAmount)}
                            </span>
                          )}

                          <DropdownMenu>
                            <DropdownMenuTrigger
                              disabled={busyId === txn.id}
                              aria-label={`פעולות על ${txn.description}`}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setAmountDraft(
                                    String(Math.abs(txn.chargedAmount))
                                  );
                                  setEditingAmountId(txn.id);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                                עריכת סכום
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => void remove(txn)}
                              >
                                <Trash2 className="h-4 w-4" />
                                מחיקת תנועה
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-2 flex items-center justify-between">
                    <Link
                      href="/transactions"
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      {t("searchOpenTransactions")}
                    </Link>
                    <button
                      type="button"
                      onClick={clear}
                      className="text-sm font-medium text-muted-foreground hover:text-foreground"
                    >
                      {t("searchClear")}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
