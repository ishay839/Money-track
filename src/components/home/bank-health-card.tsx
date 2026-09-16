"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CardShell, CardAction } from "./card-shell";
import { formatLastSync } from "@/lib/formatters";
import { translateProviderName, useFormatterLabels } from "@/lib/i18n-data";
import { getBaseBankProvider, type HomeBankHealthItem } from "@/lib/types";

interface Props {
  items: HomeBankHealthItem[];
}

export function BankHealthCard({ items }: Props) {
  const t = useTranslations("home");
  if (items.length === 0) {
    return (
      <div id="bank-health" className="contents">
        <CardShell
          label={t("bankConnections")}
          action={<CardAction href="/settings/bank">{t("manage")}</CardAction>}
        >
          <div className="flex flex-1 items-center justify-center py-6 text-base text-muted-foreground">
            {t("noBanksConnectedYet")}
          </div>
        </CardShell>
      </div>
    );
  }

  return (
    <div id="bank-health" className="contents">
      <CardShell
        label={t("bankConnections")}
        action={<CardAction href="/settings/bank">{t("manage")}</CardAction>}
      >
        <ul className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <li key={item.provider}>
              <Row item={item} />
            </li>
          ))}
        </ul>
      </CardShell>
    </div>
  );
}

function Row({ item }: { item: HomeBankHealthItem }) {
  const t = useTranslations("home");
  const tBanks = useTranslations("banks");
  const labels = useFormatterLabels();
  const { providerName, lastSyncAt, status, errorMessage, provider } = item;
  const baseName = translateProviderName(
    getBaseBankProvider(provider),
    providerName,
    tBanks
  );
  const suffix = provider.split(":")[1];
  const displayName = suffix ? `${baseName} · חשבון ${suffix}` : baseName;

  return (
    <Link
      href="/settings/bank"
      className="flex h-full items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-3.5 py-3 transition-colors hover:bg-accent"
      title={errorMessage ?? undefined}
    >
      <div className="flex min-w-0 items-center gap-3">
        <StatusDot status={status} />
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">{displayName}</div>
          <div className="text-sm text-muted-foreground">
            {describeLastSync(lastSyncAt, status, labels, t)}
          </div>
        </div>
      </div>
      <StatusLabel status={status} />
    </Link>
  );
}

function StatusDot({ status }: { status: HomeBankHealthItem["status"] }) {
  const cls =
    status === "ok"
      ? "bg-[var(--status-on-track)]"
      : status === "stale"
        ? "bg-[var(--status-heads-up)]"
        : status === "error"
          ? "bg-[var(--status-over)]"
          : "bg-muted-foreground/40";
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cls}`} />;
}

function StatusLabel({ status }: { status: HomeBankHealthItem["status"] }) {
  const t = useTranslations("home");
  const text =
    status === "ok"
      ? t("statusOk")
      : status === "stale"
        ? t("statusStale")
        : status === "error"
          ? t("statusError")
          : t("statusNeverSynced");
  const cls =
    status === "ok"
      ? "text-[var(--status-on-track)]"
      : status === "stale"
        ? "text-[var(--status-heads-up)]"
        : status === "error"
          ? "text-[var(--status-over)]"
          : "text-muted-foreground";
  return <span className={`shrink-0 text-sm font-semibold ${cls}`}>{text}</span>;
}

function describeLastSync(
  iso: string | null,
  status: HomeBankHealthItem["status"],
  labels: ReturnType<typeof useFormatterLabels>,
  t: ReturnType<typeof useTranslations<"home">>,
): string {
  if (!iso) return status === "error" ? t("lastAttemptFailed") : t("statusNeverSynced");
  return formatLastSync(iso, labels);
}
