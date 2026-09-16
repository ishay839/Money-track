"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { TrendingUp, TrendingDown } from "lucide-react";
import { getRecurring, type RecurringCharge } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Charges that repeat month after month. These are the commitments that leave
 * the account whether or not any decision is made, so seeing them separately
 * from discretionary spending is the point.
 *
 * "Recurring" here means observed to repeat, not declared fixed: an amount that
 * moves every month still shows up, with its drift called out.
 */
export function RecurringPanel() {
  const tCat = useTranslations("categoriesSeeded");
  const [minMonths, setMinMonths] = useState(4);

  const { data, isLoading } = useQuery({
    queryKey: ["recurring", minMonths],
    queryFn: () => getRecurring(minMonths),
  });

  const [view, setView] = useState<"fixed" | "variable">("fixed");

  const { fixed, variable, fixedTotal, staleTotal, staleCount, drifting } =
    useMemo(() => {
      const all = data?.items ?? [];
      const f = all.filter((r) => r.isFixed);
      const v = all.filter((r) => !r.isFixed);
      // Only charges still running count toward what leaves next month: a lease
      // that ended in July is not a commitment for September.
      const live = f.filter((r) => !r.isStale);
      const stale = f.filter((r) => r.isStale);
      const total = live.reduce((s, r) => s + (r.lastAmount || r.avgAmount), 0);
      const staleSum = stale.reduce(
        (s, r) => s + (r.lastAmount || r.avgAmount),
        0
      );
      const drift = all.filter(
        (r) => r.driftPercent != null && Math.abs(r.driftPercent) >= 15
      );
      return {
        fixed: f,
        variable: v,
        fixedTotal: total,
        staleTotal: staleSum,
        staleCount: stale.length,
        drifting: drift,
      };
    }, [data]);

  const items = view === "fixed" ? fixed : variable;

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface p-5">
          <div className="card-label">התחייבויות קבועות</div>
          <div className="metric-lg mt-2">{formatCurrency(fixedTotal)}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {fixed.length - staleCount} חיובים פעילים בסכום יציב
          </div>
          {staleCount > 0 && (
            <div
              className="mt-1.5 text-sm font-medium"
              style={{ color: "var(--status-heads-up)" }}
            >
              לא נכללו {staleCount} שנפסקו ({formatCurrency(staleTotal)})
            </div>
          )}
        </div>
        <div className="surface p-5">
          <div className="card-label">חוזרים בסכום משתנה</div>
          <div className="metric-lg mt-2">{variable.length}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            חוזרים כל חודש אבל הסכום קופץ
          </div>
        </div>
        <div className="surface p-5">
          <div className="card-label">שינו סכום</div>
          <div
            className="metric-lg mt-2"
            style={{
              color: drifting.length
                ? "var(--status-heads-up)"
                : "var(--status-on-track)",
            }}
          >
            {drifting.length}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            סטייה של 15%+ מהרגיל
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["fixed", `קבועים (${fixed.length})`],
            ["variable", `משתנים (${variable.length})`],
          ] as const
        ).map(([id, lbl]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              view === id
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {lbl}
          </button>
        ))}
        <span className="ms-2 text-sm font-semibold text-muted-foreground">
          מינימום חודשים:
        </span>
        {[3, 4, 6, 9].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setMinMonths(n)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              minMonths === n
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="surface overflow-x-auto">
        <table className="w-full text-[15px]">
          <thead>
            <tr className="border-b border-border">
              {["חיוב", "קטגוריה", "חודשים", "אחרון", "טווח", "שינוי"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3.5 text-start text-sm font-semibold text-muted-foreground whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-base text-muted-foreground">
                  לא זוהו חיובים חוזרים בטווח הזה
                </td>
              </tr>
            ) : (
              [...items]
                .sort((a, b) => Number(a.isStale) - Number(b.isStale))
                .map((r) => <Row key={r.description} r={r} tCat={tCat} />)
            )}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground">
        "קבוע" נקבע לפי יציבות הסכום (פער של עד 25% בין הנמוך לגבוה), לא לפי סוג
        החיוב. חיוב שחוזר כל חודש בסכום אחר יופיע תחת "משתנים" - הוא לא באמת
        התחייבות קבועה. חיוב שלא נראה מעל חודשיים מסומן "נפסק" ולא נספר בסכום
        החודשי.
      </p>
    </div>
  );
}

function Row({
  r,
  tCat,
}: {
  r: RecurringCharge;
  tCat: ReturnType<typeof useTranslations<"categoriesSeeded">>;
}) {
  const varies = r.maxAmount - r.minAmount > 1;
  const drifted = r.driftPercent != null && Math.abs(r.driftPercent) >= 15;
  return (
    <tr className="border-b border-border last:border-0 transition-colors hover:bg-accent/40">
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{r.description}</span>
          {r.isStale && (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-bold"
              style={{
                backgroundColor:
                  "color-mix(in oklch, var(--status-heads-up) 16%, transparent)",
                color: "var(--status-heads-up)",
              }}
              title={`לא חויב כבר ${r.daysSinceLast} ימים`}
            >
              נפסק
            </span>
          )}
        </div>
        <div className="mt-0.5 text-sm text-muted-foreground tabular-nums">
          אחרון: {formatDate(r.lastDate)}
        </div>
      </td>
      <td className="px-4 py-3">
        {r.categoryName ? (
          <span className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: r.categoryColor ?? undefined }}
            />
            <span className="text-sm">
              {translateCategoryName(r.categoryName, tCat)}
            </span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3 tabular-nums">{r.months}</td>
      <td className="metric-sm px-4 py-3 whitespace-nowrap">
        {formatCurrency(r.lastAmount)}
      </td>
      <td className="px-4 py-3 text-sm whitespace-nowrap tabular-nums text-muted-foreground">
        {varies
          ? `${formatCurrency(r.minAmount)} – ${formatCurrency(r.maxAmount)}`
          : "קבוע"}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {r.driftPercent == null ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <span
            className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums"
            style={{
              color: drifted
                ? r.driftPercent > 0
                  ? "var(--status-over)"
                  : "var(--status-on-track)"
                : "var(--muted-foreground)",
            }}
          >
            {drifted &&
              (r.driftPercent > 0 ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              ))}
            {r.driftPercent >= 0 ? "+" : "−"}
            {Math.abs(Math.round(r.driftPercent))}%
          </span>
        )}
      </td>
    </tr>
  );
}
