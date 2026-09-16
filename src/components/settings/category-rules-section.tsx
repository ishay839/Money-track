"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  applyCategoryRules,
  createCategoryRule,
  deleteCategoryRule,
  getCategoryRules,
  updateCategoryRule,
  type CategoryRule,
  type RuleMatchType,
  type RuleMatchField,
} from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import type { Category } from "@/lib/types";

/**
 * Rules that file matching transactions into one category automatically.
 * Lives inside the category sheet so a rule is written where the decision is
 * being made, rather than in a separate screen the user has to go find.
 */
export function CategoryRulesSection({ category }: { category: Category }) {
  const t = useTranslations("settings.rules");
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["category-rules", category.id],
    queryFn: () => getCategoryRules(category.id),
  });
  const rules = data?.rules ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["category-rules"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["home"] });
  };

  const removeMutation = useMutation({
    mutationFn: (id: number) => deleteCategoryRule(id),
    onSuccess: invalidate,
    onError: () => toast.error(t("saveFailed")),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      updateCategoryRule({ id, enabled }),
    onSuccess: invalidate,
  });

  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {t("sectionInCategory")}
      </div>
      <div className="mt-3 space-y-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          {t("sectionInCategoryHint")}
        </p>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emptyState")}</p>
        ) : (
          <ul className="space-y-2">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">
                    {describeRule(rule, t)}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {t("hits", { count: rule.hitCount })}
                    {rule.note ? ` · ${rule.note}` : ""}
                  </div>
                </div>
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={(enabled) =>
                    toggleMutation.mutate({ id: rule.id, enabled })
                  }
                  aria-label={t("enabledLabel")}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t("deleteConfirm"))) {
                      removeMutation.mutate(rule.id);
                    }
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                  aria-label="מחיקת הכלל"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <RuleForm
            categoryId={category.id}
            onDone={() => {
              setAdding(false);
              invalidate();
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("addButton")}
          </Button>
        )}
      </div>
    </section>
  );
}

/** Renders a rule as a sentence rather than a row of raw field values. */
export function describeRule(
  rule: CategoryRule,
  t: ReturnType<typeof useTranslations<"settings.rules">>
): string {
  const parts: string[] = [];
  if (rule.merchantValue) {
    const verb =
      rule.matchType === "equals"
        ? t("matchTypeEquals")
        : rule.matchType === "starts"
          ? t("matchTypeStarts")
          : t("matchTypeContains");
    const subject =
      rule.matchField === "counterparty" ? "שולח/מקבל ההעברה " : "";
    parts.push(`${subject}${verb} "${rule.merchantValue}"`);
  }
  if (rule.amountMin != null && rule.amountMax != null) {
    parts.push(
      `${formatCurrency(rule.amountMin)}–${formatCurrency(rule.amountMax)}`
    );
  } else if (rule.amountMin != null) {
    parts.push(`מעל ${formatCurrency(rule.amountMin)}`);
  } else if (rule.amountMax != null) {
    parts.push(`עד ${formatCurrency(rule.amountMax)}`);
  }
  if (rule.dateFrom || rule.dateTo) {
    parts.push(`${rule.dateFrom ?? "…"} – ${rule.dateTo ?? "…"}`);
  }
  return parts.join(" · ");
}

export function RuleForm({
  categoryId,
  categories,
  onDone,
  onCancel,
}: {
  categoryId?: number;
  /** When supplied, the form also picks the destination category. */
  categories?: Category[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("settings.rules");
  const [kind, setKind] = useState<Category["kind"]>("expense");
  const [target, setTarget] = useState<string>(
    categoryId != null ? String(categoryId) : ""
  );
  const [matchType, setMatchType] = useState<RuleMatchType>("contains");
  const [matchField, setMatchField] = useState<RuleMatchField>("description");
  const [merchantValue, setMerchantValue] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<number | null>(null);
  const availableCategories = (categories ?? []).filter((c) => c.kind === kind);

  const chooseKind = (next: Category["kind"]) => {
    setKind(next);
    const selected = categories?.find((c) => String(c.id) === target);
    if (!selected || selected.kind !== next) setTarget("");
  };

  const draft = () => ({
    categoryId: Number(target),
    matchType,
    matchField,
    merchantValue: merchantValue.trim() || null,
    amountMin: amountMin === "" ? null : Number(amountMin),
    amountMax: amountMax === "" ? null : Number(amountMax),
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    note: note.trim() || null,
  });

  const hasCondition =
    merchantValue.trim() !== "" ||
    amountMin !== "" ||
    amountMax !== "" ||
    dateFrom !== "" ||
    dateTo !== "";

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { id } = await createCategoryRule(draft());
      // Offer the rule immediately against history; dry run first so the
      // count can be reported rather than silently applied.
      const dry = await applyCategoryRules({
        ruleId: id,
        onlyUncategorised: false,
        dryRun: true,
      });
      return { id, matched: dry.matched };
    },
    onSuccess: async ({ id, matched }) => {
      if (
        matched > 0 &&
        window.confirm(
          `${t("previewMatched", { count: matched })}. ${t("applyNow")}?`
        )
      ) {
        const result = await applyCategoryRules({
          ruleId: id,
          onlyUncategorised: false,
          dryRun: false,
        });
        toast.success(t("applied", { count: result.changed }));
      } else {
        toast.success(t("saveButton"));
      }
      onDone();
    },
    onError: (err: Error) => toast.error(err.message || t("saveFailed")),
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const { id } = await createCategoryRule(draft());
      const dry = await applyCategoryRules({
        ruleId: id,
        onlyUncategorised: false,
        dryRun: true,
      });
      await deleteCategoryRule(id);
      return dry.matched;
    },
    onSuccess: setPreview,
    onError: (err: Error) => toast.error(err.message || t("saveFailed")),
  });

  return (
    <form
      className="space-y-3 rounded-lg border border-border bg-background p-3"
      onSubmit={(e) => {
        e.preventDefault();
        saveMutation.mutate();
      }}
    >
      {categories && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>סוג התנועה</Label>
            <div
              className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
              role="group"
              aria-label="סוג התנועה"
            >
              <button
                type="button"
                aria-pressed={kind === "expense"}
                onClick={() => chooseKind("expense")}
                className={`h-9 rounded-md px-3 text-sm font-medium transition-colors ${
                  kind === "expense"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                הוצאות
              </button>
              <button
                type="button"
                aria-pressed={kind === "income"}
                onClick={() => chooseKind("income")}
                className={`h-9 rounded-md px-3 text-sm font-medium transition-colors ${
                  kind === "income"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                הכנסות
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("targetLabel")}</Label>
            <RuleCategoryPicker
              value={target}
              categories={availableCategories}
              onChange={setTarget}
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>{t("matchLabel")}</Label>
        <div className="flex flex-wrap gap-2">
          {/* What to look at. A transfer names the channel in its description
              and the person in its memo, so these are different questions. */}
          <Select
            value={matchField}
            onValueChange={(v) => v && setMatchField(v as RuleMatchField)}
          >
            <SelectTrigger className="w-36 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="description">שם בית העסק</SelectItem>
              <SelectItem value="counterparty">שולח / מקבל ההעברה</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={matchType}
            onValueChange={(v) => v && setMatchType(v as RuleMatchType)}
          >
            <SelectTrigger className="w-32 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contains">{t("matchTypeContains")}</SelectItem>
              <SelectItem value="equals">{t("matchTypeEquals")}</SelectItem>
              <SelectItem value="starts">{t("matchTypeStarts")}</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={merchantValue}
            onChange={(e) => setMerchantValue(e.target.value)}
            placeholder={t("matchPlaceholder")}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("amountLabel")}</Label>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={0}
              inputMode="decimal"
              value={amountMin}
              onChange={(e) => setAmountMin(e.target.value)}
              placeholder={t("amountMin")}
              className="tabular-nums"
            />
            <Input
              type="number"
              min={0}
              inputMode="decimal"
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
              placeholder={t("amountMax")}
              className="tabular-nums"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("dateLabel")}</Label>
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("noteLabel")}
      />

      {preview != null && (
        <p className="text-sm font-medium text-muted-foreground">
          {preview > 0 ? t("previewMatched", { count: preview }) : t("previewNone")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={
            !hasCondition || target === "" || saveMutation.isPending
          }
          className="gap-1.5"
        >
          {saveMutation.isPending && (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          )}
          {t("saveButton")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!hasCondition || target === "" || previewMutation.isPending}
          onClick={() => previewMutation.mutate()}
          className="gap-1.5"
        >
          {previewMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="h-3.5 w-3.5" />
          )}
          בדיקה
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          ביטול
        </Button>
        {!hasCondition && (
          <span className="text-xs text-muted-foreground">
            {t("needsCondition")}
          </span>
        )}
      </div>
    </form>
  );
}

function RuleCategoryPicker({
  value,
  categories,
  onChange,
}: {
  value: string;
  categories: Category[];
  onChange: (value: string) => void;
}) {
  const tCat = useTranslations("categoriesSeeded");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = categories.find((c) => String(c.id) === value);
  const normalized = search.trim().toLocaleLowerCase("he-IL");
  const shown = categories.filter((category) => {
    if (!normalized) return true;
    const translated = translateCategoryName(category.name, tCat);
    return (
      translated.toLocaleLowerCase("he-IL").includes(normalized) ||
      category.name.toLocaleLowerCase("he-IL").includes(normalized)
    );
  });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-sm"
        aria-label="בחירת קטגוריה"
      >
        <span className={selected ? "flex min-w-0 items-center gap-2" : "text-muted-foreground"}>
          {selected && (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: selected.color }}
            />
          )}
          <span className="truncate">
            {selected
              ? translateCategoryName(selected.name, tCat)
              : "בחירת קטגוריה"}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-3rem)] p-2">
        <Input
          autoFocus
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="חיפוש קטגוריה..."
          aria-label="חיפוש קטגוריה"
          className="h-9"
        />
        <div className="mt-2 max-h-64 overflow-y-auto">
          {shown.map((category) => (
            <button
              type="button"
              key={category.id}
              onClick={() => {
                onChange(String(category.id));
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-start text-sm hover:bg-accent"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              <span className="truncate">
                {translateCategoryName(category.name, tCat)}
              </span>
            </button>
          ))}
          {shown.length === 0 && (
            <div className="py-5 text-center text-sm text-muted-foreground">
              לא נמצאה קטגוריה
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
