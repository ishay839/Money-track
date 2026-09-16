"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getCoverage, type CoverageCell } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

const PROVIDER_LABELS: Record<string, string> = {
  hapoalim: "בנק הפועלים",
  beinleumi: "הבינלאומי",
  isracard: "ישראכרט",
  max: "מקס",
  "manual-excel": "אקסל ידני",
  leumi: "לאומי",
  mizrahi: "מזרחי",
  discount: "דיסקונט",
};

const label = (p: string) => PROVIDER_LABELS[p] ?? p;

/**
 * Month-by-source grid answering "did all my data actually get in?".
 * A gap in a provider's column is the thing worth seeing: it means the totals
 * for that month are understated, not that spending was low.
 */
export function CoveragePanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["coverage"],
    queryFn: getCoverage,
  });

  const model = useMemo(() => {
    if (!data) return null;
    const key = (m: string, p: string) => `${m}|${p}`;
    const byCell = new Map<string, CoverageCell>(
      data.cells.map((c) => [key(c.month, c.provider), c])
    );

    // Only months from a provider's own first sighting onward count as gaps:
    // before a bank was ever connected there is nothing to be missing.
    const firstSeen = new Map<string, string>();
    const lastSeen = new Map<string, string>();
    for (const c of data.cells) {
      const f = firstSeen.get(c.provider);
      if (!f || c.month < f) firstSeen.set(c.provider, c.month);
      const l = lastSeen.get(c.provider);
      if (!l || c.month > l) lastSeen.set(c.provider, c.month);
    }

    // Walk a continuous month axis, not just months that produced rows: a month
    // where nothing at all arrived has no cells and would otherwise vanish.
    const allMonths = [...data.months].sort();
    const months = allMonths.length
      ? monthsBetween(allMonths[0], allMonths[allMonths.length - 1])
          .reverse()
          .slice(0, 30)
      : [];
    const gaps: Array<{ month: string; provider: string }> = [];
    for (const m of months) {
      for (const p of data.providers) {
        const first = firstSeen.get(p);
        const last = lastSeen.get(p);
        if (!first || !last) continue;
        if (m < first || m > last) continue;
        if (!byCell.has(key(m, p))) gaps.push({ month: m, provider: p });
      }
    }

    // Months where no source at all reported.
    const emptyMonths = months.filter(
      (m) => !data.providers.some((p) => byCell.has(key(m, p)))
    );

    return {
      byCell,
      months,
      providers: data.providers,
      gaps,
      emptyMonths,
      firstSeen,
      lastSeen,
    };
  }, [data]);

  if (isLoading || !model) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }

  return (
    <div className="space-y-4">
      {model.emptyMonths.length > 0 && (
        <div
          className="surface p-4"
          style={{
            borderColor:
              "color-mix(in oklch, var(--status-over) 40%, var(--border))",
            backgroundColor:
              "color-mix(in oklch, var(--status-over) 6%, var(--card))",
          }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-over)]" />
            <div className="min-w-0">
              <div className="text-base font-bold">
                {model.emptyMonths.length} חודשים ריקים לחלוטין
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                באף מקור לא נמשכו תנועות בחודשים האלה. אם היו הוצאות - הן חסרות.
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {model.emptyMonths.map((m) => (
                  <li
                    key={m}
                    className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold tabular-nums"
                  >
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {model.gaps.length === 0 ? (
        <div className="surface flex items-center gap-3 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--status-on-track)]" />
          <span className="text-base font-semibold text-[var(--status-on-track)]">
            אין חודשים חסרים בטווח הפעילות של כל מקור
          </span>
        </div>
      ) : (
        <div
          className="surface p-4"
          style={{
            borderColor: "color-mix(in oklch, var(--status-heads-up) 40%, var(--border))",
            backgroundColor: "color-mix(in oklch, var(--status-heads-up) 6%, var(--card))",
          }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-heads-up)]" />
            <div className="min-w-0">
              <div className="text-base font-bold">
                {model.gaps.length} חודשים חסרים
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                חודש שחסר בו מקור נתונים יציג סכום נמוך מהמציאות. אלה החודשים
                שכדאי להשלים ידנית מהאתר של הגוף:
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {model.gaps.slice(0, 14).map((g) => (
                  <li
                    key={`${g.month}-${g.provider}`}
                    className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium tabular-nums"
                  >
                    {label(g.provider)} · {g.month}
                  </li>
                ))}
                {model.gaps.length > 14 && (
                  <li className="px-2 py-1 text-xs text-muted-foreground">
                    ועוד {model.gaps.length - 14}
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="surface overflow-x-auto">
        <table className="w-full text-[15px]">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3.5 text-start text-sm font-semibold text-muted-foreground">
                חודש
              </th>
              {model.providers.map((p) => (
                <th
                  key={p}
                  className="px-3 py-3.5 text-center text-sm font-semibold text-muted-foreground whitespace-nowrap"
                >
                  {label(p)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.months.map((m) => (
              <tr
                key={m}
                className="border-b border-border last:border-0 transition-colors hover:bg-accent/40"
              >
                <td className="px-4 py-2.5 text-sm font-semibold tabular-nums whitespace-nowrap">
                  {m}
                </td>
                {model.providers.map((p) => {
                  const cell = model.byCell.get(`${m}|${p}`);
                  const first = model.firstSeen.get(p);
                  const last = model.lastSeen.get(p);
                  const inRange = first && last && m >= first && m <= last;
                  return (
                    <td key={p} className="px-3 py-2.5 text-center">
                      {cell ? (
                        <span
                          className="inline-block min-w-9 rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums"
                          style={{
                            backgroundColor:
                              "color-mix(in oklch, var(--status-on-track) 14%, transparent)",
                            color: "var(--status-on-track)",
                          }}
                          title={`${cell.count} תנועות`}
                        >
                          {cell.count}
                        </span>
                      ) : inRange ? (
                        <span
                          className="inline-block min-w-9 rounded-md px-2 py-0.5 text-sm font-bold"
                          style={{
                            backgroundColor:
                              "color-mix(in oklch, var(--status-over) 14%, transparent)",
                            color: "var(--status-over)",
                          }}
                          title="חסר - לא נמשכו תנועות בחודש הזה"
                        >
                          חסר
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground/50">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground">
        המספר הוא כמות התנועות שנמשכו מאותו מקור באותו חודש. מקף אומר שהמקור לא
        היה מחובר עדיין (או כבר לא) - לא חוסר.
      </p>
    </div>
  );
}

/** Inclusive list of YYYY-MM strings between two months. */
function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
