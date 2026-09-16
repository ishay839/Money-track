"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CardShell, CardAction } from "./card-shell";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import type { HomeRecentTransaction } from "@/lib/types";

interface Props {
  items: HomeRecentTransaction[];
}

export function RecentTransactionsCard({ items }: Props) {
  const t = useTranslations("home");
  const tCat = useTranslations("categoriesSeeded");
  if (items.length === 0) {
    return (
      <CardShell label={t("recentActivity")}>
        <div className="flex flex-1 items-center justify-center py-6 text-base text-muted-foreground">
          {t("noTransactionsYet")}
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell
      label={t("recentActivity")}
      action={<CardAction href="/transactions">{t("allTransactions")}</CardAction>}
    >
      <ul className="-mx-2 flex flex-1 flex-col divide-y divide-border">
        {items.map((txn) => (
          <li key={txn.id}>
            <Link
              href="/transactions"
              className="row-hover flex items-center gap-3 px-2 py-3"
            >
              <span className="w-12 shrink-0 text-sm font-medium text-muted-foreground tabular-nums">
                {formatDayMonth(txn.date)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold">
                  {txn.description}
                </div>
                {txn.categoryName ? (
                  <CategoryBadge
                    name={translateCategoryName(txn.categoryName, tCat)}
                    color={txn.categoryColor}
                  />
                ) : (
                  <span className="mt-0.5 inline-block text-sm font-medium text-[var(--status-heads-up)]">
                    {t("uncategorized")}
                  </span>
                )}
              </div>
              <span
                className={`shrink-0 text-base font-bold tabular-nums ${
                  txn.kind === "income"
                    ? "text-[var(--status-on-track)]"
                    : "text-foreground"
                }`}
              >
                {txn.kind === "income" ? "+" : "−"}
                {formatCurrency(txn.chargedAmount)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

function CategoryBadge({
  name,
  color,
}: {
  name: string;
  color: string | null;
}) {
  return (
    <span className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      {color && (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}

function formatDayMonth(iso: string): string {
  const formatted = formatDate(iso); // DD/MM/YYYY
  const parts = formatted.split("/");
  return `${parts[0]}/${parts[1]}`;
}
