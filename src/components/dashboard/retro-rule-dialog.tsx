"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { applyRetroRule, previewRetroRule } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";

export interface RetroTarget {
  description: string;
  categoryId: number;
  categoryName: string;
  /** The transaction just categorised; it is already correct, so it is skipped. */
  excludeId?: number;
}

/**
 * Offered after a merchant rule is created: the rule governs future syncs on
 * its own, but the history is still whatever it was. This asks whether to go
 * back and fix it, and shows exactly what would change first - a merchant can
 * be legitimately split across categories, and overwriting that silently
 * would destroy distinctions the user made on purpose.
 */
export function RetroRuleDialog({
  target,
  onClose,
}: {
  target: RetroTarget | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const open = target !== null;

  const previewQuery = useQuery({
    enabled: open,
    queryKey: [
      "retro-preview",
      target?.description,
      target?.categoryId,
      target?.excludeId,
    ],
    queryFn: () =>
      previewRetroRule({
        description: target!.description,
        categoryId: target!.categoryId,
        excludeId: target!.excludeId,
      }),
  });
  const preview = previewQuery.data;

  const apply = async (scope: "uncategorised" | "all") => {
    if (!target) return;
    setBusy(true);
    try {
      const res = await applyRetroRule({
        description: target.description,
        categoryId: target.categoryId,
        excludeId: target.excludeId,
        scope,
      });
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
      toast.success(
        res.updated > 0
          ? `${res.updated} תנועות מהעבר סווגו ל"${target.categoryName}"`
          : "לא נמצאו תנועות לעדכון"
      );
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "העדכון נכשל");
    } finally {
      setBusy(false);
    }
  };

  // Nothing in the past to fix: the rule stands for the future and there is
  // no question worth asking.
  const nothingToDo =
    preview != null &&
    preview.uncategorised === 0 &&
    preview.categorisedElsewhere === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg!">
        <DialogHeader>
          <DialogTitle>הכלל נשמר · להחיל גם על העבר?</DialogTitle>
        </DialogHeader>

        {previewQuery.isLoading || !preview ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            בודק את ההיסטוריה…
          </p>
        ) : nothingToDo ? (
          <div className="space-y-4">
            <p className="text-sm">
              אין תנועות קודמות של <b>{target?.description}</b> שדורשות שינוי.
              הכלל יחול על תנועות עתידיות.
            </p>
            <Button onClick={onClose}>סגירה</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm">
              מעכשיו כל תנועה של <b>{target?.description}</b> תסווג אוטומטית
              ל<b>{target?.categoryName}</b>.
              {preview.oldest && (
                <span className="mt-1 block text-muted-foreground">
                  בהיסטוריה יש תנועות מ־{formatDay(preview.oldest)} עד{" "}
                  {formatDay(preview.newest)}.
                </span>
              )}
            </p>

            <div className="grid gap-2">
              {preview.uncategorised > 0 && (
                <Option
                  title={`לסווג ${preview.uncategorised} תנועות שאין להן קטגוריה`}
                  hint="בטוח - שום סיווג קיים לא ישתנה"
                  disabled={busy}
                  onClick={() => void apply("uncategorised")}
                />
              )}

              {preview.categorisedElsewhere > 0 && (
                <>
                  <Option
                    title={`לסווג הכל - כולל ${preview.categorisedElsewhere} שכבר משויכות לקטגוריה אחרת`}
                    hint="הסיווג הקיים שלהן יוחלף"
                    destructive
                    disabled={busy}
                    onClick={() => void apply("all")}
                  />
                  {/* Where those rows sit now, so "replace" is an informed
                      choice rather than a leap. */}
                  <div className="rounded-lg bg-accent/40 p-3">
                    <div className="card-label mb-1.5">
                      התנועות שכבר משויכות נמצאות כרגע ב:
                    </div>
                    <ul className="space-y-1">
                      {preview.buckets.map((b) => (
                        <li
                          key={b.categoryId ?? "none"}
                          className="flex items-center gap-2 text-sm"
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{
                              background:
                                b.categoryColor ?? "var(--muted-foreground)",
                            }}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {b.categoryName ?? "ללא קטגוריה"}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {b.count} · {formatCurrency(b.total)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              <Option
                title="רק מכאן והלאה"
                hint="ההיסטוריה נשארת כמו שהיא"
                disabled={busy}
                onClick={onClose}
              />
            </div>

            {busy && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                מעדכן…
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Option({
  title,
  hint,
  destructive,
  disabled,
  onClick,
}: {
  title: string;
  hint: string;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl border p-3 text-start transition-colors disabled:opacity-50 ${
        destructive
          ? "border-destructive/40 hover:bg-destructive/10"
          : "border-border hover:bg-accent/40"
      }`}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-0.5 block text-sm text-muted-foreground">{hint}</span>
    </button>
  );
}

function formatDay(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
