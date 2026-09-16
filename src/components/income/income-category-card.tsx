"use client";

import { formatCurrency } from "@/lib/formatters";
import type { IncomeCategoryRow } from "@/lib/api";

/**
 * One income category, shaped like the expense category card so the two pages
 * feel like the same product. Where the expense card asks "how much of the
 * budget is left", this one asks "how big a share is this, and is it steady".
 */
export function IncomeCategoryCard({
  data,
  share,
  displayName,
  onClick,
}: {
  data: IncomeCategoryRow;
  share: number;
  displayName: string;
  onClick: () => void;
}) {
  const delta = data.received - data.previous;
  const deltaPct =
    data.previous > 0 ? (delta / data.previous) * 100 : null;
  const isNew = data.previous === 0 && data.received > 0;
  // Paid in at least three of the months it could have: steady rather than a
  // one-time arrival.
  const steady = data.activeMonths >= 3;

  return (
    <button
      type="button"
      onClick={onClick}
      className="surface group flex h-full w-full cursor-pointer flex-col p-5 text-start transition-colors duration-200 ease-out hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className="mt-1 h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: data.color }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-base font-semibold leading-tight">
                {displayName}
              </span>
              {steady ? (
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{
                    backgroundColor:
                      "color-mix(in oklch, var(--status-on-track) 14%, transparent)",
                    color: "var(--status-on-track)",
                  }}
                  title={`התקבל ב-${data.activeMonths} חודשים שונים`}
                >
                  קבוע
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  חד-פעמי
                </span>
              )}
            </div>
            <div className="mt-1 truncate text-sm text-muted-foreground">
              {data.count} {data.count === 1 ? "תקבול" : "תקבולים"}
              {data.topSource ? ` · בעיקר ${data.topSource}` : ""}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-end">
          <div className="metric-sm">{Math.round(share)}%</div>
          <div className="text-xs text-muted-foreground">מסך ההכנסות</div>
        </div>
      </div>

      <div className="mt-4 flex-1">
        <div className="metric-lg" style={{ color: "var(--status-on-track)" }}>
          {formatCurrency(data.received)}
        </div>
        <div className="mt-1.5 text-sm">
          {isNew ? (
            <span className="font-medium text-[var(--status-on-track)]">
              חדש החודש
            </span>
          ) : deltaPct != null && Math.round(deltaPct) !== 0 ? (
            <span
              className="font-medium tabular-nums"
              style={{
                color:
                  delta > 0
                    ? "var(--status-on-track)"
                    : "var(--status-over)",
              }}
            >
              {delta > 0 ? "↑" : "↓"} {Math.abs(Math.round(deltaPct))}% לעומת{" "}
              {formatCurrency(data.previous)}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {data.previous > 0
                ? `כמו החודש הקודם (${formatCurrency(data.previous)})`
                : "אין נתוני השוואה"}
            </span>
          )}
        </div>
      </div>

      {/* share of total income */}
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.max(2, Math.min(100, share))}%`,
            backgroundColor: data.color,
          }}
        />
      </div>
    </button>
  );
}
