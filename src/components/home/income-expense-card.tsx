"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CardShell, CardAction } from "./card-shell";
import { getYearCompare } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";

const MONTHS = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יוני", "יולי", "אוג", "ספט", "אוק", "נוב", "דצמ"];

/**
 * Income and expense side by side per month. Income here is very uneven, so a
 * single average hides the months that actually ran a deficit.
 */
export function IncomeExpenseCard() {
  const year = new Date().getFullYear();
  const { data, isLoading } = useQuery({
    queryKey: ["year-compare", year],
    queryFn: () => getYearCompare(year),
  });

  if (isLoading || !data) {
    return (
      <CardShell label="הכנסות מול הוצאות">
        <Skeleton className="h-44 w-full rounded-lg" />
      </CardShell>
    );
  }

  // Only months that have actually happened; empty future months flatten the scale.
  const lastActive = Math.max(
    ...data.current.map((p, i) => (p.amount > 0 ? i : -1)),
    ...data.currentIncome.map((p, i) => (p.amount > 0 ? i : -1))
  );
  const months = data.current.slice(0, lastActive + 1);
  const max = Math.max(
    ...months.map((_, i) =>
      Math.max(data.current[i].amount, data.currentIncome[i]?.amount ?? 0)
    ),
    1
  );

  const deficits = months.filter(
    (m, i) => (data.currentIncome[i]?.amount ?? 0) < m.amount
  ).length;

  return (
    <CardShell
      label={`הכנסות מול הוצאות · ${year}`}
      action={<CardAction href="/insights">ניתוח מלא</CardAction>}
    >
      <div className="flex flex-1 flex-col justify-between gap-4">
        <div className="flex h-40 items-end gap-1.5" dir="ltr">
          {months.map((m, i) => {
            const inc = data.currentIncome[i]?.amount ?? 0;
            const deficit = inc < m.amount;
            return (
              <div
                key={m.month}
                className="flex h-full flex-1 items-end gap-[2px]"
                title={`${MONTHS[i]}: הכנסה ${formatCurrency(inc)} · הוצאה ${formatCurrency(m.amount)}`}
              >
                <span
                  className="flex-1 rounded-t-sm bg-[var(--status-on-track)]"
                  style={{ height: `${Math.max(1, (inc / max) * 100)}%` }}
                />
                <span
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: `${Math.max(1, (m.amount / max) * 100)}%`,
                    backgroundColor: deficit
                      ? "var(--status-over)"
                      : "var(--chart-1)",
                  }}
                />
              </div>
            );
          })}
        </div>

        <div>
          <div className="flex gap-1.5" dir="ltr">
            {months.map((_, i) => (
              <span
                key={i}
                className="flex-1 text-center text-[11px] text-muted-foreground"
              >
                {MONTHS[i]}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-[var(--status-on-track)]" />
                הכנסות
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-[var(--chart-1)]" />
                הוצאות
              </span>
            </div>
            {deficits > 0 && (
              <Link
                href="/insights"
                className="text-sm font-semibold"
                style={{ color: "var(--status-over)" }}
              >
                {deficits} חודשי גירעון
              </Link>
            )}
          </div>
        </div>
      </div>
    </CardShell>
  );
}
