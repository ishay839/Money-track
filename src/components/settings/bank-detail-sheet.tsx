"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { BANK_PROVIDERS, getBaseBankProvider, type BankProviderInfo } from "@/lib/types";
import { translateProviderName } from "@/lib/i18n-data";
import { useTranslations } from "next-intl";
import {
  deleteIntegration,
  getIntegrationCredentials,
  saveBankCredentials,
  testBankConnection,
  updateIntegrationSettings,
} from "@/lib/api";
import { TwoFactorSection } from "@/components/setup/two-factor-section";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";

export interface BankDetailSheetProps {
  open: boolean;
  mode: "edit" | "add";
  providerId: string | null;
  connected?: {
    provider: string;
    updatedAt: string;
    lastSyncAt: string | null;
    transactionCount: number;
  } | null;
  onClose: () => void;
}

export function BankDetailSheet({
  open,
  mode,
  providerId,
  connected,
  onClose,
}: BankDetailSheetProps) {
  const info = providerId
    ? BANK_PROVIDERS.find((b) => b.id === getBaseBankProvider(providerId)) ?? null
    : null;
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full p-0 sm:max-w-md! md:max-w-lg!"
      >
        {info ? (
          <SheetBody
            info={info}
            mode={mode}
            connected={connected ?? null}
            providerKey={providerId}
            onClose={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({
  info,
  mode,
  connected,
  providerKey,
  onClose,
}: {
  info: BankProviderInfo;
  mode: "edit" | "add";
  connected: BankDetailSheetProps["connected"];
  providerKey: string | null;
  onClose: () => void;
}) {
  const tBanks = useTranslations("banks");
  const localName = translateProviderName(info.id, info.name, tBanks);
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <SheetHeader className="gap-3 border-b border-border/40 p-6">
        <div className="flex items-center gap-3">
          <ProviderBadge
            color={info.color}
            name={localName}
            domain={info.domain}
            size={40}
            radius={10}
          />
          <div className="min-w-0 flex-1">
            <SheetTitle>{localName}</SheetTitle>
            <SheetDescription className="mt-0.5">
              {mode === "add"
                ? "חיבור החשבון לצורך משיכת תנועות"
                : connected
                  ? `מחובר · ${connected.transactionCount} תנועות`
                  : "חיבור מאובטח שנשמר במחשב בלבד"}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-6 p-6">
        <CredentialsForm
          info={info}
          isEdit={mode === "edit"}
          providerKey={providerKey}
          onSaved={onClose}
        />
        {mode === "edit" && connected ? (
          <RecentSyncCard
            provider={connected.provider}
            lastSyncAt={connected.lastSyncAt}
            transactionCount={connected.transactionCount}
          />
        ) : null}
      </div>

      {mode === "edit" && connected ? (
        <div className="border-t border-border/40 p-6">
          <DangerZone provider={connected.provider} onRemoved={onClose} />
        </div>
      ) : null}
    </div>
  );
}

function CredentialsForm({
  info,
  isEdit,
  providerKey,
  onSaved,
}: {
  info: BankProviderInfo;
  isEdit: boolean;
  providerKey: string | null;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const tBanks = useTranslations("banks");
  const localName = translateProviderName(info.id, info.name, tBanks);
  // In "add" mode the caller passes the bare provider id (e.g. "isracard") as
  // providerKey. Carrying that as the connection key would make the save
  // overwrite the account already stored under that id instead of allocating a
  // second one, so a new connection starts with no key and lets the server
  // allocate "isracard:2".
  const [connectionKey, setConnectionKey] = useState<string | null>(
    isEdit ? providerKey : null
  );
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(!isEdit);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requiresManualTwoFactor, setRequiresManualTwoFactor] = useState(false);
  const [hasTwoFactorToken, setHasTwoFactorToken] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getIntegrationCredentials(providerKey ?? info.id);
        if (cancelled) return;
        if (res.credentials) setCredentials(res.credentials);
        setRequiresManualTwoFactor(res.requiresManualTwoFactor);
        setHasTwoFactorToken(res.hasTwoFactorToken);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, info.id, providerKey]);

  const allValid = info.credentialFields.every((f) => {
    const v = credentials[f.key]?.trim() ?? "";
    if (!v) return false;
    if (f.exactLength != null && v.length !== f.exactLength) return false;
    return true;
  });

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const saved = await saveBankCredentials(info.id, credentials, {
        requiresManualTwoFactor,
        connectionKey: connectionKey ?? undefined,
        createNew: !isEdit && !connectionKey,
      });
      setConnectionKey(saved.provider);
      const res = await testBankConnection(saved.provider);
      setResult(res);
    } catch {
      setResult({ success: false, message: "בדיקת החיבור נכשלה." });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveBankCredentials(info.id, credentials, {
        requiresManualTwoFactor,
        connectionKey: connectionKey ?? undefined,
        createNew: !isEdit && !connectionKey,
      });
      setConnectionKey(saved.provider);
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["setupStatus"] });
      toast.success(`פרטי ${localName} נשמרו`);
      onSaved();
    } catch {
      setResult({ success: false, message: "לא הצלחנו לשמור את פרטי החיבור." });
    } finally {
      setSaving(false);
    }
  };

  const handleResetToken = async () => {
    setResetPending(true);
    try {
      await updateIntegrationSettings(info.id, { resetTwoFactorToken: true });
      setHasTwoFactorToken(false);
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      toast.success(
        `Saved 2FA token cleared. Your next ${info.name} sync will ask for a fresh code.`
      );
    } catch {
      toast.error("איפוס האימות הדו־שלבי נכשל.");
    } finally {
      setResetPending(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        טוען את פרטי החיבור…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        פרטי התחברות
      </div>
      {info.credentialFields.map((field) => {
        const value = credentials[field.key] ?? "";
        const tooShort =
          field.exactLength != null &&
          value.length > 0 &&
          value.length !== field.exactLength;
        const fieldLabel = tBanks(`fields.${field.key}.label`);
        const placeholder = fieldLabel;
        const hint = undefined;
        return (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`${info.id}-${field.key}`}>{fieldLabel}</Label>
            <Input
              id={`${info.id}-${field.key}`}
              type={field.type}
              inputMode={field.numeric ? "numeric" : undefined}
              pattern={field.numeric ? "[0-9]*" : undefined}
              maxLength={field.maxLength ?? field.exactLength ?? undefined}
              value={value}
              onChange={(e) => {
                let next = e.target.value;
                if (field.numeric) next = next.replace(/\D/g, "");
                if (field.exactLength) next = next.slice(0, field.exactLength);
                if (field.maxLength) next = next.slice(0, field.maxLength);
                setCredentials((prev) => ({ ...prev, [field.key]: next }));
              }}
              placeholder={placeholder}
              aria-invalid={tooShort || undefined}
            />
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            {tooShort && (
              <p className="text-xs text-destructive">
                יש להזין בדיוק {field.exactLength} ספרות.
              </p>
            )}
          </div>
        );
      })}

      <TwoFactorSection
        info={info}
        requiresManualTwoFactor={requiresManualTwoFactor}
        hasTwoFactorToken={hasTwoFactorToken}
        onChangeManualFlag={setRequiresManualTwoFactor}
        onResetToken={handleResetToken}
        resetPending={resetPending}
        showResetButton={isEdit}
      />

      {result && (
        <div
          className={`rounded-md p-3 text-sm ${
            result.success
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {result.message}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={!allValid || testing || saving}
        >
          {testing ? "בודק…" : "בדיקת חיבור"}
        </Button>
        <Button onClick={handleSave} disabled={!allValid || saving || testing}>
          {saving ? "שומר…" : "שמירה"}
        </Button>
      </div>
    </div>
  );
}

function RecentSyncCard({
  lastSyncAt,
  transactionCount,
}: {
  provider: string;
  lastSyncAt: string | null;
  transactionCount: number;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        סנכרון אחרון
      </div>
      <div className="mt-2 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
        <div className="font-medium">
          {transactionCount} {transactionCount === 1 ? "תנועה" : "תנועות"}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {lastSyncAt
            ? `סונכרן ${formatRelative(lastSyncAt)}`
            : "טרם סונכרן"}
        </div>
      </div>
    </div>
  );
}

function DangerZone({
  provider,
  onRemoved,
}: {
  provider: string;
  onRemoved: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const mutation = useMutation({
    mutationFn: () => deleteIntegration(provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["setupStatus"] });
      toast.success("החיבור הוסר");
      onRemoved();
    },
  });

  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">הסרת החיבור</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            פרטי ההתחברות יימחקו. תנועות שכבר נשמרו יישארו במערכת.
          </p>
          {!confirming ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-1.5 text-destructive hover:text-destructive"
              onClick={() => setConfirming(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              הסרה
            </Button>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
              >
                ביטול
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "מסיר…" : "אישור הסרה"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso.replace(" ", "T") + "Z");
  const diffSec = (Date.now() - then.getTime()) / 1000;
  if (diffSec < 60) return "ממש עכשיו";
  if (diffSec < 3600) return `לפני ${Math.round(diffSec / 60)} דקות`;
  if (diffSec < 86400) return `לפני ${Math.round(diffSec / 3600)} שעות`;
  if (diffSec < 86400 * 7) return `לפני ${Math.round(diffSec / 86400)} ימים`;
  return then.toLocaleDateString("he-IL", { month: "short", day: "numeric" });
}
