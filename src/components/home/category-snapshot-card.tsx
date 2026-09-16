"use client";

import { useTranslations } from "next-intl";
import { CardShell, CardAction } from "./card-shell";
import { formatCurrency } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import type { HomeCategorySnapshotItem } from "@/lib/types";

interface Props {
  items: HomeCategorySnapshotItem[];
}

export function CategorySnapshotCard({ items }: Props) {
  const t = useTranslations("home");
  const tCat = useTranslations("categoriesSeeded");
  if (items.length === 0) {
    return (
      <CardShell label={t("topCategoriesTitle")}>
        <div className="flex flex-1 items-center justify-center py-6 text-base text-muted-foreground">
          {t("topCategoriesEmpty")}
        </div>
      </CardShell>
    );
  }

  const maxSpent = Math.max(...items.map((i) => i.spent), 1);

  return (
    <CardShell
      label={t("topCategoriesTitle")}
      action={<CardAction href="/budget">{t("allCategories")}</CardAction>}
    >
      <div className="flex flex-1 flex-col justify-between gap-4">
        {items.map((item) => (
          <Row
            key={item.categoryId}
            item={{ ...item, name: translateCategoryName(item.name, tCat) }}
            maxSpent={maxSpent}
          />
        ))}
      </div>
    </CardShell>
  );
}

function Row({
  item,
  maxSpent,
}: {
  item: HomeCategorySnapshotItem;
  maxSpent: number;
}) {
  const { name, color, spent, budget, percentSpent } = item;
  const hasBudget = budget > 0;
  const isOver = hasBudget && percentSpent > 100;
  // With a budget the bar shows budget usage; without one it compares to the biggest category.
  const fillWidth = hasBudget
    ? Math.min(100, percentSpent)
    : (spent / maxSpent) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="truncate text-base font-semibold">{name}</span>
          {isOver && (
            <span className="shrink-0 rounded-full bg-[var(--status-over)]/10 px-2 py-0.5 text-xs font-bold text-[var(--status-over)] tabular-nums">
              {Math.round(percentSpent)}%
            </span>
          )}
        </div>
        <div className="shrink-0 text-end">
          <span className="metric-sm">{formatCurrency(spent)}</span>
          {hasBudget && (
            <span className="ms-1.5 text-sm text-muted-foreground tabular-nums">
              / {formatCurrency(budget)}
            </span>
          )}
        </div>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.max(2, fillWidth)}%`,
            backgroundColor: isOver ? "var(--status-over)" : color,
          }}
        />
      </div>
    </div>
  );
}
