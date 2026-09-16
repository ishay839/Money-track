"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Store } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { getMerchantDetail, type MerchantDetail } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";

interface MerchantDetailSheetProps {
  /** The party to show; null closes the sheet. */
  merchant: string | null;
  /** Year to open on. Defaults to the current year. */
  year?: number;
  onClose: () => void;
}

/**
 * The same mini-dashboard a category gets, but for a single party: how much
 * went out or came in, month by month, this year and across the whole ledger.
 */
export function MerchantDetailSheet({
  merchant,
  year,
  onClose,
}: MerchantDetailSheetProps) {
  const open = merchant !== null;
  // Null until the user steps: the server then picks the merchant's latest
  // active year, so opening never lands on an empty screen.
  const [activeYear, setActiveYear] = useState<number | null>(year ?? null);

  useEffect(() => {
    if (open) setActiveYear(year ?? null);
  }, [open, merchant, year]);

  const query = useQuery({
    enabled: open && merchant !== null,
    queryKey: ["merchant-detail", merchant, activeYear],
    queryFn: () => getMerchantDetail(merchant as string, activeYear),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full p-0 sm:max-w-xl! md:max-w-2xl! lg:max-w-[35vw]!"
      >
        {query.isLoading || !query.data ? (
          <SheetSkeleton />
        ) : (
          <Content
            data={query.data}
            year={query.data.year}
            onYearChange={setActiveYear}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function SheetSkeleton() {
  return (
    <div className="space-y-5 p-6">
      <Skeleton className="h-8 w-2/3" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

function Content({
  data,
  year,
  onYearChange,
}: {
  data: MerchantDetail;
  year: number;
  onYearChange: (y: number) => void;
}) {
  // A party can be purely outgoing, purely incoming, or both. The headline
  // follows whichever side actually carries the money, so a salary does not
  // get labelled as spending.
  const mainlyIncome = data.incomeTotal > data.expenseTotal;
  const headline = mainlyIncome ? data.incomeTotal : data.expenseTotal;
  const bothSides = data.incomeTotal > 0 && data.expenseTotal > 0;

  const chart = useMemo(
    () =>
      monthsOfYear(year).map((month) => {
        const hit = data.months.find((m) => m.month === month);
        return {
          month,
          label: new Date(
            Number(month.slice(0, 4)),
            Number(month.slice(5, 7)) - 1,
            1
          ).toLocaleDateString("he-IL", { month: "short" }),
          value: hit ? (mainlyIncome ? hit.income : hit.expense) : 0,
          count: hit?.count ?? 0,
        };
      }),
    [data.months, year, mainlyIncome]
  );

  const peak = Math.max(...chart.map((c) => c.value), 0);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <SheetHeader className="gap-3 border-b border-border/40 bg-accent/30 p-6 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-background/70">
            {data.isCounterparty ? (
              <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
            ) : (
              <Store className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="card-label">
              {data.isCounterparty ? "צד להעברה" : "בית עסק"}
            </div>
            <SheetTitle className="truncate text-xl font-bold tracking-tight">
              {data.merchant}
            </SheetTitle>
          </div>
          <YearStepper
            year={year}
            years={data.availableYears}
            onChange={onYearChange}
          />
        </div>

        <div className="mt-2 grid grid-cols-3 gap-3">
          <Stat
            label={mainlyIncome ? `נכנס ב־${year}` : `יצא ב־${year}`}
            value={formatCurrency(headline)}
            sublabel={`${data.count} תנועות`}
          />
          <Stat
            label="ממוצע לחודש פעיל"
            value={formatCurrency(data.monthlyAverage)}
            sublabel={
              data.activeMonths > 0
                ? `${data.activeMonths} חודשים פעילים`
                : undefined
            }
          />
          <Stat
            label="מצטבר בכל השנים"
            value={formatCurrency(
              mainlyIncome ? data.lifetimeIncome : data.lifetimeExpense
            )}
            sublabel={`${data.lifetimeCount} תנועות`}
          />
        </div>

        {/* Only worth showing when money genuinely moves both ways - a refund
            against purchases, or a person you both pay and get paid by. */}
        {bothSides && (
          <div className="mt-1 grid grid-cols-3 gap-3 border-t border-border/40 pt-3">
            <Stat label="יצא" value={formatCurrency(data.expenseTotal)} />
            <Stat label="נכנס" value={formatCurrency(data.incomeTotal)} />
            <Stat
              label="נטו"
              value={`${data.net >= 0 ? "+" : "−"}${formatCurrency(Math.abs(data.net))}`}
            />
          </div>
        )}
      </SheetHeader>

      <div className="space-y-5 p-6 pt-4">
        <section>
          <div className="card-label mb-2">לפי חודש · {year}</div>
          {peak === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              אין תנועות בשנה זו.
            </p>
          ) : (
            <div className="h-40 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    interval={0}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--accent)", opacity: 0.4 }}
                    labelFormatter={(l) => String(l)}
                    formatter={(value, _name, item) => {
                      const count =
                        (item?.payload as { count?: number } | undefined)
                          ?.count ?? 0;
                      return [
                        `${formatCurrency(Number(value) || 0)} · ${count} תנועות`,
                        mainlyIncome ? "נכנס" : "יצא",
                      ];
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    {chart.map((c) => (
                      <Cell
                        key={c.month}
                        fill={
                          mainlyIncome
                            ? "var(--status-on-track)"
                            : "var(--chart-1)"
                        }
                        opacity={c.value === peak && peak > 0 ? 1 : 0.55}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {data.categories.length > 0 && (
          <section>
            <div className="card-label mb-2">לפי קטגוריה</div>
            <ul className="space-y-1.5">
              {data.categories.map((c) => (
                <li
                  key={c.categoryId ?? "none"}
                  className="flex items-center gap-2.5 text-sm"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      background: c.categoryColor ?? "var(--muted-foreground)",
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {c.categoryName ?? "ללא קטגוריה"}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {c.count}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatCurrency(c.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <div className="card-label mb-2">
            תנועות · {year}
            {data.transactions.length >= 100 && (
              <span className="ms-2 font-normal text-muted-foreground">
                (100 האחרונות)
              </span>
            )}
          </div>
          {data.transactions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              אין תנועות להצגה.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.transactions.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {t.description}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(t.date).toLocaleDateString("he-IL", {
                        day: "numeric",
                        month: "short",
                      })}
                      {t.categoryName ? ` · ${t.categoryName}` : ""}
                    </div>
                  </div>
                  <span
                    className="shrink-0 text-sm font-semibold tabular-nums"
                    style={{
                      color:
                        t.kind === "income"
                          ? "var(--status-on-track)"
                          : undefined,
                    }}
                  >
                    {t.kind === "income" ? "+" : ""}
                    {formatCurrency(Math.abs(t.chargedAmount))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {data.firstSeen && (
          <p className="text-xs text-muted-foreground">
            נראה לראשונה {new Date(data.firstSeen).toLocaleDateString("he-IL")}
            {data.lastSeen
              ? ` · לאחרונה ${new Date(data.lastSeen).toLocaleDateString("he-IL")}`
              : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="card-label truncate">{label}</div>
      <div className="mt-0.5 font-serif text-xl tabular-nums">{value}</div>
      {sublabel && (
        <div className="truncate text-xs text-muted-foreground">{sublabel}</div>
      )}
    </div>
  );
}

/**
 * Steps between the years this party actually appears in, so the arrows never
 * lead to an empty screen.
 */
function YearStepper({
  year,
  years,
  onChange,
}: {
  year: number;
  years: number[];
  onChange: (y: number) => void;
}) {
  const known = years.length > 0 ? years : [year];
  const idx = known.indexOf(year);
  const newer = idx > 0 ? known[idx - 1] : null;
  const older = idx >= 0 && idx < known.length - 1 ? known[idx + 1] : null;

  return (
    <div className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-lg border border-border bg-card px-1">
      <button
        type="button"
        onClick={() => newer !== null && onChange(newer)}
        disabled={newer === null}
        aria-label="לשנה הבאה"
        className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-accent disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <span className="min-w-12 text-center text-xs font-semibold tabular-nums">
        {year}
      </span>
      <button
        type="button"
        onClick={() => older !== null && onChange(older)}
        disabled={older === null}
        aria-label="לשנה הקודמת"
        className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-accent disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
    </div>
  );
}

function monthsOfYear(year: number): string[] {
  return Array.from(
    { length: 12 },
    (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`
  );
}
