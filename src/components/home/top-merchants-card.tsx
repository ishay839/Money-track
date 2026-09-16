"use client";

import { useTranslations } from "next-intl";
import { CardShell } from "./card-shell";
import { formatCurrency } from "@/lib/formatters";
import type { HomeTopMerchant } from "@/lib/types";

interface Props {
  items: HomeTopMerchant[];
}

export function TopMerchantsCard({ items }: Props) {
  const t = useTranslations("home");
  if (items.length === 0) {
    return (
      <CardShell label={t("topMerchants")}>
        <div className="flex flex-1 items-center justify-center py-6 text-base text-muted-foreground">
          {t("noSpendingMonth")}
        </div>
      </CardShell>
    );
  }

  const max = items[0]?.total ?? 0;

  return (
    <CardShell label={t("topMerchantsMonth")}>
      <ul className="flex flex-1 flex-col justify-around gap-3">
        {items.map((m, i) => {
          const widthPct = max > 0 ? (m.total / max) * 100 : 0;
          return (
            <li key={`${m.name}-${i}`} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="w-4 shrink-0 text-sm font-bold text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <span className="truncate text-base font-semibold">{m.name}</span>
                </span>
                <span className="shrink-0 metric-sm">{formatCurrency(m.total)}</span>
              </div>
              <div className="flex items-center gap-2.5 ps-6">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[var(--chart-1)] transition-[width] duration-500"
                    style={{ width: `${Math.max(2, widthPct)}%` }}
                  />
                </div>
                <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                  {m.count} {m.count === 1 ? t("txnsOne") : t("txnsOther")}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </CardShell>
  );
}
