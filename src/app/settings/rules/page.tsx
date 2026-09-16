"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SectionShell } from "@/components/settings/section-shell";
import {
  RuleForm,
  describeRule,
} from "@/components/settings/category-rules-section";
import {
  deleteCategoryRule,
  getCategories,
  getCategoryRules,
  getSettings,
  updateCategoryRule,
} from "@/lib/api";
import { translateCategoryName } from "@/lib/i18n-data";

export default function RulesSettingsPage() {
  const t = useTranslations("settings.rules");
  const tCat = useTranslations("categoriesSeeded");
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["category-rules"],
    queryFn: () => getCategoryRules(),
  });
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
  });
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const rules = data?.rules ?? [];
  const leaves = (categories ?? []).filter(
    (c) => !(categories ?? []).some((o) => o.parentId === c.id)
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["category-rules"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
  };

  const removeMutation = useMutation({
    mutationFn: (id: number) => deleteCategoryRule(id),
    onSuccess: invalidate,
  });
  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      updateCategoryRule({ id, enabled }),
    onSuccess: invalidate,
  });

  const aiOff = !settings || settings.aiProvider === "none";

  return (
    <SectionShell title={t("title")} description={t("description")}>
      <p
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground"
        role="status"
      >
        {aiOff ? t("aiOff") : t("aiOn")}
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : rules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm font-medium">{t("emptyState")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("emptyHint")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: rule.categoryColor }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  {describeRule(rule, t)}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  ← {translateCategoryName(rule.categoryName, tCat)} ·{" "}
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
          categories={leaves}
          onDone={() => {
            setAdding(false);
            invalidate();
            toast.success(t("saveButton"));
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Button onClick={() => setAdding(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {t("addButton")}
        </Button>
      )}
    </SectionShell>
  );
}
