"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCategoryHistory } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  categoryId: number;
  /** Month currently shown by the sheet, as YYYY-MM. */
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
  color: string;
  /** Draw the same month a year earlier behind each bar. */
  compareToLastYear: boolean;
}

const MONTHS_SHOWN = 18;

/**
 * Spend per month for one category, going back far enough to see a trend.
 * Clicking a bar moves the whole sheet to that month, which is how the user
 * scrolls back through history.
 */
export function CategoryHistoryChart({
  categoryId,
  selectedMonth,
  onSelectMonth,
  color,
  compareToLastYear,
}: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["category-history", categoryId],
    queryFn: () => getCategoryHistory(categoryId, 36),
  });

  const points = useMemo(() => {
    const all = data?.history ?? [];
    const byMonth = new Map(all.map((h) => [h.month, h]));
    const recent = all.slice(-MONTHS_SHOWN);
    return recent.map((h) => {
      const [y, m] = h.month.split("-").map(Number);
      const lastYear = `${y - 1}-${String(m).padStart(2, "0")}`;
      return {
        ...h,
        priorAmount: byMonth.get(lastYear)?.amount ?? 0,
        label: monthLabel(h.month),
      };
    });
  }, [data]);

  if (isLoading) return <Skeleton className="h-40 w-full rounded-lg" />;
  if (points.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        אין מספיק היסטוריה להצגה
      </div>
    );
  }

  const max = Math.max(
    ...points.map((p) => Math.max(p.amount, compareToLastYear ? p.priorAmount : 0)),
    1
  );
  const active = points.find((p) => p.month === selectedMonth);
  const avg = points.reduce((s, p) => s + p.amount, 0) / points.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="metric-lg">
          {formatCurrency(active?.amount ?? 0)}
        </span>
        <span className="text-sm font-medium text-muted-foreground">
          {active ? active.label : monthLabel(selectedMonth)}
          {active ? ` · ${active.count} תנועות` : ""}
        </span>
        {compareToLastYear && active && active.priorAmount > 0 && (
          <YoYBadge current={active.amount} prior={active.priorAmount} />
        )}
      </div>

      {/* LTR so month order reads left-to-right like every other chart here */}
      <div className="relative flex h-40 items-end gap-[3px]" dir="ltr">
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/25"
          style={{ bottom: `${(avg / max) * 100}%` }}
          aria-hidden
        />
        {points.map((p) => {
          const isActive = p.month === selectedMonth;
          return (
            <button
              key={p.month}
              type="button"
              onClick={() => onSelectMonth(p.month)}
              title={`${p.label}: ${formatCurrency(p.amount)}`}
              aria-label={`${p.label}: ${formatCurrency(p.amount)}`}
              aria-pressed={isActive}
              className="group relative flex h-full flex-1 cursor-pointer flex-col justify-end rounded-t outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {compareToLastYear && p.priorAmount > 0 && (
                <span
                  className="absolute bottom-0 w-full rounded-t-sm border border-dashed"
                  style={{
                    height: `${(p.priorAmount / max) * 100}%`,
                    borderColor: color,
                    opacity: 0.5,
                  }}
                  aria-hidden
                />
              )}
              <span
                className="relative w-full rounded-t-sm transition-all"
                style={{
                  height: `${Math.max(2, (p.amount / max) * 100)}%`,
                  backgroundColor: color,
                  opacity: isActive ? 1 : 0.38,
                }}
              />
            </button>
          );
        })}
      </div>

      <div className="flex gap-[3px]" dir="ltr">
        {points.map((p) => (
          <span
            key={p.month}
            dir="rtl"
            className={`flex-1 overflow-hidden text-center text-[10px] whitespace-nowrap ${
              p.month === selectedMonth
                ? "font-bold text-foreground"
                : "text-muted-foreground"
            }`}
          >
            {shortMonth(p.month)}
          </span>
        ))}
      </div>
    </div>
  );
}

function YoYBadge({ current, prior }: { current: number; prior: number }) {
  const pct = ((current - prior) / prior) * 100;
  const rounded = Math.round(pct);
  if (rounded === 0) {
    return (
      <span className="text-sm font-medium text-muted-foreground">
        כמו אשתקד
      </span>
    );
  }
  const up = rounded > 0;
  return (
    <span
      className="text-sm font-semibold tabular-nums"
      style={{ color: up ? "var(--status-over)" : "var(--status-on-track)" }}
      title={`אשתקד: ${formatCurrency(prior)}`}
    >
      {up ? "▲" : "▼"} {Math.abs(rounded)}% מול אשתקד
    </span>
  );
}

/** Just the month number, so 18 labels fit without colliding. */
function shortMonth(month: string): string {
  const [, m] = month.split("-").map(Number);
  return m === 1 ? month.slice(2, 4) + "׳" : String(m);
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("he-IL", {
    month: "short",
    year: "2-digit",
  });
}
