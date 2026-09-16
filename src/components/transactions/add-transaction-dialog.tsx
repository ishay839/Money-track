"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, InputGroup } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createManualTransaction, getCategories } from "@/lib/api";
import { translateCategoryName } from "@/lib/i18n-data";
import type { Category } from "@/lib/types";

type Kind = "expense" | "income" | "transfer";

const KINDS: Array<{ value: Kind; label: string; hint: string }> = [
  { value: "expense", label: "הוצאה", hint: "כסף שיצא" },
  { value: "income", label: "הכנסה", hint: "כסף שנכנס" },
  {
    value: "transfer",
    label: "העברה",
    hint: "בין חשבונות שלך - לא נספר בתזרים",
  },
];

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Records something the banks will never send: cash spent, a repayment
 * between people, anything that happened outside a connected account.
 */
export function AddTransactionDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const tCat = useTranslations("categoriesSeeded");
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(today);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setKind("expense");
    setAmount("");
    setDescription("");
    setDate(today());
    setCategoryId(null);
    setNote("");
  }, [open]);

  // A transfer belongs to neither side, so it gets no category picker.
  const categoryKind = kind === "income" ? "income" : "expense";
  const categoriesQuery = useQuery({
    queryKey: ["categories", categoryKind],
    queryFn: () => getCategories(categoryKind),
    enabled: open && kind !== "transfer",
  });

  // Switching sides invalidates a category picked from the other one.
  useEffect(() => {
    setCategoryId(null);
  }, [kind]);

  const options = useMemo(() => {
    const all = categoriesQuery.data ?? [];
    const out: Array<{ category: Category; depth: number }> = [];
    for (const root of all.filter((c) => c.parentId == null)) {
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

  const parsedAmount = Number(amount);
  const valid =
    description.trim() !== "" &&
    amount.trim() !== "" &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(date);

  const mutation = useMutation({
    mutationFn: () =>
      createManualTransaction({
        date,
        description: description.trim(),
        amount: parsedAmount,
        kind,
        categoryId,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      // Everything that counts money has to be told, or the new row shows up
      // in the list while the totals above it stay stale.
      for (const key of [
        "transactions",
        "transactions-summary",
        "summary",
        "home",
        "categories",
        "category-detail",
        "merchant-detail",
        "analytics",
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast.success("התנועה נוספה");
      onClose();
    },
    onError: (error: Error) =>
      toast.error(error.message || "הוספת התנועה נכשלה"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg!">
        <DialogHeader>
          <DialogTitle>הוספת תנועה ידנית</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !mutation.isPending) mutation.mutate();
          }}
        >
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                aria-pressed={kind === k.value}
                className={`rounded-xl border p-2.5 text-center transition-colors ${
                  kind === k.value
                    ? "border-primary bg-accent/50"
                    : "border-border hover:bg-accent/25"
                }`}
              >
                <span className="block text-sm font-semibold">{k.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {k.hint}
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <Label htmlFor="manual-amount">סכום</Label>
              <InputGroup prefix="₪">
                <Input
                  id="manual-amount"
                  autoFocus
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-end tabular-nums"
                />
              </InputGroup>
            </label>

            <label className="grid gap-1.5">
              <Label htmlFor="manual-date">תאריך</Label>
              <Input
                id="manual-date"
                type="date"
                value={date}
                max={today()}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>

          <label className="grid gap-1.5">
            <Label htmlFor="manual-description">תיאור</Label>
            <Input
              id="manual-description"
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                kind === "income" ? "למשל: החזר מחבר" : "למשל: משיכת מזומן"
              }
            />
          </label>

          {kind !== "transfer" && (
            <label className="grid gap-1.5">
              <Label htmlFor="manual-category">
                קטגוריה{" "}
                <span className="font-normal text-muted-foreground">
                  (לא חובה)
                </span>
              </Label>
              <select
                id="manual-category"
                value={categoryId ?? ""}
                onChange={(e) =>
                  setCategoryId(e.target.value ? Number(e.target.value) : null)
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">ללא קטגוריה</option>
                {options.map(({ category, depth }) => (
                  <option key={category.id} value={category.id}>
                    {depth ? "  " : ""}
                    {translateCategoryName(category.name, tCat)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="grid gap-1.5">
            <Label htmlFor="manual-note">
              הערה{" "}
              <span className="font-normal text-muted-foreground">
                (לא חובה)
              </span>
            </Label>
            <Input
              id="manual-note"
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          <div className="flex gap-2 border-t border-border pt-4">
            <Button type="submit" disabled={!valid || mutation.isPending} className="gap-1.5">
              {mutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              שמירה
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              ביטול
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
