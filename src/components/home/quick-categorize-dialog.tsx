"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getCategories,
  getTransactions,
  updateTransactionCategory,
  bulkAssignCategory,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import type { Category } from "@/lib/types";
import { offsetCopy } from "@/lib/category-offset";

/** The minimum a caller must supply; both the home card and the tables have it. */
export interface QuickCategorizeTarget {
  id: number;
  date: string;
  description: string;
  amount: number;
  reason?: string | null;
  kind?: "expense" | "income" | "transfer";
  categoryId?: number | null;
}

interface Props {
  transaction: QuickCategorizeTarget | null;
  onClose: () => void;
}

/**
 * Categorise one flagged transaction without leaving the page it was clicked
 * from. Offers to apply the same category to every other pending transaction
 * from the same merchant, which is how a 450-item backlog actually gets
 * cleared.
 */
export function QuickCategorizeDialog({ transaction, onClose }: Props) {
  const tCat = useTranslations("categoriesSeeded");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [alsoSimilar, setAlsoSimilar] = useState(true);

  const open = transaction !== null;
  const naturalKind = transaction?.kind === "income" ? "income" : "expense";

  // Normally you want the categories matching the transaction's own side. The
  // exception is an offset: a ₪500 refund for clothing you returned belongs
  // against the clothing expense, not in an income category. So the other
  // side stays reachable behind a toggle rather than being hidden outright.
  const [showOpposite, setShowOpposite] = useState(false);
  useEffect(() => {
    if (open) setShowOpposite(false);
  }, [open, transaction?.id]);

  const oppositeKind = naturalKind === "income" ? "expense" : "income";
  const kind = showOpposite ? oppositeKind : naturalKind;

  const categoriesQuery = useQuery({
    queryKey: ["categories", kind],
    queryFn: () => getCategories(kind),
    enabled: open,
  });

  // Other pending transactions from the same merchant, so one decision can
  // cover all of them.
  const similarQuery = useQuery({
    queryKey: ["similar-pending", transaction?.description],
    enabled: open && !!transaction?.description,
    queryFn: () =>
      getTransactions({
        search: transaction!.description,
        needsReview: true,
        limit: 200,
      }),
  });

  const similar = useMemo(() => {
    const rows = similarQuery.data?.transactions ?? [];
    const norm = (s: string) => s.trim().toLocaleLowerCase("he-IL");
    return rows.filter(
      (r) =>
        r.id !== transaction?.id &&
        norm(r.description) === norm(transaction?.description ?? "")
    );
  }, [similarQuery.data, transaction]);

  const options = useMemo(() => {
    const all = categoriesQuery.data ?? [];
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
  }, [categoriesQuery.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("he-IL");
    if (!q) return options;
    return options.filter(({ category }) =>
      translateCategoryName(category.name, tCat)
        .toLocaleLowerCase("he-IL")
        .includes(q)
    );
  }, [options, search, tCat]);

  const applyMutation = useMutation({
    mutationFn: async (categoryId: number) => {
      if (!transaction) return;
      const ids =
        alsoSimilar && similar.length > 0
          ? [transaction.id, ...similar.map((s) => s.id)]
          : [transaction.id];
      if (ids.length === 1) {
        await updateTransactionCategory(transaction.id, categoryId);
      } else {
        await bulkAssignCategory(ids, categoryId, transaction.description);
      }
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(
        count && count > 1 ? `סווגו ${count} תנועות` : "התנועה סווגה"
      );
      for (const key of [
        "home",
        "transactions",
        "summary",
        "transactions-summary",
        "category-detail",
        "activity",
        "similar-pending",
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      setSearch("");
      onClose();
    },
    onError: () => toast.error("שמירת הסיווג נכשלה"),
  });

  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight">
            סיווג תנועה
          </DialogTitle>
        </DialogHeader>

        <div className="surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base font-semibold break-words">
                {transaction.description}
              </div>
              <div className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                {formatDate(transaction.date)}
              </div>
            </div>
            <div className="metric-sm shrink-0">
              {formatCurrency(transaction.amount)}
            </div>
          </div>
          {transaction.reason && (
            <p className="mt-3 border-t border-border pt-3 text-sm text-[var(--status-heads-up)]">
              {transaction.reason}
            </p>
          )}
        </div>

        {similar.length > 0 && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-accent/40 p-3 text-sm">
            <input
              type="checkbox"
              checked={alsoSimilar}
              onChange={(e) => setAlsoSimilar(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
            />
            <span>
              להחיל גם על{" "}
              <b className="tabular-nums">{similar.length}</b> תנועות נוספות
              דורשות טיפול של{" "}
              <b>{transaction.description}</b>
              <span className="mt-0.5 block text-muted-foreground tabular-nums">
                בסך {formatCurrency(
                  similar.reduce((s, r) => s + Math.abs(r.chargedAmount), 0)
                )}
              </span>
            </span>
          </label>
        )}

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש קטגוריה..."
          aria-label="חיפוש קטגוריה"
          className="h-10"
        />

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">
            {kind === "income" ? "קטגוריות הכנסה" : "קטגוריות הוצאה"}
          </span>
          <button
            type="button"
            onClick={() => {
              setShowOpposite((v) => !v);
              setSearch("");
            }}
            className="text-sm font-semibold text-primary hover:underline"
          >
            {showOpposite
              ? `חזרה לקטגוריות ${naturalKind === "income" ? "הכנסה" : "הוצאה"}`
              : `${offsetCopy(naturalKind).label} ←`}
          </button>
        </div>

        {showOpposite && (
          <p className="rounded-lg bg-accent/40 px-3 py-2 text-sm text-muted-foreground">
            {offsetCopy(naturalKind).hint}
          </p>
        )}

        <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              לא נמצאה קטגוריה
            </div>
          ) : (
            filtered.map(({ category, depth }) => (
              <button
                key={category.id}
                type="button"
                disabled={applyMutation.isPending}
                onClick={() => applyMutation.mutate(category.id)}
                className={`flex w-full items-center gap-2.5 border-b border-border px-3 py-2.5 text-start text-[15px] transition-colors last:border-0 hover:bg-accent disabled:opacity-50 ${
                  depth ? "ps-8" : "font-semibold"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                <span className="min-w-0 flex-1 truncate">
                  {translateCategoryName(category.name, tCat)}
                </span>
                {category.id === transaction.categoryId && (
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                )}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <Link
            href="/transactions?review=1"
            onClick={onClose}
            className="text-sm font-semibold text-primary hover:underline"
          >
            לכל התנועות הדורשות טיפול ←
          </Link>
          <div className="flex items-center gap-2">
            {applyMutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            <Button variant="ghost" onClick={onClose}>
              סגירה
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
