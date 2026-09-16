"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  ChevronRight,
  Plus,
  RefreshCw,
  Loader2,
  CircleCheck,
  CircleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { SectionShell } from "@/components/settings/section-shell";
import { BankDetailSheet } from "@/components/settings/bank-detail-sheet";
import { BalanceConnections } from "@/components/settings/balance-connections";
import { useBankSync } from "@/components/settings/use-bank-sync";
import { listIntegrations } from "@/lib/api";
import { BANK_PROVIDERS, getBaseBankProvider } from "@/lib/types";
import { translateProviderName, useFormatterLabels } from "@/lib/i18n-data";
import { formatLastSync } from "@/lib/formatters";

/** One titled group of connections on the settings page. */
function ConnGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-lg font-bold tracking-tight">{title}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}

interface SheetState {
  open: boolean;
  mode: "edit" | "add";
  providerId: string | null;
}

export default function BankSettingsPage() {
  const t = useTranslations("settings.bank");
  const tBanks = useTranslations("banks");
  const labels = useFormatterLabels();

  const { data: integrations = [] } = useQuery({
    queryKey: ["integrations"],
    queryFn: listIntegrations,
  });
  const { start, stateFor, anySyncing } = useBankSync();
  const [sheet, setSheet] = useState<SheetState>({
    open: false,
    mode: "edit",
    providerId: null,
  });

  const lastSync = useMemo(() => {
    const stamps = integrations
      .map((i) => i.lastSyncAt)
      .filter((s): s is string => Boolean(s));
    if (stamps.length === 0) return null;
    return stamps.sort().slice(-1)[0];
  }, [integrations]);

  const availableToAdd = BANK_PROVIDERS.filter((b) => b.enabled);
  // Cards and banks are separate groups: a credit card is not a bank account,
  // and mixing them made the list hard to scan.
  const bankIntegrations = integrations.filter(
    (i) =>
      BANK_PROVIDERS.find((b) => b.id === getBaseBankProvider(i.provider))
        ?.kind !== "card"
  );
  const cardIntegrations = integrations.filter(
    (i) =>
      BANK_PROVIDERS.find((b) => b.id === getBaseBankProvider(i.provider))
        ?.kind === "card"
  );

  const handleSyncAll = () => {
    integrations.forEach((i) => start(i.provider));
  };

  const sheetIntegration =
    sheet.mode === "edit" && sheet.providerId
      ? integrations.find((i) => i.provider === sheet.providerId) ?? null
      : null;

  const renderList = (
    list: typeof integrations,
    emptyText: string
  ) => (
    <>
        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <ul className="divide-y divide-border/60">
              {list.map((integration) => {
                const info = BANK_PROVIDERS.find(
                  (b) => b.id === getBaseBankProvider(integration.provider)
                );
                if (!info) return null;
                const sync = stateFor(integration.provider);
                const suffix = integration.provider.split(":")[1];
                const baseName = translateProviderName(info.id, info.name, tBanks);
                const localName = suffix ? `${baseName} · חשבון ${suffix}` : baseName;
                const openSheet = () =>
                  setSheet({
                    open: true,
                    mode: "edit",
                    providerId: integration.provider,
                  });
                const subline = integration.lastSyncAt
                  ? t("transactionsCountWithSync", {
                      count: integration.transactionCount,
                      time: formatLastSync(integration.lastSyncAt, labels),
                    })
                  : t("transactionsCountNever", {
                      count: integration.transactionCount,
                    });
                return (
                  <li
                    key={integration.provider}
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <button
                      type="button"
                      onClick={openSheet}
                      aria-label={t("openDetails", { name: localName })}
                      className="flex min-w-0 flex-1 items-center gap-3 text-start"
                    >
                      <ProviderBadge
                        color={info.color}
                        name={localName}
                        domain={info.domain}
                        size={36}
                        radius={9}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {localName}
                          <StatusPill
                            lastSyncAt={integration.lastSyncAt}
                            syncing={sync.syncing}
                          />
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {subline}
                        </div>
                      </div>
                    </button>
                    <SyncShortButton
                      syncing={sync.syncing}
                      stage={sync.stage}
                      onClick={() => start(integration.provider)}
                    />
                    <button
                      type="button"
                      onClick={openSheet}
                      aria-label={t("openDetails", { name: localName })}
                      className="-me-1 shrink-0 rounded-md p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                    >
                      <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
    </>
  );

  const countLabel =
    integrations.length === 1
      ? t("banksConnectedOne", { count: integrations.length })
      : t("banksConnectedOther", { count: integrations.length });

  return (
    <>
      <SectionShell title={t("title")} description={t("description")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {countLabel}
            {lastSync ? (
              <>
                {" · "}
                <span className="text-foreground/80">
                  {t("lastSync", { time: formatLastSync(lastSync, labels) })}
                </span>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncAll}
              disabled={integrations.length === 0 || anySyncing}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {anySyncing ? t("syncing") : t("syncAll")}
            </Button>
            {availableToAdd.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button size="sm" className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      {t("addBank")}
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="w-56">
                  {availableToAdd.map((b) => {
                    // How many accounts already exist for this provider, so the
                    // menu can say "another account" instead of implying a replace.
                    const existing = integrations.filter(
                      (i) => getBaseBankProvider(i.provider) === b.id
                    ).length;
                    return (
                      <DropdownMenuItem
                        key={b.id}
                        onClick={() =>
                          setSheet({
                            open: true,
                            mode: "add",
                            providerId: b.id,
                          })
                        }
                      >
                        <span className="flex w-full items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: b.color }}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {translateProviderName(b.id, b.name, tBanks)}
                          </span>
                          {existing > 0 && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              חשבון נוסף ({existing} קיים)
                            </span>
                          )}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>

        <div className="space-y-8">
          <ConnGroup title="חשבונות בנק" hint="עובר ושב - מהם נמשכות התנועות">
            {renderList(bankIntegrations, "לא חוברו חשבונות בנק.")}
          </ConnGroup>

          <ConnGroup
            title="כרטיסי אשראי"
            hint="פירוט העסקאות. חיוב הכרטיס בבנק מסומן כהעברה ולא נספר פעמיים"
          >
            {renderList(cardIntegrations, "לא חוברו כרטיסי אשראי.")}
          </ConnGroup>

          <ConnGroup
            title="גופי חיסכון"
            hint="פנסיה, גמל, השתלמות וביטוח מנהלים - קריאת יתרות בלבד"
          >
            <BalanceConnections family="pension" />
          </ConnGroup>

          <ConnGroup
            title="בתי השקעות"
            hint="חשבונות מסחר - קריאת יתרות בלבד, ללא פעולות"
          >
            <BalanceConnections family="broker" />
          </ConnGroup>
        </div>
      </SectionShell>

      <BankDetailSheet
        open={sheet.open}
        mode={sheet.mode}
        providerId={sheet.providerId}
        connected={sheetIntegration}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
      />
    </>
  );
}

function StatusPill({
  lastSyncAt,
  syncing,
}: {
  lastSyncAt: string | null;
  syncing: boolean;
}) {
  const t = useTranslations("settings.bank");
  if (syncing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-sm text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> {t("statusSyncing")}
      </span>
    );
  }
  if (!lastSyncAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
        <CircleAlert className="h-3 w-3" /> {t("statusNeverSynced")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
      <CircleCheck className="h-3 w-3" /> {t("statusConnected")}
    </span>
  );
}

function SyncShortButton({
  syncing,
  stage,
  onClick,
}: {
  syncing: boolean;
  stage: string;
  onClick: () => void;
}) {
  const t = useTranslations("settings.bank");
  if (syncing) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="hidden sm:inline">{stage || t("syncing")}</span>
      </span>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      className="shrink-0 gap-1.5"
      onClick={onClick}
    >
      <RefreshCw className="h-3.5 w-3.5" />
      {t("syncShort")}
    </Button>
  );
}
