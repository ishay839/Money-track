"use client";

import { useLocale, useTranslations } from "next-intl";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { TransactionsSummary } from "@/lib/api";
import type { Locale } from "@/i18n/routing";

interface KpiCardsProps {
  summary?: TransactionsSummary;
  loading: boolean;
}

const INCOME_TINT = "color-mix(in oklch, var(--status-on-track) 12%, transparent)";
const EXPENSE_TINT = "color-mix(in oklch, var(--status-over) 12%, transparent)";

export function KpiCards({ summary, loading }: KpiCardsProps) {
  const t = useTranslations("transactions");
  const locale = useLocale() as Locale;
  const income = summary?.income.total ?? 0;
  const expense = summary?.expense.total ?? 0;
  const net = summary?.net ?? 0;
  const incomeCount = summary?.income.count ?? 0;
  const expenseCount = summary?.expense.count ?? 0;
  const netPositive = net >= 0;

  const countMeta = (count: number): string => {
    const label = count === 1 ? t("kpiTransactionOne") : t("kpiTransactionOther");
    return `${count} ${label}`;
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <KpiCard
        label={t("kpiIncome")}
        amount={income}
        meta={countMeta(incomeCount)}
        icon={<ArrowUpRight className="h-5 w-5" />}
        color="var(--status-on-track)"
        iconBg={INCOME_TINT}
        loading={loading}
        locale={locale}
      />
      <KpiCard
        label={t("kpiExpenses")}
        amount={expense}
        meta={countMeta(expenseCount)}
        icon={<ArrowDownRight className="h-5 w-5" />}
        color="var(--status-over)"
        iconBg={EXPENSE_TINT}
        loading={loading}
        locale={locale}
      />
      <KpiCard
        label={netPositive ? t("kpiNetSaved") : t("kpiNetOverspend")}
        amount={Math.abs(net)}
        meta={netPositive ? t("kpiIncomeExceeded") : t("kpiExpensesExceeded")}
        icon={
          net === 0 ? (
            <Minus className="h-5 w-5" />
          ) : netPositive ? (
            <ArrowUpRight className="h-5 w-5" />
          ) : (
            <ArrowDownRight className="h-5 w-5" />
          )
        }
        color={
          net === 0
            ? "var(--muted-foreground)"
            : netPositive
              ? "var(--status-on-track)"
              : "var(--status-over)"
        }
        iconBg={
          net === 0
            ? "color-mix(in oklch, var(--muted-foreground) 12%, transparent)"
            : netPositive
              ? INCOME_TINT
              : EXPENSE_TINT
        }
        loading={loading}
        locale={locale}
      />
    </div>
  );
}

interface KpiCardProps {
  label: string;
  amount: number;
  meta: string;
  icon: React.ReactNode;
  color: string;
  iconBg: string;
  loading: boolean;
  locale: Locale;
}

function KpiCard({
  label,
  amount,
  meta,
  icon,
  color,
  iconBg,
  loading,
  locale,
}: KpiCardProps) {
  return (
    <div className="surface p-5 md:p-6">
      <div className="flex items-center justify-between">
        <div className="card-label">{label}</div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: iconBg, color }}
        >
          {icon}
        </div>
      </div>
      <div className="metric-lg mt-3" style={{ color }}>
        {loading ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          formatCurrency(amount, "ILS", locale)
        )}
      </div>
      <div className="mt-1.5 text-sm text-muted-foreground">{meta}</div>
    </div>
  );
}
