"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { getCumulative, getOutliers } from "@/lib/api";
import { useTranslations } from "next-intl";
import { translateCategoryName } from "@/lib/i18n-data";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";

const CHART_H = 200;
const PAD_L = 56;
const PAD_B = 26;
const PAD_T = 10;
const W = 720;

/**
 * Where this month stands against the same day in previous months, plus the
 * charges that are far bigger than that merchant's norm.
 */
export function PacePanel() {
  const tCat = useTranslations("categoriesSeeded");
  const month = `${new Date().getFullYear()}-${String(
    new Date().getMonth() + 1
  ).padStart(2, "0")}`;

  const cumulativeQuery = useQuery({
    queryKey: ["cumulative", month],
    queryFn: () => getCumulative(month),
  });
  const outliersQuery = useQuery({
    queryKey: ["outliers"],
    queryFn: () => getOutliers(3),
  });

  const model = useMemo(() => {
    const d = cumulativeQuery.data;
    if (!d) return null;
    const today = new Date().getDate();
    const max = Math.max(
      ...d.current.map((p) => p.amount),
      ...d.previous.map((p) => p.amount),
      ...d.earlier.map((p) => p.amount),
      1
    );
    const todayAmount = d.current[today - 1]?.amount ?? 0;
    const prevSameDay = d.previous[today - 1]?.amount ?? 0;
    return { d, today, max, todayAmount, prevSameDay };
  }, [cumulativeQuery.data]);

  if (cumulativeQuery.isLoading || !model) {
    return <Skeleton className="h-80 w-full rounded-xl" />;
  }

  const { d, today, max, todayAmount, prevSameDay } = model;
  const x = (day: number) => PAD_L + ((day - 1) / 30) * (W - PAD_L - 12);
  const y = (amt: number) =>
    PAD_T + (1 - amt / max) * (CHART_H - PAD_T - PAD_B);
  const line = (pts: { day: number; amount: number }[], upTo?: number) =>
    pts
      .filter((p) => (upTo ? p.day <= upTo : true))
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.day)},${y(p.amount)}`)
      .join(" ");

  const diff = todayAmount - prevSameDay;
  const outliers = outliersQuery.data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface p-5">
          <div className="card-label">הוצאות עד היום</div>
          <div className="metric-lg mt-2">{formatCurrency(todayAmount)}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {today} בחודש
          </div>
        </div>
        <div className="surface p-5">
          <div className="card-label">באותו יום בחודש הקודם</div>
          <div className="metric-lg mt-2 text-muted-foreground">
            {formatCurrency(prevSameDay)}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {d.previousLabel}
          </div>
        </div>
        <div className="surface p-5">
          <div className="card-label">הפרש</div>
          <div
            className="metric-lg mt-2"
            style={{
              color:
                diff > 0 ? "var(--status-over)" : "var(--status-on-track)",
            }}
          >
            {diff >= 0 ? "+" : "−"}
            {formatCurrency(Math.abs(diff))}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {prevSameDay > 0
              ? `${Math.abs(Math.round((diff / prevSameDay) * 100))}% ${diff > 0 ? "יותר" : "פחות"}`
              : "אין השוואה"}
          </div>
        </div>
      </div>

      <div className="surface p-5">
        <h3 className="card-label mb-3">קצב ההוצאות לאורך החודש</h3>
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${CHART_H}`}
            className="h-56 w-full min-w-[520px]"
            role="img"
            aria-label="גרף הוצאות מצטברות"
          >
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line
                  x1={PAD_L}
                  x2={W - 12}
                  y1={y(max * f)}
                  y2={y(max * f)}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                />
                <text
                  x={PAD_L - 8}
                  y={y(max * f) + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--muted-foreground)"
                >
                  {Math.round((max * f) / 1000)}k
                </text>
              </g>
            ))}
            {[1, 10, 20, 31].map((dd) => (
              <text
                key={dd}
                x={x(dd)}
                y={CHART_H - 8}
                textAnchor="middle"
                fontSize="11"
                fill="var(--muted-foreground)"
              >
                {dd}
              </text>
            ))}
            <path
              d={line(d.earlier)}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeOpacity="0.3"
              strokeWidth="2"
            />
            <path
              d={line(d.previous)}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeOpacity="0.6"
              strokeWidth="2"
            />
            <path
              d={line(d.current, today)}
              fill="none"
              stroke="var(--chart-1)"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle
              cx={x(today)}
              cy={y(todayAmount)}
              r="5"
              fill="var(--chart-1)"
            />
          </svg>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-5 text-sm">
          <Legend color="var(--chart-1)" label={`${d.month} (החודש)`} />
          <Legend color="var(--muted-foreground)" label={d.previousLabel} opacity={0.6} />
          <Legend color="var(--muted-foreground)" label={d.earlierLabel} opacity={0.3} />
        </div>
      </div>

      <div className="surface overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
          <AlertTriangle className="h-5 w-5 text-[var(--status-heads-up)]" />
          <h3 className="text-base font-bold">
            חיובים חריגים
            <span className="ms-2 font-normal text-muted-foreground">
              גדולים בהרבה מהרגיל אצל אותו בית עסק
            </span>
          </h3>
        </div>
        {outliers.length === 0 ? (
          <div className="px-5 py-10 text-center text-base text-muted-foreground">
            לא נמצאו חיובים חריגים בחצי השנה האחרונה
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {outliers.slice(0, 12).map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{o.description}</div>
                  <div className="text-sm text-muted-foreground tabular-nums">
                    {formatDate(o.date)}
                    {o.categoryName
                      ? ` · ${translateCategoryName(o.categoryName, tCat)}`
                      : ""}
                    {" · רגיל: "}
                    {formatCurrency(o.typicalAmount)}
                  </div>
                </div>
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums"
                  style={{
                    backgroundColor:
                      "color-mix(in oklch, var(--status-heads-up) 14%, transparent)",
                    color: "var(--status-heads-up)",
                  }}
                >
                  ×{o.timesTypical.toFixed(1)}
                </span>
                <span className="metric-sm shrink-0">
                  {formatCurrency(o.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Legend({
  color,
  label,
  opacity = 1,
}: {
  color: string;
  label: string;
  opacity?: number;
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="h-1 w-6 rounded-full"
        style={{ backgroundColor: color, opacity }}
      />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
