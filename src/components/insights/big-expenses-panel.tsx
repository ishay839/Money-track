"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Check, Settings2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { getGroupSpend, type GroupSpendRow } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";

/**
 * The handful of groups that dominate almost every household budget. They are
 * only the starting selection - the picker lets any parent group be featured
 * instead, and the choice is remembered.
 */
const DEFAULT_GROUP_NAMES = [
  "מזון ומכולת",
  "תיקונים ואחזקת רכב",
  "מעון",
  "לימודים",
  "הוצאות דירה",
  "שכר דירה (הוצאה)",
  "Food",
  "Transportation",
  "Home & Bills",
];

const STORAGE_KEY = "spent.insights.bigExpenses.groups";
const MAX_FEATURED = 6;

export function BigExpensesPanel({ year }: { year: number }) {
  const tCat = useTranslations("categoriesSeeded");
  const now = new Date();
  const isCurrentYear = year === now.getFullYear();

  // A finished year is compared against the whole of the year before it; the
  // current year is compared against the same months last year, so a partial
  // year is never measured against a full one.
  const from = `${year}-01-01`;
  const to = isCurrentYear
    ? `${year}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
        new Date(year, now.getMonth() + 1, 0).getDate()
      ).padStart(2, "0")}`
    : `${year}-12-31`;

  const { data, isLoading } = useQuery({
    queryKey: ["group-spend", from, to],
    queryFn: () => getGroupSpend({ from, to, months: 12 }),
  });

  const groups = useMemo(() => data?.groups ?? [], [data]);

  const [selected, setSelected] = useState<number[] | null>(null);

  // Until the user picks, feature the well-known household groups that exist
  // in this workspace, then fall back to whatever is simply biggest.
  useEffect(() => {
    if (groups.length === 0 || selected !== null) return;
    let stored: number[] | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) stored = JSON.parse(raw) as number[];
    } catch {
      stored = null;
    }
    if (stored && stored.length > 0) {
      const valid = stored.filter((id) => groups.some((g) => g.categoryId === id));
      if (valid.length > 0) {
        setSelected(valid);
        return;
      }
    }
    const preferred = groups
      .filter((g) => DEFAULT_GROUP_NAMES.includes(g.name))
      .map((g) => g.categoryId);
    const filler = groups
      .filter((g) => !preferred.includes(g.categoryId))
      .map((g) => g.categoryId);
    setSelected([...preferred, ...filler].slice(0, MAX_FEATURED));
  }, [groups, selected]);

  const persist = (ids: number[]) => {
    setSelected(ids);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // Not persisting is acceptable; the selection still applies this visit.
    }
  };

  const toggle = (id: number) => {
    const current = selected ?? [];
    if (current.includes(id)) {
      persist(current.filter((x) => x !== id));
    } else if (current.length < MAX_FEATURED) {
      persist([...current, id]);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  const featured = (selected ?? [])
    .map((id) => groups.find((g) => g.categoryId === id))
    .filter((g): g is GroupSpendRow => g != null);

  const monthsElapsed = isCurrentYear ? now.getMonth() + 1 : 12;
  const biggest = Math.max(...featured.map((g) => g.total), 1);

  return (
    <div className="surface p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h3 className="card-label">ההוצאות הגדולות של הבית</h3>
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold transition-colors hover:bg-accent"
              >
                <Settings2 className="h-3.5 w-3.5" />
                בחירת קטגוריות
              </button>
            }
          />
          <PopoverContent align="end" className="w-72 p-0">
            <div className="border-b border-border px-3 py-2.5 text-sm text-muted-foreground">
              עד {MAX_FEATURED} קבוצות · נבחרו {featured.length}
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {groups.map((g) => {
                const on = (selected ?? []).includes(g.categoryId);
                const full = !on && (selected ?? []).length >= MAX_FEATURED;
                return (
                  <button
                    key={g.categoryId}
                    type="button"
                    disabled={full}
                    onClick={() => toggle(g.categoryId)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm transition-colors hover:bg-accent disabled:opacity-40"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: g.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {translateCategoryName(g.name, tCat)}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatCurrency(g.total)}
                    </span>
                    {on && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        סכום שנתי לכל קבוצה, מול אותה תקופה אשתקד, וממוצע לחודש.
      </p>

      {featured.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          לא נבחרו קבוצות להצגה.
        </p>
      ) : (
        <ul className="space-y-4">
          {featured.map((g) => {
            const delta = g.total - g.previous;
            const deltaPct =
              g.previous > 0 ? Math.round((delta / g.previous) * 100) : null;
            const perMonth = monthsElapsed > 0 ? g.total / monthsElapsed : 0;
            return (
              <li key={g.categoryId}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: g.color }}
                    />
                    <span className="truncate text-base font-bold">
                      {translateCategoryName(g.name, tCat)}
                    </span>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {formatCurrency(perMonth)} לחודש
                    </span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <span className="metric-sm">{formatCurrency(g.total)}</span>
                    {deltaPct != null && deltaPct !== 0 && (
                      <span
                        className="text-sm font-semibold tabular-nums"
                        title={`אשתקד: ${formatCurrency(g.previous)}`}
                        style={{
                          color:
                            delta > 0
                              ? "var(--status-over)"
                              : "var(--status-on-track)",
                        }}
                      >
                        {delta > 0 ? "▲" : "▼"} {Math.abs(deltaPct)}%
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${Math.max(2, (g.total / biggest) * 100)}%`,
                      backgroundColor: g.color,
                    }}
                  />
                </div>
                {g.children.length > 1 && (
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {g.children.slice(0, 4).map((c) => (
                      <span key={c.categoryId}>
                        {translateCategoryName(c.name, tCat)}{" "}
                        <span className="tabular-nums">
                          {formatCurrency(c.total)}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
