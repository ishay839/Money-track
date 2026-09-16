"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { CardShell, CardAction } from "./card-shell";
import { formatCurrency } from "@/lib/formatters";
import type { HomeCashFlow, HomeThisMonth } from "@/lib/types";

interface Props {
  cashFlow: HomeCashFlow;
  thisMonth: HomeThisMonth;
  /** Same period's income a month/year earlier, when known. */
  deltaVsPrevious?: number | null;
}

/**
 * Income headline for the selected period, deliberately the same shape and
 * weight as the expense card next to it, so the two read as a pair rather than
 * income being an afterthought.
 */
export function ThisMonthIncomeCard({ cashFlow, thisMonth, deltaVsPrevious }: Props) {
  const { income, expenses, net } = cashFlow;
  const netPositive = net >= 0;
  const coverage = expenses > 0 ? (income / expenses) * 100 : null;

  return (
    <CardShell
      label={`הכנסות · ${thisMonth.periodLabel}`}
      action={<CardAction href="/transactions">כל ההכנסות</CardAction>}
    >
      <Link
        href="/transactions"
        className="group -m-2 flex flex-1 flex-col justify-between gap-6 rounded-xl p-2 outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent"
      >
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="flex flex-col gap-2">
            <span
              className="metric-xl"
              style={{ color: "var(--status-on-track)" }}
            >
              {formatCurrency(income)}
            </span>
            <span className="text-base font-medium text-muted-foreground">
              {netPositive
                ? `נותרו ${formatCurrency(net)} אחרי ההוצאות`
                : `חסרים ${formatCurrency(Math.abs(net))} לכיסוי ההוצאות`}
            </span>
          </div>
          {deltaVsPrevious != null && <DeltaPill value={deltaVsPrevious} />}
        </div>

        {coverage != null && (
          <div className="space-y-3">
            <CoverageBar percent={coverage} />
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <Stat
                label="כיסוי ההוצאות"
                value={`${Math.round(coverage)}%`}
                valueClass={
                  coverage >= 100
                    ? "text-[var(--status-on-track)]"
                    : "text-[var(--status-over)]"
                }
              />
              <Stat label="הוצאות" value={formatCurrency(expenses)} />
              <Stat
                label={netPositive ? "עודף" : "גירעון"}
                value={formatCurrency(Math.abs(net))}
                valueClass={
                  netPositive
                    ? "text-[var(--status-on-track)]"
                    : "text-[var(--status-over)]"
                }
              />
            </div>
          </div>
        )}
      </Link>
    </CardShell>
  );
}

function Stat({
  label,
  value,
  valueClass = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className={`metric-sm ${valueClass}`}>{value}</span>
    </div>
  );
}

function DeltaPill({ value }: { value: number }) {
  const rounded = Math.round(value);
  const isUp = rounded > 0;
  const isFlat = rounded === 0;
  const Icon = isUp ? ArrowUp : ArrowDown;
  // For income, up is good: the opposite of the expense card.
  const cls = isFlat
    ? "text-muted-foreground bg-muted"
    : isUp
      ? "text-[var(--status-on-track)] bg-[var(--status-on-track)]/10"
      : "text-[var(--status-over)] bg-[var(--status-over)]/10";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-base font-semibold tabular-nums ${cls}`}
      title="לעומת התקופה הקודמת"
    >
      {!isFlat && <Icon className="h-4 w-4" />}
      {Math.abs(rounded)}% לעומת התקופה הקודמת
    </span>
  );
}

/** How far the income goes toward covering the period's expenses. */
function CoverageBar({ percent }: { percent: number }) {
  const capped = Math.min(100, Math.max(0, percent));
  const over = percent >= 100;
  return (
    <div className="relative h-4 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${capped}%`,
          backgroundColor: over
            ? "var(--status-on-track)"
            : "var(--status-heads-up)",
        }}
      />
    </div>
  );
}
