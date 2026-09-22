"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/app-shell";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { Skeleton } from "@/components/ui/skeleton";
import { getIncomeSummary, type IncomeCategoryRow } from "@/lib/api";
import { addMonths, formatMonthLabel, getMonthRange, formatCurrency, formatDate } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import { useSelectedMonth, isCurrentMonth } from "@/lib/selected-month";
import { IncomeCategoryCard } from "./income-category-card";
import { IncomeDetailSheet } from "./income-detail-sheet";
import type { Locale } from "@/i18n/routing";

const MONTHS = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יוני", "יולי", "אוג", "ספט", "אוק", "נוב", "דצמ"];

/**
 * The income counterpart to the expenses page: same structure (headline,
 * breakdown chart, per-category cards) so the two read as a matched pair.
 * The questions differ though - for income what matters is how much of it is
 * dependable, and who it actually comes from.
 */
export function IncomePage() {
  const locale = useLocale() as Locale;
  const tCat = useTranslations("categoriesSeeded");
  // null from the shared store means "no explicit choice" - this page treats
  // that as the current month.
  const { selectedDate: storedDate, setSelectedDate } = useSelectedMonth();
  const selectedDate = storedDate ?? new Date();
  const { from, to } = getMonthRange(selectedDate);
  const monthLabel = formatMonthLabel(selectedDate, locale);

  const { data, isLoading } = useQuery({
    queryKey: ["income-summary", from, to],
    queryFn: () => getIncomeSummary({ from, to }),
  });

  return (
    <>
      <PageHeader
        title="הכנסות"
        meta={monthLabel}
        actions={
          <PeriodSelector
            label={monthLabel}
            isCurrent={isCurrentMonth(selectedDate)}
              onCurrent={() => setSelectedDate(null)}
              onPrev={() => setSelectedDate(addMonths(selectedDate, -1))}
            onNext={() => setSelectedDate(addMonths(selectedDate, 1))}
          />
        }
      />

      <div className="space-y-6 p-4 md:p-6 lg:p-8">
        {isLoading || !data ? (
          <>
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </>
        ) : (
          <>
            <HeroSection data={data} monthLabel={monthLabel} />
            <StabilitySection data={data} />
            <SourcesSection data={data} />
            <CategoriesSection
              categories={data.categories}
              total={data.total}
              from={from}
              to={to}
              tCat={tCat}
            />
          </>
        )}
      </div>
    </>
  );
}

type Summary = NonNullable<Awaited<ReturnType<typeof getIncomeSummary>>>;

function HeroSection({ data, monthLabel }: { data: Summary; monthLabel: string }) {
  const delta = data.total - data.previousTotal;
  const deltaPct =
    data.previousTotal > 0 ? (delta / data.previousTotal) * 100 : null;

  const latest = data.stability[data.stability.length - 1];
  const recurringShare =
    latest && data.total > 0
      ? (latest.recurring / (latest.recurring + latest.oneOff)) * 100
      : null;

  const max = Math.max(...data.history.map((h) => h.amount), 1);

  return (
    <div className="surface p-6 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="card-label">סך ההכנסות · {monthLabel}</div>
          <div
            className="metric-xl mt-2"
            style={{ color: "var(--status-on-track)" }}
          >
            {formatCurrency(data.total)}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="text-base text-muted-foreground">
              {data.transactionCount} תקבולים
            </span>
            {deltaPct != null && Math.round(deltaPct) !== 0 && (
              <span
                className="text-base font-semibold tabular-nums"
                style={{
                  color:
                    delta > 0
                      ? "var(--status-on-track)"
                      : "var(--status-over)",
                }}
                title={`חודש קודם: ${formatCurrency(data.previousTotal)}`}
              >
                {delta > 0 ? "▲" : "▼"} {Math.abs(Math.round(deltaPct))}% מהחודש
                הקודם
              </span>
            )}
          </div>
        </div>

        {recurringShare != null && (
          <div className="min-w-44">
            <div className="card-label">מזה קבוע</div>
            <div className="metric-lg mt-2">{Math.round(recurringShare)}%</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {formatCurrency(latest.recurring)} חוזר ·{" "}
              {formatCurrency(latest.oneOff)} חד-פעמי
            </div>
          </div>
        )}
      </div>

      {/* 12-month income history */}
      <div className="mt-6">
        <div className="card-label mb-3">12 החודשים האחרונים</div>
        <div className="flex h-28 items-end gap-1.5" dir="ltr">
          {data.history.map((h, i) => {
            const isLast = i === data.history.length - 1;
            return (
              <div
                key={h.month}
                className="flex h-full flex-1 flex-col justify-end"
                title={`${h.month}: ${formatCurrency(h.amount)}`}
              >
                <span
                  className="w-full rounded-t-sm"
                  style={{
                    height: `${Math.max(2, (h.amount / max) * 100)}%`,
                    backgroundColor: "var(--status-on-track)",
                    opacity: isLast ? 1 : 0.4,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-1.5" dir="ltr">
          {data.history.map((h) => (
            <span
              key={h.month}
              className="flex-1 text-center text-[10px] text-muted-foreground"
            >
              {MONTHS[Number(h.month.split("-")[1]) - 1]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Recurring vs one-off, stacked, so a windfall month is obvious. */
function StabilitySection({ data }: { data: Summary }) {
  const max = Math.max(
    ...data.stability.map((s) => s.recurring + s.oneOff),
    1
  );
  return (
    <div className="surface p-5 md:p-6">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-lg font-bold tracking-tight">יציבות ההכנסה</h3>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-[var(--status-on-track)]" />
            חוזר
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-[var(--chart-3)]" />
            חד-פעמי
          </span>
        </div>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        מקור שהופיע ב-3 חודשים שונים ומעלה נחשב חוזר. מה שמעליו הוא בונוס - נחמד,
        אבל אי אפשר לתכנן עליו.
      </p>
      <div className="flex h-40 items-end gap-2" dir="ltr">
        {data.stability.map((s) => {
          const total = s.recurring + s.oneOff;
          return (
            <div
              key={s.month}
              className="flex h-full flex-1 flex-col justify-end"
              title={`${s.month}: חוזר ${formatCurrency(s.recurring)} · חד-פעמי ${formatCurrency(s.oneOff)}`}
            >
              <span
                className="w-full rounded-t-sm bg-[var(--chart-3)]"
                style={{ height: `${(s.oneOff / max) * 100}%` }}
              />
              <span
                className="w-full bg-[var(--status-on-track)]"
                style={{ height: `${(s.recurring / max) * 100}%` }}
              />
              <span className="sr-only">{formatCurrency(total)}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-2" dir="ltr">
        {data.stability.map((s) => (
          <span
            key={s.month}
            className="flex-1 text-center text-[10px] text-muted-foreground"
          >
            {MONTHS[Number(s.month.split("-")[1]) - 1]}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Who actually paid, regardless of how it was categorised. */
function SourcesSection({ data }: { data: Summary }) {
  if (data.sources.length === 0) return null;
  const max = data.sources[0].total;
  return (
    <div className="surface p-5 md:p-6">
      <h3 className="mb-4 text-lg font-bold tracking-tight">מקורות ההכנסה</h3>
      <ul className="flex flex-col gap-3.5">
        {data.sources.map((s, i) => (
          <li key={`${s.description}-${i}`} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="w-4 shrink-0 text-sm font-bold text-muted-foreground tabular-nums">
                  {i + 1}
                </span>
                <span className="truncate text-base font-semibold">
                  {s.description}
                </span>
              </span>
              <span className="metric-sm shrink-0">
                {formatCurrency(s.total)}
              </span>
            </div>
            <div className="flex items-center gap-2.5 ps-6">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[var(--status-on-track)]"
                  style={{ width: `${Math.max(2, (s.total / max) * 100)}%` }}
                />
              </div>
              <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                {s.count} {s.count === 1 ? "תקבול" : "תקבולים"} · אחרון{" "}
                {formatDate(s.lastDate)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoriesSection({
  categories,
  total,
  from,
  to,
  tCat,
}: {
  categories: IncomeCategoryRow[];
  total: number;
  from: string;
  to: string;
  tCat: ReturnType<typeof useTranslations<"categoriesSeeded">>;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (categories.length === 0) {
    return (
      <div className="surface p-10 text-center text-base text-muted-foreground">
        לא נרשמו הכנסות בתקופה הזו.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">
        הכנסות לפי קטגוריה
        <span className="ms-2 text-base font-normal text-muted-foreground">
          {categories.length}
        </span>
      </h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <IncomeCategoryCard
            key={c.categoryId}
            data={c}
            share={total > 0 ? (c.received / total) * 100 : 0}
            displayName={translateCategoryName(c.name, tCat)}
            onClick={() => setSelectedId(c.categoryId)}
          />
        ))}
      </div>

      {selectedId != null && (
        <IncomeDetailSheet
          categoryId={selectedId}
          from={from}
          to={to}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
