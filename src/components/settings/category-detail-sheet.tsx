"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input, InputGroup } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  bulkAssignCategory,
  deleteCategory,
  getCategories,
  getCategoryDeleteImpact,
  getTransactions,
  setCategoryParent,
  updateBudget,
  updateCategoryBudgetMode,
  renameCategory,
  updateCategoryDescription,
  type CategoryDeleteImpact,
} from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import type { Category, CategoryWithData } from "@/lib/types";
import { useTranslations } from "next-intl";
import { CategoryRulesSection } from "@/components/settings/category-rules-section";
import { translateCategoryName } from "@/lib/i18n-data";

const NONE_VALUE = "__none__";
const DESCRIPTION_MAX = 500;

export interface CategoryDetailSheetProps {
  categoryId: number | null;
  data: CategoryWithData | null;
  onClose: () => void;
}

export function CategoryDetailSheet({
  categoryId,
  data,
  onClose,
}: CategoryDetailSheetProps) {
  const open = categoryId !== null;
  const { data: allCategories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
    enabled: open,
  });
  const category = useMemo(
    () => allCategories?.find((c) => c.id === categoryId) ?? null,
    [allCategories, categoryId]
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full p-0 sm:max-w-md! md:max-w-lg!"
      >
        {category ? (
          <Body
            category={category}
            data={data}
            allCategories={allCategories ?? []}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Body({
  category,
  data,
  allCategories,
}: {
  category: Category;
  data: CategoryWithData | null;
  allCategories: Category[];
}) {
  const tCat = useTranslations("categoriesSeeded");
  const displayName = translateCategoryName(category.name, tCat);
  const sameKind = allCategories.filter(
    (c) => c.kind === category.kind && c.id !== category.id
  );
  const eligibleParents = sameKind
    .filter((c) => c.parentId == null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <SheetHeader
        className="gap-3 border-b border-border/40 p-6"
        style={{
          background: tint(category.color, 0.15),
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/70"
          >
            <span
              className="h-3 w-3 rounded-full"
              style={{ background: category.color }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <SheetTitle>{displayName}</SheetTitle>
            <SheetDescription className="mt-0.5">
              קטגוריית {category.kind === "expense" ? "הוצאה" : "הכנסה"}
              {data?.parentName
                ? ` · בתוך ${translateCategoryName(data.parentName, tCat)}`
                : ""}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      {/* Order follows how the category is actually edited: what it is (name,
          description), then where it sits and what feeds it, and only last the
          optional monthly target. */}
      <div className="flex-1 space-y-6 p-6">
        <Link
          href={`/budget?category=${category.id}`}
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/40"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold">
              פירוט ההוצאות בקטגוריה
            </span>
            <span className="mt-0.5 block text-sm text-muted-foreground">
              סכומים לפי חודש, בתי העסק המובילים והתנועות עצמן
            </span>
          </span>
          <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>

        <RenameSection category={category} displayName={displayName} />

        <DescriptionSection category={category} displayName={displayName} />

        <GroupSection
          category={category}
          eligibleParents={eligibleParents}
        />

        <CategoryRulesSection category={category} />

        <BudgetSection category={category} data={data} />

        <DangerSection category={category} displayName={displayName} />
      </div>
    </div>
  );
}

function BudgetSection({
  category,
  data,
}: {
  category: Category;
  data: CategoryWithData | null;
}) {
  const queryClient = useQueryClient();
  const isBudgeted = category.budgetMode === "budgeted";

  const modeMutation = useMutation({
    mutationFn: (next: "budgeted" | "tracking") =>
      updateCategoryBudgetMode(category.id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const budgetMutation = useMutation({
    mutationFn: (amount: number | null) => updateBudget(category.id, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  const [amount, setAmount] = useState(
    data ? String(Math.round(data.budget)) : ""
  );

  useEffect(() => {
    if (data) setAmount(String(Math.round(data.budget)));
  }, [data]);

  const handleBlur = () => {
    if (!data) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    if (Math.round(parsed) === Math.round(data.budget)) return;
    budgetMutation.mutate(parsed);
  };

  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        מעקב חודשי
      </div>
      <div className="mt-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <Label
              htmlFor={`mode-${category.id}`}
              className="text-sm font-medium"
            >
              {isBudgeted ? "עם יעד חודשי" : "מעקב בלבד"}
            </Label>
            <p className="text-xs text-muted-foreground">
              {isBudgeted
                ? "הצגת ההתקדמות מול יעד חודשי."
                : "הצגת ההוצאות ללא יעד."}
            </p>
          </div>
          <Switch
            id={`mode-${category.id}`}
            checked={isBudgeted}
            onCheckedChange={(next) =>
              modeMutation.mutate(next ? "budgeted" : "tracking")
            }
          />
        </div>

        {isBudgeted ? (
          <div className="mt-4 space-y-1.5">
            <Label htmlFor={`budget-${category.id}`}>יעד חודשי</Label>
            <InputGroup prefix="₪">
              <Input
                id={`budget-${category.id}`}
                type="number"
                className="text-end tabular-nums"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={handleBlur}
                min={0}
              />
            </InputGroup>
            {data ? (
              <p className="text-sm text-muted-foreground">
                הוצאו ₪{Math.round(data.spent).toLocaleString("he-IL")} החודש
                {data.vsTypical && data.vsTypical.typical > 0 ? (
                  <>
                    {" "}
                    · ממוצע ≈ ₪
                    {Math.round(data.vsTypical.typical).toLocaleString(
                      "he-IL"
                    )}
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function GroupSection({
  category,
  eligibleParents,
}: {
  category: Category;
  eligibleParents: Category[];
}) {
  const tCat = useTranslations("categoriesSeeded");
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (parentId: number | null) =>
      setCategoryParent(category.id, parentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success("הקבוצה עודכנה");
    },
    onError: (err: Error) => {
      const reason = err.message;
      if (reason === "kind-mismatch") {
        toast.error("קבוצת האב חייבת להיות מאותו סוג: הוצאה או הכנסה.");
      } else if (reason === "not-leaf-target") {
        toast.error("קבוצת האב חייבת להיות קטגוריה ראשית.");
      } else if (reason === "child-has-children") {
        toast.error(
          "אי אפשר להעביר קטגוריה שכבר מכילה תת־קטגוריות."
        );
      } else {
        toast.error("עדכון קבוצת האב נכשל.");
      }
    },
  });
  const current =
    category.parentId == null ? NONE_VALUE : String(category.parentId);

  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        קבוצה
      </div>
      <div className="mt-3 rounded-xl border border-border bg-card p-4 space-y-2">
        <Label>קבוצת אב</Label>
        <Select
          value={current}
          onValueChange={(v) => {
            if (!v) return;
            const next = v === NONE_VALUE ? null : Number(v);
            mutation.mutate(next);
          }}
        >
          <SelectTrigger>
            <SelectValue>
              {(value: string) =>
                value === NONE_VALUE
                  ? "ללא קבוצת אב"
                  : (() => {
                      const parent = eligibleParents.find(
                        (p) => String(p.id) === value
                      );
                      return parent
                        ? translateCategoryName(parent.name, tCat)
                        : "ללא קבוצת אב";
                    })()
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>ללא קבוצת אב</SelectItem>
            {eligibleParents.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {translateCategoryName(p.name, tCat)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          קבוצת אב מאפשרת להציג כמה קטגוריות יחד בסיכום ההוצאות.
        </p>
      </div>
    </section>
  );
}

function DescriptionSection({ category, displayName }: { category: Category; displayName: string }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(category.description ?? "");
  useEffect(() => {
    setValue(category.description ?? "");
  }, [category.description]);

  const mutation = useMutation({
    mutationFn: (next: string | null) =>
      updateCategoryDescription(category.id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("התיאור נשמר");
    },
    onError: (err: Error) => {
      toast.error(err.message || "שמירת התיאור נכשלה");
    },
  });

  const handleBlur = () => {
    const trimmed = value.trim();
    const current = (category.description ?? "").trim();
    if (trimmed === current) return;
    if (trimmed.length > DESCRIPTION_MAX) {
      toast.error(
        `התיאור יכול להכיל עד ${DESCRIPTION_MAX} תווים.`
      );
      return;
    }
    mutation.mutate(trimmed.length === 0 ? null : trimmed);
  };

  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        הנחיה לסיווג האוטומטי
      </div>
      <div className="mt-3 rounded-xl border border-border bg-card p-4 space-y-2">
        <Label htmlFor={`desc-${category.id}`}>תיאור</Label>
        <textarea
          id={`desc-${category.id}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          rows={4}
          maxLength={DESCRIPTION_MAX}
          placeholder={`מה שייך לקטגוריה "${displayName}", ומה לא שייך אליה?`}
          className="block w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          disabled={mutation.isPending}
        />
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>התיאור משמש בכל סיווג אוטומטי.</span>
          <span className="tabular-nums">
            {value.length} / {DESCRIPTION_MAX}
          </span>
        </div>
      </div>
    </section>
  );
}

function tint(color: string, alpha: number): string {
  return `color-mix(in oklch, ${color} ${Math.round(alpha * 100)}%, var(--card))`;
}


/**
 * Rename a category, with the choice the user actually cares about: does the
 * new name replace the old one everywhere, or does history keep the old name
 * and only new transactions use the new one.
 */
function RenameSection({
  category,
  displayName,
}: {
  category: Category;
  displayName: string;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(displayName);
  const [mode, setMode] = useState<"retro" | "forward">("retro");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(displayName);
  }, [displayName, category.id]);

  const changed = value.trim() !== displayName.trim() && value.trim() !== "";

  const save = async () => {
    setSaving(true);
    try {
      await renameCategory(category.id, value.trim(), mode);
      for (const key of [
        "categories",
        "category-detail",
        "categoryTree",
        "transactions",
        "summary",
        "home",
        "recurring",
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast.success(
        mode === "retro"
          ? "השם עודכן בכל התנועות"
          : "נוצרה קטגוריה חדשה; ההיסטוריה נשמרה תחת השם הישן"
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "שינוי השם נכשל"
      );
      setValue(displayName);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3">
      <h3 className="text-base font-bold">שם הקטגוריה</h3>
      <Input
        value={value}
        maxLength={60}
        onChange={(e) => setValue(e.target.value)}
        aria-label="שם הקטגוריה"
        className="h-10"
      />
      {changed && (
        <>
          <div className="space-y-2">
            <ModeOption
              checked={mode === "retro"}
              onSelect={() => setMode("retro")}
              title="לשנות גם רטרואקטיבית"
              hint="כל התנועות שסווגו כאן יוצגו מעכשיו בשם החדש."
            />
            <ModeOption
              checked={mode === "forward"}
              onSelect={() => setMode("forward")}
              title="מכאן והלאה בלבד"
              hint={`ההיסטוריה תישאר תחת "${displayName}", ותיווצר קטגוריה חדשה לתנועות הבאות.`}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "שומר..." : "שמירת השם"}
            </Button>
            <Button variant="ghost" onClick={() => setValue(displayName)}>
              ביטול
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function ModeOption({
  checked,
  onSelect,
  title,
  hint,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors ${
        checked ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
      }`}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onSelect}
        className="mt-1 h-4 w-4 accent-[var(--primary)]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

/**
 * Deleting a category, and deciding what happens to the transactions filed
 * under it. Three ways out, because the right answer differs: a category
 * created by mistake has nothing worth keeping, a renamed-in-spirit category
 * should hand everything to its replacement, and a messy one needs sorting
 * transaction by transaction.
 */
function DangerSection({
  category,
  displayName,
}: {
  category: Category;
  displayName: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const impactQuery = useQuery({
    queryKey: ["category-delete-impact", category.id],
    queryFn: () => getCategoryDeleteImpact(category.id),
    enabled: open,
  });
  const impact = impactQuery.data;

  const refresh = () => {
    for (const key of [
      "categories",
      "category-detail",
      "categoryTree",
      "transactions",
      "summary",
      "home",
      "analytics",
    ]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  if (!open) {
    return (
      <section className="border-t border-border pt-5">
        <Button
          variant="ghost"
          onClick={() => setOpen(true)}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          מחיקת הקטגוריה
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-3 border-t border-border pt-5">
      <h3 className="text-base font-bold text-destructive">
        מחיקת {displayName}
      </h3>

      {impactQuery.isLoading || !impact ? (
        <p className="text-sm text-muted-foreground">בודק מה מושפע…</p>
      ) : impact.isInvestment ? (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm">
          הקטגוריה משמשת השקעה ולא ניתן למחוק אותה.
        </p>
      ) : impact.children > 0 ? (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm">
          בקבוצה יש {impact.children} קטגוריות. יש להעביר או למחוק אותן קודם.
        </p>
      ) : (
        <DeleteFlow
          category={category}
          impact={impact}
          onDone={() => {
            refresh();
            setOpen(false);
          }}
        />
      )}

      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        ביטול
      </Button>
    </section>
  );
}

function DeleteFlow({
  category,
  impact,
  onDone,
}: {
  category: Category;
  impact: CategoryDeleteImpact;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"ask" | "move-all" | "one-by-one">("ask");
  const [busy, setBusy] = useState(false);

  const { data: allCategories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
  });
  const targets = useMemo(
    () =>
      (allCategories ?? [])
        .filter((c) => c.kind === category.kind && c.id !== category.id)
        .sort((a, b) => a.name.localeCompare(b.name, "he")),
    [allCategories, category]
  );

  const remove = async () => {
    setBusy(true);
    try {
      const res = await deleteCategory(category.id);
      toast.success(
        res.orphaned > 0
          ? `הקטגוריה נמחקה · ${res.orphaned} תנועות נותרו ללא סיווג`
          : "הקטגוריה נמחקה"
      );
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "המחיקה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  // Nothing is filed here, so there is no question to ask.
  if (impact.transactions === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          אין תנועות המשויכות לקטגוריה זו.
          {impact.rules > 0 ? ` ${impact.rules} כללי סיווג יימחקו איתה.` : ""}
        </p>
        <Button
          variant="destructive"
          disabled={busy}
          onClick={() => void remove()}
        >
          {busy ? "מוחק…" : "מחיקה"}
        </Button>
      </div>
    );
  }

  if (mode === "move-all") {
    return (
      <MoveAll
        category={category}
        targets={targets}
        count={impact.transactions}
        onCancel={() => setMode("ask")}
        onDone={onDone}
      />
    );
  }

  if (mode === "one-by-one") {
    return (
      <OneByOne
        category={category}
        targets={targets}
        onCancel={() => setMode("ask")}
        onDone={onDone}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        לקטגוריה משויכות{" "}
        <b className="tabular-nums">{impact.transactions}</b> תנועות. להעביר
        אותן לקטגוריה אחרת?
      </p>
      <div className="grid gap-2">
        <Choice
          title="כן - להעביר הכל לקטגוריה אחת"
          hint="בוחרים קטגוריה וכל התנועות עוברות אליה"
          onClick={() => setMode("move-all")}
        />
        <Choice
          title="העברה ידנית"
          hint="עוברים על התנועות ובוחרים לכל אחת (או לכמה יחד) לאן"
          onClick={() => setMode("one-by-one")}
        />
        <Choice
          title="לא - שיישארו ללא סיווג"
          hint={`${impact.transactions} תנועות יישארו בספר ללא קטגוריה`}
          destructive
          onClick={() => void remove()}
        />
      </div>
    </div>
  );
}

function Choice({
  title,
  hint,
  destructive,
  onClick,
}: {
  title: string;
  hint: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-start transition-colors ${
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

function MoveAll({
  category,
  targets,
  count,
  onCancel,
  onDone,
}: {
  category: Category;
  targets: Category[];
  count: number;
  onCancel: () => void;
  onDone: () => void;
}) {
  const tCat = useTranslations("categoriesSeeded");
  const [targetId, setTargetId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (targetId == null) return;
    setBusy(true);
    try {
      // Move first, then delete: if the move fails the category is still here
      // and nothing has been lost.
      const ids = await collectTransactionIds(category.id);
      if (ids.length > 0) await bulkAssignCategory(ids, targetId);
      await deleteCategory(category.id);
      toast.success(`${ids.length} תנועות הועברו והקטגוריה נמחקה`);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "הפעולה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Label htmlFor="move-target">להעביר את {count} התנועות אל</Label>
      <select
        id="move-target"
        value={targetId ?? ""}
        onChange={(e) =>
          setTargetId(e.target.value ? Number(e.target.value) : null)
        }
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">בחירת קטגוריה…</option>
        {targets.map((c) => (
          <option key={c.id} value={c.id}>
            {translateCategoryName(c.name, tCat)}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <Button
          variant="destructive"
          disabled={targetId == null || busy}
          onClick={() => void run()}
        >
          {busy ? "מעביר…" : "העברה ומחיקה"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          חזרה
        </Button>
      </div>
    </div>
  );
}

/**
 * Walks the transactions in batches: tick the ones that belong together, send
 * them somewhere, and the rest stay on screen for the next decision.
 */
function OneByOne({
  category,
  targets,
  onCancel,
  onDone,
}: {
  category: Category;
  targets: Category[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const tCat = useTranslations("categoriesSeeded");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [targetId, setTargetId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const listQuery = useQuery({
    queryKey: ["category-cleanup", category.id],
    queryFn: () =>
      getTransactions({
        category: category.id,
        limit: 200,
        includeTransfers: true,
      }),
  });
  const rows = listQuery.data?.transactions ?? [];

  const moveSelected = async () => {
    if (targetId == null || selected.size === 0) return;
    setBusy(true);
    try {
      await bulkAssignCategory([...selected], targetId);
      setSelected(new Set());
      setTargetId(null);
      await listQuery.refetch();
      toast.success("התנועות הועברו");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ההעברה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      const res = await deleteCategory(category.id);
      toast.success(
        res.orphaned > 0
          ? `הקטגוריה נמחקה · ${res.orphaned} תנועות נותרו ללא סיווג`
          : "הקטגוריה נמחקה"
      );
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "המחיקה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  if (listQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">טוען תנועות…</p>;
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          לא נותרו תנועות בקטגוריה.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">
              נותרו <b className="tabular-nums">{rows.length}</b> תנועות
            </span>
            <button
              type="button"
              onClick={() =>
                setSelected(
                  selected.size === rows.length
                    ? new Set()
                    : new Set(rows.map((r) => r.id))
                )
              }
              className="text-sm font-semibold text-primary hover:underline"
            >
              {selected.size === rows.length ? "ניקוי הבחירה" : "בחירת הכל"}
            </button>
          </div>

          <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {rows.map((t) => (
              <li key={t.id}>
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent/40">
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (!next.delete(t.id)) next.add(t.id);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {t.description}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatCurrency(Math.abs(t.chargedAmount))}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={targetId ?? ""}
              onChange={(e) =>
                setTargetId(e.target.value ? Number(e.target.value) : null)
              }
              aria-label="קטגוריית יעד"
              className="h-9 min-w-40 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">העברת הנבחרות אל…</option>
              {targets.map((c) => (
                <option key={c.id} value={c.id}>
                  {translateCategoryName(c.name, tCat)}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={targetId == null || selected.size === 0 || busy}
              onClick={() => void moveSelected()}
            >
              העברת {selected.size}
            </Button>
          </div>
        </>
      )}

      <div className="flex gap-2 border-t border-border pt-3">
        <Button
          variant="destructive"
          disabled={busy}
          onClick={() => void finish()}
        >
          {rows.length === 0
            ? "מחיקת הקטגוריה"
            : `מחיקה (${rows.length} ללא סיווג)`}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          חזרה
        </Button>
      </div>
    </div>
  );
}

/** Every transaction id in a category, paged past the API per-call limit. */
async function collectTransactionIds(categoryId: number): Promise<number[]> {
  const ids: number[] = [];
  const PAGE = 200;
  for (let offset = 0; offset < 10000; offset += PAGE) {
    const res = await getTransactions({
      category: categoryId,
      limit: PAGE,
      offset,
      includeTransfers: true,
    });
    const batch = res.transactions ?? [];
    ids.push(...batch.map((t) => t.id));
    if (batch.length < PAGE) break;
  }
  return ids;
}
