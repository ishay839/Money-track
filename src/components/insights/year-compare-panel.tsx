"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getYearCompare } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import { Skeleton } from "@/components/ui/skeleton";
import { BigExpensesPanel } from "./big-expenses-panel";

const MONTH_NAMES = [
  "ינו",
  "פבר",
  "מרץ",
  "אפר",
  "מאי",
  "יוני",
  "יולי",
  "אוג",
  "ספט",
  "אוק",
  "נוב",
  "דצמ",
];

export function YearComparePanel() {
  const tCat = useTranslations("categoriesSeeded");
  const [year, setYear] = useState(() => new Date().getFullYear());

  const { data, isLoading } = useQuery({
    queryKey: ["year-compare", year],
    queryFn: () => getYearCompare(year),
  });

  const totals = useMemo(() => {
    if (!data) return null;
    const sum = (a: { amount: number }[]) => a.reduce((s, p) => s + p.amount, 0);
    // Only months that exist in both years are comparable; a partial current
    // year against a full previous one is a meaningless delta.
    const comparableMonths = data.current.filter(
      (c, i) => c.amount > 0 && data.previous[i]?.amount > 0
    ).length;
    return {
      current: sum(data.current),
      previous: sum(data.previous),
      currentIncome: sum(data.currentIncome),
      previousIncome: sum(data.previousIncome),
      comparableMonths,
    };
  }, [data]);

  if (isLoading || !data || !totals) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }

  const max = Math.max(
    ...data.current.map((p) => p.amount),
    ...data.previous.map((p) => p.amount),
    1
  );
  const delta = totals.current - totals.previous;
  const deltaPct =
    totals.previous > 0 ? (delta / totals.previous) * 100 : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex h-11 items-center gap-1 rounded-xl border border-border bg-card px-1">
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= new Date().getFullYear()}
            aria-label="לשנה הבאה"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <span className="min-w-28 text-center text-base font-bold tabular-nums">
            {year} מול {year - 1}
          </span>
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            aria-label="לשנה הקודמת"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={`הוצאות ${year}`} value={totals.current} />
        <Tile label={`הוצאות ${year - 1}`} value={totals.previous} muted />
        <Tile
          label="הפרש"
          value={Math.abs(delta)}
          prefix={delta >= 0 ? "+" : "−"}
          tone={delta >= 0 ? "var(--status-over)" : "var(--status-on-track)"}
          sub={deltaPct != null ? `${Math.abs(Math.round(deltaPct))}%` : undefined}
        />
        <Tile
          label={`הכנסות ${year}`}
          value={totals.currentIncome}
          tone="var(--status-on-track)"
        />
      </div>

      {totals.comparableMonths < 6 && (
        <p
          className="surface p-3 text-sm"
          style={{ color: "var(--status-heads-up)" }}
        >
          רק ל־{totals.comparableMonths} חודשים יש נתונים בשתי השנים. ההשוואה
          עדיין חלקית.
        </p>
      )}

      <div className="surface p-5">
        <h3 className="card-label mb-4">הוצאות לפי חודש</h3>
        <div className="flex h-56 items-end gap-2" dir="ltr">
          {data.current.map((cur, i) => {
            const prev = data.previous[i]?.amount ?? 0;
            return (
              <div
                key={cur.month}
                className="flex h-full flex-1 flex-col justify-end gap-1"
                title={`${MONTH_NAMES[i]}: ${formatCurrency(cur.amount)} מול ${formatCurrency(prev)}`}
              >
                <div className="flex h-full items-end gap-[2px]">
                  <span
                    className="flex-1 rounded-t-sm bg-[var(--chart-1)]"
                    style={{ height: `${Math.max(1, (cur.amount / max) * 100)}%` }}
                  />
                  <span
                    className="flex-1 rounded-t-sm bg-muted-foreground/35"
                    style={{ height: `${Math.max(1, (prev / max) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2" dir="ltr">
          {MONTH_NAMES.map((m) => (
            <span
              key={m}
              className="flex-1 text-center text-xs text-muted-foreground"
            >
              {m}
            </span>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-5 text-sm">
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-[var(--chart-1)]" />
            {year}
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-muted-foreground/35" />
            {year - 1}
          </span>
        </div>
      </div>

      <BigExpensesPanel year={year} />

      <div className="surface overflow-x-auto">
        <table className="w-full text-[15px]">
          <thead>
            <tr className="border-b border-border">
              {["קטגוריה", String(year), String(year - 1), "הפרש", ""].map((h, i) => (
                <th
                  key={i}
                  className="px-4 py-3.5 text-start text-sm font-semibold text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.categories.slice(0, 25).map((c) => {
              const d = c.current - c.previous;
              const pct =
                c.previous > 0 ? (d / c.previous) * 100 : null;
              return (
                <tr
                  key={c.categoryId}
                  className="border-b border-border last:border-0 transition-colors hover:bg-accent/40"
                >
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2.5">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="font-semibold">
                        {translateCategoryName(c.name, tCat)}
                      </span>
                    </span>
                  </td>
                  <td className="metric-sm px-4 py-3 whitespace-nowrap">
                    {formatCurrency(c.current)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                    {formatCurrency(c.previous)}
                  </td>
                  <td
                    className="px-4 py-3 whitespace-nowrap font-semibold tabular-nums"
                    style={{
                      color:
                        d > 0 ? "var(--status-over)" : "var(--status-on-track)",
                    }}
                  >
                    {d >= 0 ? "+" : "−"}
                    {formatCurrency(Math.abs(d))}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                    {pct != null ? `${pct >= 0 ? "+" : "−"}${Math.abs(Math.round(pct))}%` : "חדש"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  prefix,
  tone,
  muted,
}: {
  label: string;
  value: number;
  sub?: string;
  prefix?: string;
  tone?: string;
  muted?: boolean;
}) {
  return (
    <div className="surface p-5">
      <div className="card-label">{label}</div>
      <div
        className="metric-lg mt-2"
        style={{ color: tone ?? (muted ? "var(--muted-foreground)" : undefined) }}
      >
        {prefix}
        {formatCurrency(value)}
      </div>
      {sub && <div className="mt-1 text-sm text-muted-foreground">{sub}</div>}
    </div>
  );
}
