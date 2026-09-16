"use client";

import { useTranslations } from "next-intl";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { CardShell } from "./card-shell";
import { formatCurrency } from "@/lib/formatters";
import type { HomeCashFlow } from "@/lib/types";

interface Props {
  data: HomeCashFlow;
}

export function CashFlowCard({ data }: Props) {
  const t = useTranslations("home");
  const { income, expenses, net } = data;
  const netPositive = net >= 0;
  const scale = Math.max(income, expenses, 1);

  return (
    <CardShell label={t("cashFlowTitle")}>
      <div className="flex flex-1 flex-col justify-center gap-6">
        <div className="space-y-5">
          <Bar
            label={t("cashFlowIn")}
            value={income}
            widthPct={(income / scale) * 100}
            icon={<ArrowDownRight className="h-4 w-4" />}
            tone="var(--status-on-track)"
          />
          <Bar
            label={t("cashFlowOut")}
            value={expenses}
            widthPct={(expenses / scale) * 100}
            icon={<ArrowUpRight className="h-4 w-4" />}
            tone="var(--status-over)"
          />
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-muted-foreground">
              {t("cashFlowNet")}
            </span>
            <span
              className="metric-md"
              style={{
                color: netPositive
                  ? "var(--status-on-track)"
                  : "var(--status-over)",
              }}
            >
              {netPositive ? "+" : "−"}
              {formatCurrency(Math.abs(net))}
            </span>
          </div>
        </div>
      </div>
    </CardShell>
  );
}

function Bar({
  label,
  value,
  widthPct,
  icon,
  tone,
}: {
  label: string;
  value: number;
  widthPct: number;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className="flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: tone }}
        >
          {icon}
          <span className="text-muted-foreground">{label}</span>
        </span>
        <span className="metric-sm">{formatCurrency(value)}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.max(2, Math.min(100, widthPct))}%`,
            backgroundColor: tone,
          }}
        />
      </div>
    </div>
  );
}
