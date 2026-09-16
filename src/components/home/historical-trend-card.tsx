"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CardShell } from "./card-shell";
import { formatCurrency } from "@/lib/formatters";
import type { HomeHistoricalTrendPoint } from "@/lib/types";

interface Props {
  data: HomeHistoricalTrendPoint[];
}

export function HistoricalTrendCard({ data }: Props) {
  const t = useTranslations("home");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hasData = data.some((d) => d.total > 0);

  if (!hasData) {
    return (
      <CardShell label={t("last8Months")}>
        <div className="flex flex-1 items-center justify-center py-6 text-base text-muted-foreground">
          {t("notEnoughHistory")}
        </div>
      </CardShell>
    );
  }

  const max = Math.max(...data.map((d) => d.total));
  const activeIdx = hoverIdx ?? data.length - 1;
  const active = data[activeIdx];
  const prev = activeIdx > 0 ? data[activeIdx - 1] : null;
  // A month still in progress is not comparable to a completed one, so no delta there.
  const changePct =
    prev && prev.total > 0 && !active.isCurrent
      ? ((active.total - prev.total) / prev.total) * 100
      : null;

  const avg = data.reduce((sum, d) => sum + d.total, 0) / data.length;

  return (
    <CardShell label={t("last8Months")}>
      <div className="flex flex-1 flex-col justify-between gap-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="metric-lg">{formatCurrency(active.total)}</span>
          <span className="text-base font-medium text-muted-foreground">
            {active.label}
            {active.isCurrent ? ` ${t("soFar")}` : ""}
          </span>
          {changePct != null && Math.round(changePct) !== 0 && (
            <span
              className="text-base font-semibold tabular-nums"
              style={{
                color:
                  changePct > 0
                    ? "var(--status-over)"
                    : "var(--status-on-track)",
              }}
            >
              {changePct > 0 ? "▲" : "▼"} {Math.abs(Math.round(changePct))}%
            </span>
          )}
        </div>

        <BarChart
          data={data}
          max={max}
          avg={avg}
          activeIdx={activeIdx}
          hoverIdx={hoverIdx}
          onHover={setHoverIdx}
        />
      </div>
    </CardShell>
  );
}

function BarChart({
  data,
  max,
  avg,
  activeIdx,
  hoverIdx,
  onHover,
}: {
  data: HomeHistoricalTrendPoint[];
  max: number;
  avg: number;
  activeIdx: number;
  hoverIdx: number | null;
  onHover: (i: number | null) => void;
}) {
  return (
    <div className="flex flex-col gap-2" onMouseLeave={() => onHover(null)}>
      <div
        className="relative flex h-36 items-end gap-1.5"
        style={{ direction: "ltr" }}
      >
        {/* average reference line */}
        {max > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/25"
            style={{ bottom: `${(avg / max) * 100}%` }}
            aria-hidden
          />
        )}
        {data.map((d, i) => {
          const heightPct = max > 0 ? (d.total / max) * 100 : 0;
          const isActive = i === activeIdx;
          return (
            <button
              key={d.month}
              type="button"
              onMouseEnter={() => onHover(i)}
              onFocus={() => onHover(i)}
              className="group relative flex h-full flex-1 cursor-pointer flex-col justify-end outline-none"
              aria-label={`${d.label}: ${formatCurrency(d.total)}`}
            >
              <span
                className="w-full rounded-t-md transition-all duration-200"
                style={{
                  height: `${Math.max(2, heightPct)}%`,
                  backgroundColor: isActive
                    ? "var(--chart-1)"
                    : "var(--chart-1)",
                  opacity: hoverIdx == null ? (d.isCurrent ? 1 : 0.4) : isActive ? 1 : 0.25,
                }}
              />
            </button>
          );
        })}
      </div>
      <div className="flex gap-1.5" style={{ direction: "ltr" }}>
        {data.map((d, i) => (
          <span
            key={d.month}
            className={`flex-1 text-center text-xs tabular-nums transition-colors ${
              i === activeIdx
                ? "font-bold text-foreground"
                : "text-muted-foreground"
            }`}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
