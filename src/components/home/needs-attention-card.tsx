"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, CircleHelp, Flag } from "lucide-react";
import { CardShell } from "./card-shell";
import { formatCurrency } from "@/lib/formatters";
import type { HomeNeedsAttention } from "@/lib/types";
import {
  QuickCategorizeDialog,
  type QuickCategorizeTarget,
} from "./quick-categorize-dialog";

const NEEDS_ATTENTION_COLLAPSE_KEY = "spent.home.needsAttention.collapsed";

interface Props {
  data: HomeNeedsAttention;
}

export function NeedsAttentionCard({ data }: Props) {
  const t = useTranslations("home");
  const [target, setTarget] = useState<QuickCategorizeTarget | null>(null);
  const { uncategorized, lowConfidence, flagged } = data;
  const total = uncategorized + lowConfidence + flagged;

  if (total === 0) {
    return (
      <CardShell
        label={t("needsAttention")}
        collapsibleKey={NEEDS_ATTENTION_COLLAPSE_KEY}
      >
        <div className="flex flex-1 items-center justify-center gap-2.5 py-6">
          <CheckCircle2 className="h-5 w-5 text-[var(--status-on-track)]" />
          <span className="text-base font-semibold text-[var(--status-on-track)]">
            {t("allClear")}
          </span>
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell
      label={t("needsAttention")}
      collapsibleKey={NEEDS_ATTENTION_COLLAPSE_KEY}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          icon={<CircleHelp className="h-5 w-5" />}
          label={t("needsAttentionUncategorized")}
          count={uncategorized}
          href="/transactions?review=1"
          tone="var(--status-heads-up)"
        />
        <Tile
          icon={<AlertTriangle className="h-5 w-5" />}
          label={t("needsAttentionLowConfidence")}
          count={lowConfidence}
          href="/transactions?review=1"
          tone="var(--chart-3)"
        />
        <Tile
          icon={<Flag className="h-5 w-5" />}
          label={t("needsAttentionFlagged")}
          count={flagged}
          href="/transactions?review=1"
          tone="var(--status-over)"
        />
      </div>

      {data.items.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <div className="mb-3 text-sm font-semibold text-muted-foreground">
            הבולטות ביותר
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {data.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  setTarget({
                    id: item.id,
                    date: item.date,
                    description: item.description,
                    amount: item.amount,
                    reason: item.reason,
                    // Without this the dialog cannot tell income from expense
                    // and would offer the wrong side's categories.
                    kind: item.kind,
                  })
                }
                title="סיווג מהיר"
                className="row-hover flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start"
              >
                <span className="min-w-0 truncate text-base font-medium">
                  {item.description}
                </span>
                <span className="shrink-0 metric-sm">
                  {formatCurrency(item.amount)}
                </span>
              </button>
            ))}
          </div>
          <Link
            href="/transactions?review=1"
            className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
          >
            לכל התנועות הדורשות טיפול ←
          </Link>
        </div>
      )}
      <QuickCategorizeDialog
        transaction={target}
        onClose={() => setTarget(null)}
      />
    </CardShell>
  );
}

function Tile({
  icon,
  label,
  count,
  href,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  href: string;
  tone: string;
}) {
  const isEmpty = count === 0;

  if (isEmpty) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3.5">
        <span className="text-muted-foreground/50">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="metric-sm text-muted-foreground/60">0</div>
          <div className="truncate text-sm text-muted-foreground">{label}</div>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-colors"
      style={{
        borderColor: `color-mix(in oklch, ${tone} 35%, var(--border))`,
        backgroundColor: `color-mix(in oklch, ${tone} 7%, var(--card))`,
      }}
    >
      <span style={{ color: tone }}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="metric-md" style={{ color: tone }}>
          {count}
        </div>
        <div className="truncate text-sm font-medium text-muted-foreground">
          {label}
        </div>
      </div>
    </Link>
  );
}
