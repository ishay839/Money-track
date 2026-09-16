"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X, RefreshCw, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getBalanceAccounts, balanceAction } from "@/lib/api";
import { BALANCE_PROVIDERS, describeConnection, type BalanceProvider } from "@/lib/balances";
import { useActiveWorkspaceId } from "@/lib/workspace-store";

const selectClass =
  "h-10 min-w-0 max-w-full rounded-lg border border-border bg-background px-3 text-sm";
const stamp = (value: string) =>
  new Date(value).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });

type Family = "broker" | "pension";

/**
 * Connections to savings bodies and brokerages, filtered by family so the
 * settings page can present them as two distinct groups rather than one
 * undifferentiated list.
 */
export function BalanceConnections({ family }: { family: Family }) {
  const workspace = useActiveWorkspaceId();
  return <Inner key={`${workspace}-${family}`} family={family} />;
}

function Inner({ family }: { family: Family }) {
  const workspace = useActiveWorkspaceId();
  const qc = useQueryClient();
  const queryKey = ["balances", workspace];

  const firstOfFamily = (Object.keys(BALANCE_PROVIDERS) as BalanceProvider[]).find(
    (k) => BALANCE_PROVIDERS[k].family === family
  )!;

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [provider, setProvider] = useState<BalanceProvider>(firstOfFamily);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState<number | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: getBalanceAccounts,
    refetchInterval: (q) =>
      q.state.data?.active || starting !== null ? 1500 : 30000,
  });
  const data = query.data;
  const active = data?.active;
  const connections = (data?.connections ?? []).filter(
    (c) => BALANCE_PROVIDERS[c.provider]?.family === family
  );

  const refresh = () => qc.invalidateQueries({ queryKey });
  const act = async (
    method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>,
    sync = false
  ) => {
    try {
      const result = await balanceAction(method, body, sync);
      await refresh();
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "הפעולה נכשלה");
      await refresh();
      return null;
    }
  };

  const add = async () => {
    setBusy(true);
    try {
      if (await act("POST", { provider, name, owner, credentials })) {
        setAdding(false);
        setName("");
        setCredentials({});
      }
    } finally {
      setBusy(false);
    }
  };

  const sync = async (id: number) => {
    setStarting(id);
    try {
      const result = await act("POST", { id, openBrowser: true }, true);
      if (result) toast.success(`נמשכו ${result.count} יתרות`);
    } finally {
      setStarting(null);
    }
  };

  const options = (
    Object.entries(BALANCE_PROVIDERS) as Array<
      [BalanceProvider, (typeof BALANCE_PROVIDERS)[BalanceProvider]]
    >
  ).filter(([, p]) => p.family === family);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setCredentials({});
            setProvider(firstOfFamily);
            setAdding((v) => !v);
          }}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          הוספת חיבור
        </Button>
      </div>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
          className="surface grid gap-4 p-4 sm:grid-cols-2"
        >
          <label className="grid gap-2 text-sm">
            הגוף המנהל
            <select
              className={selectClass}
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as BalanceProvider);
                setCredentials({});
              }}
            >
              {options.map(([key, p]) => (
                <option key={key} value={key}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            בעל החשבון
            <Input
              required
              maxLength={80}
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm sm:col-span-2">
            שם החיבור
            <Input
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <LoginFields
            provider={provider}
            value={credentials}
            onChange={setCredentials}
          />
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={busy || !name.trim() || !owner.trim()}>
              {busy ? "שומר..." : "שמירת חיבור"}
            </Button>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setAdding(false);
                setCredentials({});
              }}
            >
              ביטול
            </Button>
          </div>
        </form>
      )}

      {connections.length === 0 && !adding ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          עדיין לא חוברו חשבונות מסוג זה.
        </div>
      ) : (
        <ul className="space-y-2">
          {connections.map((c) => {
            const info = describeConnection(c);
            return (
            <li
              key={c.id}
              className="surface flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold">
                  {c.name} · {c.owner}
                </div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  {info.name}
                </div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  {c.lastSuccess
                    ? `משיכה אחרונה: ${stamp(c.lastSuccess)}`
                    : "טרם נמשכו יתרות"}
                </div>
                {c.lastError && (
                  <p role="alert" className="mt-1.5 text-sm text-destructive">
                    {c.lastError}
                  </p>
                )}
                {active?.connectionId === c.id && (
                  <p role="status" className="mt-1.5 text-sm font-medium">
                    {active.status}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {active?.connectionId === c.id ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void act("DELETE", { id: c.id }, true)}
                  >
                    <X className="h-4 w-4" />
                    ביטול
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!active || starting !== null}
                    onClick={() => void sync(c.id)}
                  >
                    <RefreshCw className="h-4 w-4" />
                    {starting === c.id ? "מסנכרן..." : "סנכרון"}
                  </Button>
                )}
                {info.managedHere && info.adapter !== "portal" && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="עדכון פרטי התחברות"
                    aria-label={`עדכון התחברות ${c.name}`}
                    disabled={!!active || starting !== null}
                    onClick={() => {
                      setAdding(false);
                      setProvider(c.provider);
                      setCredentials({});
                      setEditing(c.id);
                    }}
                  >
                    <KeyRound className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="הסרת החיבור"
                  aria-label={`הסרת ${c.name}`}
                  disabled={!!active || starting !== null}
                  onClick={() => {
                    if (
                      window.confirm(
                        `להסיר את ${c.name} ואת היסטוריית היתרות שלו? תנועות ההוצאות לא יימחקו.`
                      )
                    )
                      void act("DELETE", { id: c.id });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
            );
          })}
        </ul>
      )}

      {editing !== null && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void (async () => {
              setBusy(true);
              try {
                if (
                  await act("PATCH", {
                    id: editing,
                    action: "credentials",
                    credentials,
                  })
                ) {
                  setEditing(null);
                  setCredentials({});
                }
              } finally {
                setBusy(false);
              }
            })();
          }}
          className="surface grid gap-4 p-4 sm:grid-cols-2"
        >
          <h3 className="text-base font-bold sm:col-span-2">
            עדכון התחברות: {connections.find((c) => c.id === editing)?.name}
          </h3>
          <LoginFields
            provider={provider}
            value={credentials}
            onChange={setCredentials}
          />
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button
              type="submit"
              disabled={busy || !!active || !Object.values(credentials).some(Boolean)}
            >
              שמירת פרטי התחברות
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setCredentials({});
              }}
            >
              ביטול
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function LoginFields({
  provider,
  value,
  onChange,
}: {
  provider: BalanceProvider;
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
}) {
  const config = BALANCE_PROVIDERS[provider];
  if (config.adapter === "portal") {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground sm:col-span-2">
        ההזדהות נעשית בחלון המאובטח של הגוף. אין צורך לשמור כאן סיסמה.
      </div>
    );
  }
  const fields =
    config.family === "broker"
      ? ([
          ["username", "שם משתמש"],
          ["password", "סיסמה"],
        ] as const)
      : ([
          ["id", "תעודת זהות"],
          ["phone", "טלפון נייד"],
        ] as const);
  return (
    <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-medium">
        פרטי התחברות · שמירה מוצפנת במחשב
      </legend>
      {fields.map(([key, labelText]) => (
        <label key={key} className="grid gap-2 text-sm">
          {labelText}
          <Input
            maxLength={300}
            type={key === "password" ? "password" : "text"}
            autoComplete={
              key === "password"
                ? "current-password"
                : key === "username"
                  ? "username"
                  : "off"
            }
            value={value[key] ?? ""}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          />
        </label>
      ))}
    </fieldset>
  );
}
