"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { getTrack } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { MODE_LABEL } from "./tracks-page";

const MONTHS = [
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

/**
 * One track in full: the year's net, a month-by-month bar of income against
 * expenses, what the money went to, and the movements behind it.
 */
export function TrackDetailSheet({
  trackId,
  year,
  onClose,
  translate,
}: {
  trackId: number | null;
  year: number;
  onClose: () => void;
  translate: (name: string) => string;
}) {
  return (
    <Sheet open={trackId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full p-0 sm:max-w-xl! md:max-w-2xl! lg:max-w-[42vw]!"
      >
        {trackId !== null && (
          <Body trackId={trackId} year={year} translate={translate} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Body({
  trackId,
  year,
  translate,
}: {
  trackId: number;
  year: number;
  translate: (name: string) => string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["track", trackId, year],
    queryFn: () => getTrack(trackId, year),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const { track, history, breakdown, transactions } = data;
  const positive = track.net >= 0;
  const max = Math.max(
    ...history.map((h) => Math.max(h.income, h.expenses)),
    1
  );
  const incomeRows = breakdown.filter((b) => b.kind === "income");
  const expenseRows = breakdown.filter((b) => b.kind !== "income");

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <SheetHeader
        className="gap-2 p-6 pb-5"
        style={{
          background: `color-mix(in oklch, ${track.color} 14%, var(--card))`,
        }}
      >
        <div className="card-label">מסלול · {MODE_LABEL[track.mode]}</div>
        <SheetTitle className="text-xl font-bold tracking-tight">
          {track.name}
        </SheetTitle>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <Stat
            label="הכנסות"
            value={formatCurrency(track.income)}
            tone="var(--status-on-track)"
          />
          <Stat
            label="הוצאות"
            value={formatCurrency(track.expenses)}
            tone="var(--status-over)"
          />
          <Stat
            label="נטו"
            value={`${positive ? "+" : "−"}${formatCurrency(Math.abs(track.net))}`}
            tone={positive ? "var(--status-on-track)" : "var(--status-over)"}
          />
        </div>
      </SheetHeader>

      <div className="space-y-5 p-6 pt-4">
        <section className="surface p-5">
          <h3 className="card-label mb-3">הכנסות מול הוצאות · {year}</h3>
          <div className="flex h-36 items-end gap-1.5" dir="ltr">
            {history.map((h) => (
              <div
                key={h.month}
                className="flex h-full flex-1 items-end gap-0.5"
                title={`${h.month}: הכנסות ${formatCurrency(h.income)} · הוצאות ${formatCurrency(h.expenses)}`}
              >
                <span
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: `${Math.max(1, (h.income / max) * 100)}%`,
                    backgroundColor: "var(--status-on-track)",
                  }}
                />
                <span
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: `${Math.max(1, (h.expenses / max) * 100)}%`,
                    backgroundColor: "var(--status-over)",
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5" dir="ltr">
            {history.map((h) => (
              <span
                key={h.month}
                className="flex-1 text-center text-[10px] text-muted-foreground"
              >
                {MONTHS[Number(h.month.split("-")[1]) - 1]}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <Legend color="var(--status-on-track)" label="הכנסות" />
            <Legend color="var(--status-over)" label="הוצאות" />
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <BreakdownList
            title="מאיפה נכנס"
            rows={incomeRows}
            tone="var(--status-on-track)"
            translate={translate}
          />
          <BreakdownList
            title="לאן יצא"
            rows={expenseRows}
            tone="var(--status-over)"
            translate={translate}
          />
        </div>

        <section>
          <h3 className="mb-2 text-sm font-semibold">
            תנועות · {transactions.length}
          </h3>
          <div className="surface overflow-hidden">
            {transactions.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                אין תנועות במסלול בשנה הזו.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {transactions.map((t) => {
                  const isIncome = t.kind === "income";
                  return (
                    <li
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="break-words text-[15px] font-semibold">
                          {t.description}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span className="tabular-nums">
                            {formatDate(t.date)}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: t.categoryColor }}
                            />
                            {translate(t.categoryName)}
                          </span>
                        </div>
                      </div>
                      <div
                        className="metric-sm shrink-0"
                        style={{
                          color: isIncome
                            ? "var(--status-on-track)"
                            : "var(--status-over)",
                        }}
                      >
                        {isIncome ? "+" : "−"}
                        {formatCurrency(Math.abs(t.amount))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function BreakdownList({
  title,
  rows,
  tone,
  translate,
}: {
  title: string;
  rows: Array<{
    categoryId: number;
    name: string;
    color: string;
    total: number;
    count: number;
  }>;
  tone: string;
  translate: (name: string) => string;
}) {
  const max = Math.max(...rows.map((r) => r.total), 1);
  return (
    <section className="surface p-5">
      <h3 className="card-label mb-3" style={{ color: tone }}>
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">אין נתונים.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.categoryId} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-semibold">
                  {translate(r.name)}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums">
                  {formatCurrency(r.total)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, (r.total / max) * 100)}%`,
                    backgroundColor: r.color,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-3 w-3 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl bg-background/60 p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="metric-sm mt-0.5" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}
