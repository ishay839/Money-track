"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createHolding,
  deleteHolding,
  getNetWorth,
  updateHolding,
  type HoldingSide,
  type ManualHolding,
} from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * The household balance sheet: what the scrapers found, plus the big numbers
 * that cannot be scraped (a property's value, a mortgage's remaining balance),
 * netted into a single equity figure.
 */
export function BalanceSheet() {
  const t = useTranslations("balanceSheet");
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState<HoldingSide | null>(null);
  const [editing, setEditing] = useState<ManualHolding | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["net-worth"],
    queryFn: getNetWorth,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["net-worth"] });
    queryClient.invalidateQueries({ queryKey: ["balances"] });
  };

  const removeMutation = useMutation({
    mutationFn: (id: number) => deleteHolding(id),
    onSuccess: invalidate,
    onError: () => toast.error(t("saveFailed")),
  });

  if (isLoading || !data) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  const assets = data.holdings.filter((h) => h.side === "asset");
  const liabilities = data.holdings.filter((h) => h.side === "liability");
  const positive = data.net >= 0;

  return (
    <section className="space-y-4" aria-label={t("title")}>
      <div>
        <h2 className="text-xl font-bold tracking-tight">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Keep the headline focused: the detailed balances are listed above. */}
      <div className="surface p-6">
        <div className="card-label">{t("netWorth")}</div>
        <div
          className="metric-xl mt-2"
          style={{
            color: positive ? "var(--status-on-track)" : "var(--status-over)",
          }}
        >
          {formatCurrency(data.net)}
        </div>
        {data.otherCurrencies.length > 0 && (
          <p className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">
            {t("fxNote")}{" "}
            {data.otherCurrencies
              .map(
                (c) =>
                  `${c.currency} ${(c.assets - c.liabilities).toLocaleString("he-IL")}`
              )
              .join(" · ")}
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <HoldingList
          side="asset"
          rows={assets}
          title={t("manualAssets")}
          addLabel={t("addAsset")}
          emptyLabel={t("emptyAssets")}
          emptyHint={t("emptyHint")}
          onAdd={() => setAdding("asset")}
          onEdit={setEditing}
          onDelete={(id) => {
            if (window.confirm(t("deleteConfirm"))) removeMutation.mutate(id);
          }}
          t={t}
        />
        <HoldingList
          side="liability"
          rows={liabilities}
          title={t("liabilities")}
          addLabel={t("addLiability")}
          emptyLabel={t("emptyLiabilities")}
          emptyHint={t("emptyHint")}
          onAdd={() => setAdding("liability")}
          onEdit={setEditing}
          onDelete={(id) => {
            if (window.confirm(t("deleteConfirm"))) removeMutation.mutate(id);
          }}
          t={t}
        />
      </div>

      {(adding !== null || editing !== null) && (
        <HoldingForm
          side={editing ? editing.side : (adding as HoldingSide)}
          existing={editing}
          onDone={() => {
            setAdding(null);
            setEditing(null);
            invalidate();
          }}
          onCancel={() => {
            setAdding(null);
            setEditing(null);
          }}
          t={t}
        />
      )}
    </section>
  );
}

function HoldingList({
  rows,
  title,
  addLabel,
  emptyLabel,
  emptyHint,
  onAdd,
  onEdit,
  onDelete,
  t,
}: {
  side: HoldingSide;
  rows: ManualHolding[];
  title: string;
  addLabel: string;
  emptyLabel: string;
  emptyHint: string;
  onAdd: () => void;
  onEdit: (h: ManualHolding) => void;
  onDelete: (id: number) => void;
  t: ReturnType<typeof useTranslations<"balanceSheet">>;
}) {
  return (
    <div className="surface p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="card-label">{title}</h3>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" />
          {addLabel}
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm font-medium">{emptyLabel}</p>
          <p className="mt-1 text-sm text-muted-foreground">{emptyHint}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((h) => (
            <li key={h.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold">{h.name}</div>
                <div className="text-sm text-muted-foreground">
                  {h.category ? `${h.category} · ` : ""}
                  {t("asOfShort")}
                  {h.asOf}
                  {h.note ? ` · ${h.note}` : ""}
                </div>
              </div>
              <span className="shrink-0 text-[15px] font-bold tabular-nums">
                {h.currency === "ILS"
                  ? formatCurrency(h.amount)
                  : `${h.currency} ${h.amount.toLocaleString("he-IL")}`}
              </span>
              <button
                type="button"
                onClick={() => onEdit(h)}
                title={t("edit")}
                aria-label={`${t("edit")} ${h.name}`}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(h.id)}
                title={t("delete")}
                aria-label={`${t("delete")} ${h.name}`}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HoldingForm({
  side,
  existing,
  onDone,
  onCancel,
  t,
}: {
  side: HoldingSide;
  existing: ManualHolding | null;
  onDone: () => void;
  onCancel: () => void;
  t: ReturnType<typeof useTranslations<"balanceSheet">>;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [category, setCategory] = useState(existing?.category ?? "");
  const [amount, setAmount] = useState(
    existing ? String(existing.amount) : ""
  );
  const [asOf, setAsOf] = useState(existing?.asOf ?? today());
  const [note, setNote] = useState(existing?.note ?? "");

  const mutation = useMutation({
    // Normalised to void: create returns an id and update returns a flag, and
    // the caller uses neither - it just refetches.
    mutationFn: async (): Promise<void> => {
      const payload = {
        name,
        side,
        category: category || null,
        amount: Number(amount),
        asOf,
        note: note || null,
      };
      if (existing) await updateHolding({ id: existing.id, ...payload });
      else await createHolding(payload);
    },
    onSuccess: onDone,
    onError: (err: Error) => toast.error(err.message || t("saveFailed")),
  });

  const valid = name.trim() !== "" && amount !== "" && Number(amount) > 0;

  return (
    <form
      className="surface grid gap-3 p-5 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) mutation.mutate();
      }}
    >
      <label className="grid gap-1.5 text-sm">
        <Label>{t("nameLabel")}</Label>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            side === "asset"
              ? t("namePlaceholderAsset")
              : t("namePlaceholderLiability")
          }
        />
      </label>
      <label className="grid gap-1.5 text-sm">
        <Label>{t("amountLabel")}</Label>
        <Input
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="tabular-nums"
        />
      </label>
      <label className="grid gap-1.5 text-sm">
        <Label>{t("categoryLabel")}</Label>
        <Input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder={t("categoryPlaceholder")}
        />
      </label>
      <label className="grid gap-1.5 text-sm">
        <Label>{t("asOfLabel")}</Label>
        <Input
          type="date"
          value={asOf}
          onChange={(e) => setAsOf(e.target.value)}
        />
      </label>
      <label className="grid gap-1.5 text-sm sm:col-span-2">
        <Label>{t("noteLabel")}</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={!valid || mutation.isPending} className="gap-1.5">
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("save")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
