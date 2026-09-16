"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  applySmartAssign,
  smartAssignCategories,
  type SmartAssignProposal,
} from "@/lib/api";
import { translateCategoryName } from "@/lib/i18n-data";
import type { CategoryKind } from "@/lib/types";

type Scope = "unassigned" | "all";

/**
 * Smart assign: the AI proposes a parent group for each category, and nothing
 * is written until the user approves. Grouping changes how every past
 * transaction rolls up, so it is deliberately a two-step flow - propose, then
 * apply only the ticked rows.
 */
export function SmartAssignDialog({
  kind,
  open,
  onClose,
}: {
  kind: CategoryKind;
  open: boolean;
  onClose: () => void;
}) {
  const tCat = useTranslations("categoriesSeeded");
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<Scope>("unassigned");
  const [proposals, setProposals] = useState<SmartAssignProposal[] | null>(null);
  const [approved, setApproved] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) {
      setProposals(null);
      setApproved(new Set());
      setScope("unassigned");
    }
  }, [open]);

  const proposeMutation = useMutation({
    mutationFn: () => smartAssignCategories({ kind, scope }),
    onSuccess: (result) => {
      setProposals(result.proposals);
      // Everything starts ticked: the user is reviewing a proposal, not
      // building one from scratch.
      setApproved(new Set(result.proposals.map((p) => p.categoryId)));
      if (result.proposals.length === 0) {
        toast.success(
          scope === "unassigned"
            ? "כל הקטגוריות כבר משויכות"
            : "לא נמצאו שינויים מוצעים"
        );
      }
    },
    onError: (err: Error) =>
      toast.error(err.message || "השיוך החכם נכשל"),
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      applySmartAssign(
        (proposals ?? [])
          .filter((p) => approved.has(p.categoryId))
          .map((p) => ({ categoryId: p.categoryId, parentId: p.proposedParentId }))
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success(`שויכו ${result.applied} קטגוריות`);
      if (result.failed.length > 0) {
        toast.error(`${result.failed.length} שיוכים נכשלו`);
      }
      onClose();
    },
    onError: (err: Error) => toast.error(err.message || "השמירה נכשלה"),
  });

  const toggle = (id: number) =>
    setApproved((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl!">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            שיוך חכם
          </DialogTitle>
        </DialogHeader>

        {proposals === null ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              הבינה המלאכותית תציע לכל קטגוריה קבוצת אב. שום דבר לא ישתנה עד
              שתאשרו את ההצעה.
            </p>
            <div className="grid gap-2">
              <ScopeOption
                checked={scope === "unassigned"}
                onSelect={() => setScope("unassigned")}
                title="רק קטגוריות ללא שיוך"
                help="לא נוגע בשום דבר שכבר סידרתם."
              />
              <ScopeOption
                checked={scope === "all"}
                onSelect={() => setScope("all")}
                title="גם לבדוק מחדש את המשויכות"
                help="בודק גם קטגוריות שכבר בקבוצה, ומציע העברה רק אם הוא חושב שמקומן במקום אחר."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                ביטול
              </Button>
              <Button
                onClick={() => proposeMutation.mutate()}
                disabled={proposeMutation.isPending}
                className="gap-1.5"
              >
                {proposeMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {proposeMutation.isPending ? "חושב…" : "הצעת שיוך"}
              </Button>
            </div>
          </div>
        ) : proposals.length === 0 ? (
          <div className="space-y-4">
            <p className="py-6 text-center text-sm text-muted-foreground">
              אין הצעות. הכול כבר מסודר.
            </p>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={onClose}>
                סגירה
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {proposals.length} הצעות · {approved.size} מאושרות
              </p>
              <div className="flex gap-3 text-sm">
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() =>
                    setApproved(new Set(proposals.map((p) => p.categoryId)))
                  }
                >
                  סימון הכל
                </button>
                <button
                  type="button"
                  className="font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setApproved(new Set())}
                >
                  ניקוי
                </button>
              </div>
            </div>

            <ul className="divide-y divide-border rounded-xl border border-border">
              {proposals.map((p) => (
                <li key={p.categoryId}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40">
                    <input
                      type="checkbox"
                      checked={approved.has(p.categoryId)}
                      onChange={() => toggle(p.categoryId)}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: p.categoryColor }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {translateCategoryName(p.categoryName, tCat)}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-sm">
                      <span className="text-muted-foreground">
                        {p.currentParentName
                          ? translateCategoryName(p.currentParentName, tCat)
                          : "ללא קבוצה"}
                      </span>
                      <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-semibold">
                        {translateCategoryName(p.proposedParentName, tCat)}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                ביטול
              </Button>
              <Button
                onClick={() => applyMutation.mutate()}
                disabled={approved.size === 0 || applyMutation.isPending}
                className="gap-1.5"
              >
                {applyMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                שיוך {approved.size} קטגוריות
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ScopeOption({
  checked,
  onSelect,
  title,
  help,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  help: string;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
        checked ? "border-primary bg-accent/40" : "border-border hover:bg-accent/20"
      }`}
    >
      <input
        type="radio"
        name="smart-assign-scope"
        className="mt-1"
        checked={checked}
        onChange={onSelect}
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-sm text-muted-foreground">{help}</span>
      </span>
    </label>
  );
}
