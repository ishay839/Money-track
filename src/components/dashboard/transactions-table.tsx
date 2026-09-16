"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  MoreHorizontal,
  HelpCircle,
  Check,
  ArrowDownRight,
  ArrowUpRight,
  TrendingUp,
  Pencil,
  Trash2,
  X,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  updateTransactionCategory,
  setTransactionKind,
  approveTransactionCategory,
  getCategories,
  getInvestments,
  assignTransactionToDefaultInvestment,
  assignTransactionToInvestment,
  updateTransactionAmount,
  deleteTransaction,
  bulkAssignCategory,
  bulkDeleteTransactions,
} from "@/lib/api";
import { translateCategoryName } from "@/lib/i18n-data";
import { TransactionNote } from "@/components/dashboard/transaction-note";
import { CategoryPicker } from "@/components/dashboard/category-picker";
import { offsetSection } from "@/lib/category-offset";
import { MerchantDetailSheet } from "@/components/dashboard/merchant-detail-sheet";
import {
  RetroRuleDialog,
  type RetroTarget,
} from "@/components/dashboard/retro-rule-dialog";
import { merchantKeyOf } from "@/lib/merchant-key";
import type { TransactionWithCategory, Category } from "@/lib/types";
import type { Locale } from "@/i18n/routing";

type Kind = "expense" | "income" | "transfer";

interface TransactionsTableProps {
  transactions: TransactionWithCategory[];
  total: number;
  categories: Category[];
  loading: boolean;
  search: string;
  onSearchChange: (search: string) => void;
  categoryFilter: number | undefined;
  onCategoryFilterChange: (category: number | undefined) => void;
  sort: string;
  order: "asc" | "desc";
  onSortChange: (column: string) => void;
  page: number;
  onPageChange: (page: number) => void;
}

const PAGE_SIZE = 50;

export function TransactionsTable({
  transactions,
  total,
  categories,
  loading,
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  sort,
  order,
  onSortChange,
  page,
  onPageChange,
}: TransactionsTableProps) {
  const t = useTranslations("transactions");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [merchantDetail, setMerchantDetail] = useState<string | null>(null);
  const [retroTarget, setRetroTarget] = useState<RetroTarget | null>(null);
  const [editingAmountId,setEditingAmountId] = useState<number|null>(null);
  const [amountDraft,setAmountDraft] = useState("");
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const otherKinds: Record<Kind, Array<{ value: Kind; label: string }>> = {
    expense: [
      { value: "income", label: t("markAsIncome") },
      { value: "transfer", label: t("markAsTransfer") },
    ],
    income: [
      { value: "expense", label: t("markAsExpense") },
      { value: "transfer", label: t("markAsTransfer") },
    ],
    transfer: [
      { value: "expense", label: t("markAsExpense") },
      { value: "income", label: t("markAsIncome") },
    ],
  };

  const handleCategoryChange = async (
    txnId: number,
    categoryId: number,
    remember: boolean
  ) => {
    setUpdatingId(txnId);
    try {
      const result = await updateTransactionCategory(txnId, categoryId, remember);
      // The rule covers future syncs; history is untouched until asked, so
      // offer that straight away while the decision is still in mind.
      if (remember && result.remembered) {
        const txn = transactions.find((t) => t.id === txnId);
        const category = lookupCategory(categoryId);
        if (txn && category) {
          setRetroTarget({
            description: txn.description,
            categoryId,
            categoryName: translateCategoryName(category.name, tCat),
            excludeId: txnId,
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["investments"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
      queryClient.invalidateQueries({ queryKey: ["home"] });
    } finally {
      setUpdatingId(null);
    }
  };

  /**
   * "הפוך לכלל" on a row that already has a category. Re-sends the same
   * category with remember set, which writes both the merchant memory and the
   * visible rule, then offers to apply it to history.
   */
  const handleMakeRule = async (txn: TransactionWithCategory) => {
    if (txn.categoryId == null) return;
    setUpdatingId(txn.id);
    try {
      const result = await updateTransactionCategory(
        txn.id,
        txn.categoryId,
        true
      );
      if (!result.remembered) {
        toast.error("יצירת הכלל נכשלה");
        return;
      }
      const category = lookupCategory(txn.categoryId);
      toast.success(
        category
          ? `נוצר כלל ל"${translateCategoryName(category.name, tCat)}"`
          : "הכלל נוצר"
      );
      queryClient.invalidateQueries({ queryKey: ["rules"] });
      // The row carries the covering rule from the server, so it has to be
      // refetched for the button to turn into the "כלל פעיל" label.
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      if (category) {
        setRetroTarget({
          description: txn.description,
          categoryId: txn.categoryId,
          categoryName: translateCategoryName(category.name, tCat),
          excludeId: txn.id,
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "יצירת הכלל נכשלה");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleKindChange = async (txnId: number, next: Kind) => {
    setUpdatingId(txnId);
    try {
      await setTransactionKind(txnId, next);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleApprove = async (txnId: number, remember: boolean) => {
    setUpdatingId(txnId);
    try {
      const result = await approveTransactionCategory(txnId, remember);
      if (remember && result.remembered) {
        const txn = transactions.find((t) => t.id === txnId);
        const category = lookupCategory(txn?.categoryId ?? null);
        if (txn && category) {
          setRetroTarget({
            description: txn.description,
            categoryId: category.id,
            categoryName: translateCategoryName(category.name, tCat),
            excludeId: txnId,
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
    } finally {
      setUpdatingId(null);
    }
  };

  const incomeCategoriesQuery = useQuery({
    queryKey: ["categories", "income"],
    queryFn: () => getCategories("income"),
  });
  const expenseCategoriesQuery = useQuery({
    queryKey: ["categories", "expense"],
    queryFn: () => getCategories("expense"),
  });
  const investmentsQuery = useQuery({
    queryKey: ["investments", "assignment"],
    queryFn: () => getInvestments(),
  });

  const categoriesForKind = (rowKind: Kind): Category[] => {
    if (rowKind === "income") return incomeCategoriesQuery.data ?? [];
    if (rowKind === "expense") return expenseCategoriesQuery.data ?? [];
    return [];
  };

  /**
   * Finds a category by id across both sides. The `categories` prop is the
   * filter dropdown's list and may not hold the one just picked, so the
   * per-kind queries are consulted too.
   */
  const lookupCategory = (id: number | null): Category | undefined => {
    if (id == null) return undefined;
    return (
      categories.find((c) => c.id === id) ??
      incomeCategoriesQuery.data?.find((c) => c.id === id) ??
      expenseCategoriesQuery.data?.find((c) => c.id === id)
    );
  };

  const handleInvestmentAssignment = async (
    txnId: number,
    investmentId: number,
    role: "capital" | "expense" | "income"
  ) => {
    setUpdatingId(txnId);
    try {
      await assignTransactionToInvestment(txnId, investmentId, role);
      toast.success("התנועה שויכה להשקעה");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["investments"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["home"] }),
      ]);
    } catch {
      toast.error("שיוך התנועה להשקעה נכשל");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDefaultInvestmentAssignment = async (
    txnId: number,
    role: "capital" | "income"
  ) => {
    setUpdatingId(txnId);
    try {
      await assignTransactionToDefaultInvestment(txnId, role);
      toast.success("התנועה סומנה כהשקעה והוסרה מהתזרים השוטף");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["investments"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["home"] }),
      ]);
    } catch {
      toast.error("סימון התנועה כהשקעה נכשל");
    } finally {
      setUpdatingId(null);
    }
  };

  const refreshAfterManualChange = async () => {
    await Promise.all([
      queryClient.invalidateQueries({queryKey:["transactions"]}),
      queryClient.invalidateQueries({queryKey:["transactions-summary"]}),
      queryClient.invalidateQueries({queryKey:["summary"]}),
      queryClient.invalidateQueries({queryKey:["home"]}),
      queryClient.invalidateQueries({queryKey:["category-detail"]}),
      queryClient.invalidateQueries({queryKey:["investments"]}),
    ]);
  };

  const saveAmount = async (txn: TransactionWithCategory) => {
    const parsed = Number(amountDraft);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("יש להזין סכום תקין");
      return;
    }
    setUpdatingId(txn.id);
    try {
      const signed = txn.chargedAmount < 0 ? -Math.abs(parsed) : Math.abs(parsed);
      await updateTransactionAmount(txn.id,signed);
      await refreshAfterManualChange();
      setEditingAmountId(null);
      toast.success("הסכום עודכן");
    } catch (error) {
      toast.error(error instanceof Error?error.message:"עדכון הסכום נכשל");
    } finally {
      setUpdatingId(null);
    }
  };

  const removeTransaction = async (txn: TransactionWithCategory) => {
    if (!window.confirm(`למחוק את התנועה "${txn.description}"? היא לא תחזור בסנכרון הבא.`)) return;
    setUpdatingId(txn.id);
    try {
      await deleteTransaction(txn.id);
      await refreshAfterManualChange();
      toast.success("התנועה נמחקה");
    } catch (error) {
      toast.error(error instanceof Error?error.message:"מחיקת התנועה נכשלה");
    } finally {
      setUpdatingId(null);
    }
  };

  // --- bulk selection -------------------------------------------------
  // Ids rather than indexes: the list re-sorts and re-pages under the user,
  // and an index would then point at a different transaction than the one
  // they ticked.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const visibleIds = useMemo(
    () => transactions.map((txn) => txn.id),
    [transactions]
  );

  // Whatever leaves the view leaves the selection. Keeping off-screen rows
  // selected would let a later "delete" hit transactions the user can no
  // longer see.
  useEffect(() => {
    setSelectedIds((current) => {
      if (current.size === 0) return current;
      const visible = new Set(visibleIds);
      const next = new Set([...current].filter((id) => visible.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [visibleIds]);

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const toggleOne = (id: number) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const toggleAllVisible = () =>
    setSelectedIds((current) => {
      if (visibleIds.every((id) => current.has(id))) {
        const next = new Set(current);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      return new Set([...current, ...visibleIds]);
    });

  const selectedRows = transactions.filter((txn) => selectedIds.has(txn.id));
  // A category belongs to one side of the ledger, so a mixed selection has no
  // single valid list to offer.
  const selectionKind: Kind | null = (() => {
    if (selectedRows.length === 0) return null;
    const kinds = new Set(
      selectedRows.map((r) => (r.chargedAmount > 0 ? "income" : "expense"))
    );
    return kinds.size === 1 ? ([...kinds][0] as Kind) : null;
  })();

  const bulkCategorize = async (categoryId: number) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const { updated } = await bulkAssignCategory(ids, categoryId);
      await refreshAfterManualChange();
      setSelectedIds(new Set());
      toast.success(`סווגו ${updated} תנועות`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "הסיווג הקבוצתי נכשל");
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkRemove = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `למחוק ${ids.length} תנועות? הן לא יחזרו בסנכרון הבא.`
      )
    ) {
      return;
    }
    setBulkBusy(true);
    try {
      const { deleted } = await bulkDeleteTransactions(ids);
      await refreshAfterManualChange();
      setSelectedIds(new Set());
      toast.success(`נמחקו ${deleted} תנועות`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "המחיקה הקבוצתית נכשלה");
    } finally {
      setBulkBusy(false);
    }
  };

  const categoryOptionsForKind = (
    rowKind: Kind
  ): Array<{ category: Category; depth: number }> => {
    const available = categoriesForKind(rowKind);
    const childrenByParent = new Map<number, Category[]>();
    for (const category of available) {
      if (category.parentId == null) continue;
      const children = childrenByParent.get(category.parentId) ?? [];
      children.push(category);
      childrenByParent.set(category.parentId, children);
    }

    const result: Array<{ category: Category; depth: number }> = [];
    for (const top of available
      .filter((category) => category.parentId == null)
      .sort((a, b) => a.name.localeCompare(b.name))) {
      result.push({ category: top, depth: 0 });
      for (const child of (childrenByParent.get(top.id) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name)
      )) {
        result.push({ category: child, depth: 1 });
      }
    }
    return result;
  };

  /** The opposite side, so an income row can offset an expense and vice versa. */
  const offsetFor = (rowKind: Kind) => {
    if (rowKind !== "expense" && rowKind !== "income") return undefined;
    const other = rowKind === "income" ? "expense" : "income";
    return offsetSection(rowKind, categoryOptionsForKind(other));
  };

  return (
    <>
    <Card className="surface shadow-none">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-xl font-bold tracking-tight">
            {t("pageTitle")}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Input
              placeholder={t("search")}
              value={search}
              onChange={(e) => {
                onSearchChange(e.target.value);
                onPageChange(0);
              }}
              className="h-10 w-[220px] text-sm"
            />
            <Select
              value={categoryFilter ? String(categoryFilter) : "all"}
              onValueChange={(v) => {
                if (!v) return;
                onCategoryFilterChange(v === "all" ? undefined : Number(v));
                onPageChange(0);
              }}
            >
              <SelectTrigger className="h-10 w-[180px] text-sm">
                <SelectValue placeholder={t("allCategories")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allCategories")}</SelectItem>
                {(() => {
                  const parentIds = new Set(
                    categories
                      .map((c) => c.parentId)
                      .filter((p): p is number => p != null)
                  );
                  const childrenByParent = new Map<number, typeof categories>();
                  for (const c of categories) {
                    if (c.parentId != null) {
                      const list = childrenByParent.get(c.parentId) ?? [];
                      list.push(c);
                      childrenByParent.set(c.parentId, list);
                    }
                  }
                  const tops = categories
                    .filter((c) => c.parentId == null)
                    .sort((a, b) => a.name.localeCompare(b.name));
                  const nodes: React.ReactNode[] = [];
                  for (const top of tops) {
                    const kids = childrenByParent.get(top.id) ?? [];
                    const topName = translateCategoryName(top.name, tCat);
                    if (parentIds.has(top.id)) {
                      nodes.push(
                        <SelectItem key={top.id} value={String(top.id)}>
                          <div className="flex items-center gap-2 font-semibold">
                            <div
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: top.color }}
                            />
                            {topName}
                          </div>
                        </SelectItem>
                      );
                      for (const child of kids) {
                        nodes.push(
                          <SelectItem
                            key={child.id}
                            value={String(child.id)}
                          >
                            <div className="flex items-center gap-2 ps-3">
                              <div
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: child.color }}
                              />
                              {translateCategoryName(child.name, tCat)}
                            </div>
                          </SelectItem>
                        );
                      }
                    } else {
                      nodes.push(
                        <SelectItem key={top.id} value={String(top.id)}>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: top.color }}
                            />
                            {topName}
                          </div>
                        </SelectItem>
                      );
                    }
                  }
                  return nodes;
                })()}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {search || categoryFilter
              ? t("emptyWithFilters")
              : t("emptyNoData")}
          </div>
        ) : (
          <>
            {selectedIds.size > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                <span className="text-sm font-bold tabular-nums">
                  נבחרו {selectedIds.size}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  ניקוי הבחירה
                </button>

                <div className="ms-auto flex flex-wrap items-center gap-2">
                  {bulkBusy && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {selectionKind ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        disabled={bulkBusy}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold transition-colors hover:bg-accent disabled:opacity-50"
                      >
                        שיוך לקטגוריה
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                        {categoryOptionsForKind(selectionKind).map(
                          ({ category, depth }) => (
                            <DropdownMenuItem
                              key={category.id}
                              onClick={() => void bulkCategorize(category.id)}
                              className={depth ? "ps-7" : "font-semibold"}
                            >
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: category.color }}
                              />
                              {translateCategoryName(category.name, tCat)}
                            </DropdownMenuItem>
                          )
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span
                      className="text-sm text-muted-foreground"
                      title="הבחירה מכילה גם הכנסות וגם הוצאות, ולכל סוג יש רשימת קטגוריות משלו."
                    >
                      בחירה מעורבת — לא ניתן לסווג יחד
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bulkBusy}
                    onClick={() => void bulkRemove()}
                    className="h-9 gap-1.5 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    מחיקה
                  </Button>
                </div>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate =
                            !allVisibleSelected &&
                            visibleIds.some((id) => selectedIds.has(id));
                        }
                      }}
                      onChange={toggleAllVisible}
                      aria-label="בחירת כל התנועות בעמוד"
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                  </TableHead>
                  <TableHead className="w-[32px]" />
                  <TableHead className="w-[100px]">
                    <SortHeader
                      column="date"
                      label={t("headerDate")}
                      sort={sort}
                      order={order}
                      onSort={onSortChange}
                    />
                  </TableHead>
                  <TableHead>
                    <SortHeader
                      column="description"
                      label={t("headerDescription")}
                      sort={sort}
                      order={order}
                      onSort={onSortChange}
                    />
                  </TableHead>
                  <TableHead className="w-[120px] text-start">
                    <SortHeader
                      column="charged_amount"
                      label={t("headerAmount")}
                      sort={sort}
                      order={order}
                      onSort={onSortChange}
                    />
                  </TableHead>
                  <TableHead className="w-[150px]">
                    <SortHeader
                      column="category"
                      label={t("headerCategory")}
                      sort={sort}
                      order={order}
                      onSort={onSortChange}
                    />
                  </TableHead>
                  <TableHead className="w-[170px]">השקעה</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((txn) => {
                  const isIncome = txn.chargedAmount > 0;
                  const directionColor = isIncome
                    ? "var(--status-on-track)"
                    : "var(--status-over)";
                  const categoryKind: Kind = isIncome ? "income" : "expense";
                  const categoryName = txn.categoryName
                    ? translateCategoryName(txn.categoryName, tCat)
                    : t("rowUncategorized");
                  const assignedInvestment = investmentsQuery.data?.items.find(investment =>
                    [investment.capital_category_id, investment.expense_category_id, investment.income_category_id].includes(txn.categoryId ?? -1)
                  );
                  const assignedRole = assignedInvestment
                    ? txn.categoryId === assignedInvestment.capital_category_id ? "הון"
                      : txn.categoryId === assignedInvestment.income_category_id ? "תקבול" : "תשלום"
                    : null;
                  return (
                    <TableRow
                      key={txn.id}
                      data-state={selectedIds.has(txn.id) ? "selected" : undefined}
                      className="transition-colors duration-200 hover:bg-muted/50"
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(txn.id)}
                          onChange={() => toggleOne(txn.id)}
                          aria-label={`בחירת ${txn.description}`}
                          className="h-4 w-4 accent-[var(--primary)]"
                        />
                      </TableCell>
                      <TableCell>
                        <div style={{ color: directionColor }}>
                          {isIncome ? (
                            <ArrowUpRight className="h-4 w-4" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium tabular-nums text-muted-foreground">
                        {formatDate(txn.date)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {/* Opens that party's mini-dashboard. For a transfer
                              this resolves to the person, not the channel
                              ("העברה בBIT"), matching how the server groups. */}
                          <button
                            type="button"
                            onClick={() =>
                              setMerchantDetail(
                                merchantKeyOf(txn.description, txn.memo)
                              )
                            }
                            title={`הצגת נתונים על ${merchantKeyOf(txn.description, txn.memo)}`}
                            className="rounded text-start font-medium underline decoration-dotted decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-foreground"
                          >
                            {txn.description}
                          </button>
                          {txn.needsReview && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold"
                              style={{
                                backgroundColor:
                                  "color-mix(in oklch, var(--status-heads-up) 18%, transparent)",
                                color: "var(--status-heads-up)",
                              }}
                              title={
                                txn.aiConfidence != null
                                  ? t("rowReviewTooltipConfidence", { score: txn.aiConfidence })
                                  : t("rowReviewTooltipUnsure")
                              }
                            >
                              <HelpCircle className="h-3 w-3" />
                              {t("rowReview")}
                              {txn.aiConfidence != null && (
                                <span className="ms-0.5 tabular-nums">
                                  {txn.aiConfidence}/7
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        {txn.needsReview && txn.reviewReason && (
                          <div className="mt-1 text-sm text-muted-foreground">
                            {txn.reviewReason}
                          </div>
                        )}
                        {txn.memo && (
                          <div className="text-sm text-muted-foreground">
                            {txn.memo}
                          </div>
                        )}
                        <TransactionNote id={txn.id} note={txn.userNote} />
                        {txn.type === "installments" &&
                          txn.installmentNumber &&
                          txn.installmentTotal && (
                            <div className="text-sm text-muted-foreground">
                              {t("rowInstallment", {
                                n: txn.installmentNumber,
                                total: txn.installmentTotal,
                              })}
                            </div>
                          )}
                      </TableCell>
                      <TableCell
                        className="text-start font-medium tabular-nums"
                        style={{ color: directionColor }}
                      >
                        {editingAmountId===txn.id?<form className="flex w-32 items-center gap-1" onSubmit={event=>{event.preventDefault();void saveAmount(txn);}}><input autoFocus type="number" min="0" step="0.01" inputMode="decimal" aria-label={`עריכת סכום ${txn.description}`} value={amountDraft} onChange={event=>setAmountDraft(event.target.value)} className="h-8 min-w-0 w-20 rounded-md border bg-background px-2 text-xs text-start"/><button type="submit" disabled={updatingId===txn.id} className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent" title="שמירת סכום"><Check className="h-3.5 w-3.5"/></button><button type="button" onClick={()=>setEditingAmountId(null)} className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent" title="ביטול"><X className="h-3.5 w-3.5"/></button></form>:formatCurrency(txn.chargedAmount, "ILS", locale)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <CategoryPicker
                            name={categoryName}
                            color={txn.categoryColor}
                            options={categoryOptionsForKind(categoryKind)}
                            offset={offsetFor(categoryKind)}
                            disabled={updatingId === txn.id}
                            onSelect={(categoryId)=>handleCategoryChange(txn.id,categoryId,false)}
                          />
                          {(txn.kind === "expense" || txn.kind === "income") && (
                            <div className="flex items-center gap-2">
                              {/* An action on the category the row already has,
                                  not a switch armed before picking one: the
                                  natural order is to categorise first and only
                                  then decide it is worth a rule. */}
                              {txn.ruleId != null ? (
                                // Already governed by a rule. Cancelling one
                                // belongs on the rules screen, so this is a
                                // label, not a control.
                                <span
                                  className="inline-flex h-7 items-center gap-1 px-1 text-xs text-muted-foreground"
                                  title={t("rowRuledTooltip")}
                                >
                                  <Sparkles className="h-3 w-3" />
                                  {t("rowRuled")}
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={
                                    updatingId === txn.id ||
                                    txn.categoryId == null
                                  }
                                  onClick={() => void handleMakeRule(txn)}
                                  title={
                                    txn.categoryId == null
                                      ? "צריך לבחור קטגוריה קודם"
                                      : t("rowRememberTooltip")
                                  }
                                  className="h-7 gap-1 px-2.5 text-xs font-semibold"
                                >
                                  <Sparkles className="h-3 w-3" />
                                  {t("rowRemember")}
                                </Button>
                              )}
                              {txn.needsReview && txn.categoryId != null && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleApprove(txn.id, false)
                                  }
                                  disabled={updatingId === txn.id}
                                  className="h-7 gap-1 px-2.5 text-xs font-semibold"
                                  style={{
                                    borderColor:
                                      "color-mix(in oklch, var(--status-on-track) 35%, transparent)",
                                    color: "var(--status-on-track)",
                                  }}
                                  title={t("rowApproveTooltip")}
                                >
                                  <Check className="h-3 w-3" />
                                  {t("rowApprove")}
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {assignedInvestment ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              disabled={updatingId === txn.id}
                              className="inline-flex min-h-9 max-w-[165px] items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-start text-sm font-medium hover:bg-accent disabled:opacity-60"
                              aria-label={`שיוך ${txn.description} להשקעה`}
                            >
                              <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{`${assignedInvestment.name} · ${assignedRole}`}</span>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="min-w-64">
                              {(investmentsQuery.data?.items ?? []).map(investment => (
                                <Fragment key={investment.id}>
                                  <DropdownMenuLabel>{investment.name}</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={()=>handleInvestmentAssignment(txn.id,investment.id,"capital")}>העברת הון להשקעה</DropdownMenuItem>
                                  <DropdownMenuItem onClick={()=>handleInvestmentAssignment(txn.id,investment.id,isIncome?"income":"expense")}>{isIncome?"תקבול מההשקעה":"תשלום הקשור להשקעה"}</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </Fragment>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={updatingId === txn.id}
                            onClick={() => handleDefaultInvestmentAssignment(txn.id, isIncome ? "income" : "capital")}
                            className="min-h-9 gap-1.5 text-sm"
                          >
                            <TrendingUp className="h-3.5 w-3.5" />
                            סימון כהשקעה
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="text-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                            disabled={updatingId === txn.id}
                            aria-label={t("rowActions")}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {otherKinds[txn.kind].map((opt) => (
                              <DropdownMenuItem
                                key={opt.value}
                                onClick={() => handleKindChange(txn.id, opt.value)}
                              >
                                {opt.label}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={()=>{setAmountDraft(Math.abs(txn.chargedAmount).toFixed(2));setEditingAmountId(txn.id);}}><Pencil className="h-4 w-4"/>עריכת סכום</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={()=>void removeTransaction(txn)}><Trash2 className="h-4 w-4"/>מחיקת תנועה</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <span className="text-xs text-muted-foreground">
                  {t("paginationRange", {
                    from: page * PAGE_SIZE + 1,
                    to: Math.min((page + 1) * PAGE_SIZE, total),
                    total,
                  })}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(page - 1)}
                    disabled={page === 0}
                  >
                    {t("previous")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= totalPages - 1}
                  >
                    {t("next")}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
    <MerchantDetailSheet
      merchant={merchantDetail}
      onClose={() => setMerchantDetail(null)}
    />
    <RetroRuleDialog
      target={retroTarget}
      onClose={() => setRetroTarget(null)}
    />
    </>
  );
}


/**
 * Clickable column header. First click sorts by that column, each further click
 * flips the direction; the arrow shows which way it currently runs.
 */
function SortHeader({
  column,
  label,
  sort,
  order,
  onSort,
}: {
  column: string;
  label: string;
  sort: string;
  order: "asc" | "desc";
  onSort: (column: string) => void;
}) {
  const active = sort === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-label={`מיון לפי ${label}`}
      aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}
      className={`-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-foreground ${
        active ? "font-bold text-foreground" : ""
      }`}
    >
      {label}
      <span
        className={`text-xs leading-none ${active ? "opacity-100" : "opacity-30"}`}
        aria-hidden
      >
        {active ? (order === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );
}
