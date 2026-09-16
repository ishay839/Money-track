"use client";

import { useLocale, useTranslations } from "next-intl";
import { ArrowDownRight, ArrowUpRight, HelpCircle } from "lucide-react";
import type { TransactionsSummary } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import type { Locale } from "@/i18n/routing";

interface WidgetsRowProps {
  summary?: TransactionsSummary;
  loading: boolean;
  onReview: () => void;
}

export function WidgetsRow({ summary, loading, onReview }: WidgetsRowProps) {
  const topMerchants = summary?.topMerchants ?? [];
  const largestIncome = summary?.income.largest ?? null;
  const largestExpense = summary?.expense.largest ?? null;
  const pendingReviewCount = summary?.pendingReviewCount ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <TopMerchants merchants={topMerchants} loading={loading} />
      </div>
      <div className="flex flex-col gap-4">
        <PendingReview count={pendingReviewCount} loading={loading} onReview={onReview} />
        <Outliers
          largestIncome={largestIncome}
          largestExpense={largestExpense}
          loading={loading}
        />
      </div>
    </div>
  );
}

interface TopMerchantsProps {
  merchants: { description: string; total: number; count: number }[];
  loading: boolean;
}

function TopMerchants({ merchants, loading }: TopMerchantsProps) {
  const t = useTranslations("transactions");
  const locale = useLocale() as Locale;
  return (
    <div className="surface h-full p-5 md:p-6">
      <div className="card-label">
        {t("topMerchants")}
      </div>
      <div className="mt-3 space-y-2">
        {loading ? (
          <div className="text-sm text-muted-foreground">{t("loadingShort")}</div>
        ) : merchants.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t("noMerchantsYet")}</div>
        ) : (
          merchants.map((m, idx) => (
            <div
              key={m.description}
              className="flex items-center justify-between gap-3 py-1"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-4 text-end text-sm font-bold tabular-nums text-muted-foreground">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1 truncate text-sm font-medium">
                  {m.description}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {m.count} {m.count === 1 ? t("txnsOne") : t("txnsOther")}
                </span>
                <span className="metric-sm">
                  {formatCurrency(m.total, "ILS", locale)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

interface PendingReviewProps {
  count: number;
  loading: boolean;
  onReview: () => void;
}

function PendingReview({ count, loading, onReview }: PendingReviewProps) {
  const t = useTranslations("transactions");

  if (!loading && count === 0) {
    return (
      <div className="surface p-5 md:p-6">
        <div className="card-label">
          {t("pendingReview")}
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          {t("nothingFlagged")}
        </div>
      </div>
    );
  }

  return (
      <div className="surface p-5 md:p-6">
        <div className="flex items-center justify-between">
          <div className="card-label">
            {t("pendingReview")}
          </div>
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--status-heads-up) 18%, transparent)",
              color: "var(--status-heads-up)",
            }}
          >
            <HelpCircle className="h-4 w-4" />
          </div>
        </div>
        <div className="metric-lg mt-3">
          {loading ? <span className="text-muted-foreground">—</span> : count}
        </div>
        <div className="mt-1.5 text-sm text-muted-foreground">
          {count === 1 ? t("needCloserLookOne") : t("needCloserLookOther")}
        </div>
        <button
          type="button"
          onClick={onReview}
          disabled={loading || count === 0}
          className="mt-4 inline-flex h-9 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t("reviewNow")}
        </button>
      </div>
  );
}

interface OutliersProps {
  largestIncome: TransactionsSummary["income"]["largest"];
  largestExpense: TransactionsSummary["expense"]["largest"];
  loading: boolean;
}

function Outliers({ largestIncome, largestExpense, loading }: OutliersProps) {
  const t = useTranslations("transactions");
  return (
    <div className="surface p-5 md:p-6">
      <div className="card-label">
        {t("outliers")}
      </div>
      <div className="mt-3 space-y-3">
        <OutlierRow
          label={t("largestExpense")}
          txn={largestExpense}
          color="var(--status-over)"
          icon={<ArrowDownRight className="h-4 w-4" />}
          loading={loading}
        />
        <OutlierRow
          label={t("largestIncome")}
          txn={largestIncome}
          color="var(--status-on-track)"
          icon={<ArrowUpRight className="h-4 w-4" />}
          loading={loading}
        />
      </div>
    </div>
  );
}

function OutlierRow({
  label,
  txn,
  color,
  icon,
  loading,
}: {
  label: string;
  txn: TransactionsSummary["income"]["largest"];
  color: string;
  icon: React.ReactNode;
  loading: boolean;
}) {
  const locale = useLocale() as Locale;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      {loading ? (
        <div className="mt-0.5 text-sm text-muted-foreground">—</div>
      ) : !txn ? (
        <div className="mt-0.5 text-sm text-muted-foreground">—</div>
      ) : (
        <div className="mt-0.5 flex items-baseline justify-between gap-3">
          <div className="min-w-0 truncate text-sm font-medium">
            {txn.description}
          </div>
          <div
            className="metric-sm shrink-0"
            style={{ color }}
          >
            {formatCurrency(txn.chargedAmount, "ILS", locale)}
          </div>
        </div>
      )}
    </div>
  );
}
