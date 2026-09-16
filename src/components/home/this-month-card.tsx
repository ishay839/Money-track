"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp } from "lucide-react";
import { CardShell, CardAction } from "./card-shell";
import { formatCurrency } from "@/lib/formatters";
import type { HomeThisMonth } from "@/lib/types";

interface Props {
  data: HomeThisMonth;
}

export function ThisMonthCard({ data }: Props) {
  const t = useTranslations("home");
  const {
    spent,
    budget,
    deltaVsLastMonth,
    daysUntilPayday,
    timeElapsedPercent,
    periodLabel,
    periodMode,
  } = data;
  const hasBudget = budget > 0;
  const percentSpent = hasBudget ? Math.min(100, (spent / budget) * 100) : 0;
  const pctSpent = hasBudget ? (spent / budget) * 100 : 0;
  const delta = pctSpent - timeElapsedPercent;
  const isOver = pctSpent > 100;
  const isHeadsUp = !isOver && delta >= 20;
  const isAhead = !isOver && delta <= -10;
  const remaining = budget - spent;

  let verdict = t("spentThisMonth");
  let verdictClass = "text-muted-foreground";
  if (hasBudget) {
    if (isOver) {
      verdict = t("verdictOver", { amount: formatCurrency(spent - budget) });
      verdictClass = "text-[var(--status-over)]";
    } else if (isHeadsUp) {
      verdict = t("verdictABitOver");
      verdictClass = "text-[var(--status-over)]";
    } else if (isAhead) {
      verdict = t("verdictAhead");
      verdictClass = "text-[var(--status-on-track)]";
    } else {
      verdict = t("verdictOnSchedule");
      verdictClass = "text-[var(--status-on-track)]";
    }
  }

  return (
    <CardShell
      label={periodLabel}
      action={<CardAction href="/budget">{t("expensesDetail")}</CardAction>}
    >
      <Link
        href="/budget"
        className="group -m-2 flex flex-1 flex-col justify-between gap-6 rounded-xl p-2 outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent"
      >
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="flex flex-col gap-2">
            <span className="metric-xl">{formatCurrency(spent)}</span>
            <span className={`text-base font-medium ${verdictClass}`}>
              {periodMode === "year" ? t("spentThisYear") : verdict}
            </span>
          </div>
          {deltaVsLastMonth != null && <DeltaPill value={deltaVsLastMonth} />}
        </div>

        {hasBudget && (
          <div className="space-y-3">
            <ProgressBar
              percent={percentSpent}
              markPercent={timeElapsedPercent}
              isOver={isOver}
            />
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <Stat
                label="מתוך התקציב"
                value={`${Math.round(pctSpent)}%`}
                sub={formatCurrency(budget)}
              />
              <Stat
                label={remaining >= 0 ? "נותר" : "חריגה"}
                value={formatCurrency(Math.abs(remaining))}
                valueClass={
                  remaining >= 0
                    ? "text-[var(--status-on-track)]"
                    : "text-[var(--status-over)]"
                }
              />
              {periodMode === "month" && (
                <Stat label="ימים למשכורת" value={String(daysUntilPayday)} />
              )}
            </div>
          </div>
        )}

        {!hasBudget && periodMode === "month" && (
          <div className="metric-caption">
            {t("daysToPayday", { days: daysUntilPayday })}
          </div>
        )}
      </Link>
    </CardShell>
  );
}

function Stat({
  label,
  value,
  sub,
  valueClass = "",
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className={`metric-sm ${valueClass}`}>{value}</span>
        {sub && <span className="text-sm text-muted-foreground tabular-nums">/ {sub}</span>}
      </span>
    </div>
  );
}

function DeltaPill({ value }: { value: number }) {
  const t = useTranslations("home");
  const rounded = Math.round(value);
  const isUp = rounded > 0;
  const isFlat = rounded === 0;
  const Icon = isUp ? ArrowUp : ArrowDown;
  const cls = isFlat
    ? "text-muted-foreground bg-muted"
    : isUp
      ? "text-[var(--status-over)] bg-[var(--status-over)]/10"
      : "text-[var(--status-on-track)] bg-[var(--status-on-track)]/10";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-base font-semibold tabular-nums ${cls}`}
      title={t("comparedToLastMonth")}
    >
      {!isFlat && <Icon className="h-4 w-4" />}
      {t("vsLastMonth", { percent: Math.abs(rounded) })}
    </span>
  );
}

function ProgressBar({
  percent,
  markPercent,
  isOver,
}: {
  percent: number;
  markPercent: number;
  isOver: boolean;
}) {
  const fillClass = isOver
    ? "bg-[var(--status-over)]"
    : "bg-[var(--status-on-track)]";
  return (
    <div className="relative h-4 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${fillClass}`}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-foreground/70"
        style={{ insetInlineStart: `${Math.min(100, Math.max(0, markPercent))}%` }}
        aria-hidden
        title="קצב הזמן שחלף"
      />
    </div>
  );
}
