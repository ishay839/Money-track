"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Layers, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getTracks, type Track } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import { TrackEditor } from "./track-editor";
import { TrackDetailSheet } from "./track-detail-sheet";

export const MODE_LABEL: Record<Track["mode"], string> = {
  excluded: "מוחרג מהתזרים",
  net_income: "נטו בתזרים",
  included: "נספר בתזרים",
};

const MODE_HELP: Record<Track["mode"], string> = {
  excluded:
    "ההכנסות וההוצאות של המסלול לא נספרות בתזרים השוטף כלל. הן נשארות כאן בלבד.",
  net_income:
    "התזרים השוטף מקבל שורה אחת בחודש - ההכנסות פחות ההוצאות של המסלול.",
  included:
    "הכל ממשיך להיספר בתזרים השוטף כרגיל. המסלול משמש לתצוגה בלבד.",
};

/**
 * Tracks: a named slice of the ledger with its own cash flow. The rental
 * apartment is the motivating case - rent in, mortgage and insurance and
 * repairs out - but nothing here is property-specific, so a car, a business
 * or a renovation works the same way.
 */
export function TracksPage() {
  const tCat = useTranslations("categoriesSeeded");
  const [year, setYear] = useState(new Date().getFullYear());
  const [editing, setEditing] = useState<Track | "new" | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["tracks", year],
    queryFn: () => getTracks(year),
  });
  const tracks = query.data?.tracks ?? [];

  const refresh = () => {
    for (const key of ["tracks", "track", "summary", "home", "transactions"]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };

  return (
    <>
      <PageHeader
        title="מסלולים"
        meta={`${year}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-10 items-center gap-1 rounded-xl border border-border bg-card px-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                aria-label="שנה קודמת"
                onClick={() => setYear((y) => y - 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="min-w-14 text-center text-sm font-bold tabular-nums">
                {year}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                aria-label="שנה הבאה"
                disabled={year >= new Date().getFullYear()}
                onClick={() => setYear((y) => y + 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={() => setEditing("new")} className="gap-1.5">
              <Plus className="h-4 w-4" />
              מסלול חדש
            </Button>
          </div>
        }
      />

      <div className="space-y-6 p-4 md:p-6 lg:p-8">
        <p className="max-w-3xl text-base text-muted-foreground">
          מסלול הוא פינה נפרדת בתזרים - למשל דירה להשקעה, שמכניסה שכר דירה
          ומוציאה משכנתא, ביטוח ותיקונים. במקום שהכל יתערבב בתזרים המשפחתי, אתם
          רואים כאן את התמונה הנפרדת שלה ובוחרים אם ואיך היא משפיעה על השוטף.
        </p>

        {query.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-52 w-full rounded-xl" />
            <Skeleton className="h-52 w-full rounded-xl" />
          </div>
        ) : tracks.length === 0 ? (
          <div className="surface flex flex-col items-center gap-3 p-12 text-center">
            <Layers className="h-9 w-9 text-muted-foreground" />
            <h2 className="text-lg font-bold">עדיין אין מסלולים</h2>
            <p className="max-w-md text-base text-muted-foreground">
              צרו מסלול, בחרו את הקטגוריות ששייכות אליו, והתזרים שלו יופרד
              מהשוטף. שום תנועה לא זזה ושום היסטוריה לא הולכת לאיבוד.
            </p>
            <Button onClick={() => setEditing("new")} className="mt-1 gap-1.5">
              <Plus className="h-4 w-4" />
              יצירת המסלול הראשון
            </Button>
          </div>
        ) : (
          <div
            className={`grid gap-4 ${tracks.length > 1 ? "lg:grid-cols-2" : "max-w-2xl"}`}
          >
            {tracks.map((track) => (
              <TrackCard
                key={track.id}
                track={track}
                onOpen={() => setOpenId(track.id)}
                onEdit={() => setEditing(track)}
              />
            ))}
          </div>
        )}
      </div>

      {editing !== null && (
        <TrackEditor
          track={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
            toast.success("המסלול נשמר");
          }}
          translate={(name) => translateCategoryName(name, tCat)}
        />
      )}

      <TrackDetailSheet
        trackId={openId}
        year={year}
        onClose={() => setOpenId(null)}
        translate={(name) => translateCategoryName(name, tCat)}
      />
    </>
  );
}

function TrackCard({
  track,
  onOpen,
  onEdit,
}: {
  track: Track;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const positive = track.net >= 0;
  return (
    <div
      className="surface flex flex-col p-5"
      style={{ borderTop: `3px solid ${track.color}` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onOpen}
            className="text-start text-lg font-bold tracking-tight text-primary underline-offset-4 hover:underline"
          >
            {track.name}
          </button>
          <div className="mt-1 text-sm text-muted-foreground">
            {track.categoryIds.length} קטגוריות · {track.transactionCount} תנועות
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{
            backgroundColor: `color-mix(in oklch, ${track.color} 14%, transparent)`,
            color: track.color,
          }}
          title={MODE_HELP[track.mode]}
        >
          {MODE_LABEL[track.mode]}
        </span>
      </div>

      <div className="mt-5">
        <div className="card-label">תזרים נטו · השנה</div>
        <div
          className="metric-xl mt-1"
          style={{
            color: positive ? "var(--status-on-track)" : "var(--status-over)",
          }}
        >
          {positive ? "+" : "−"}
          {formatCurrency(Math.abs(track.net))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted/50 p-3">
          <div className="text-xs font-medium text-muted-foreground">הכנסות</div>
          <div
            className="metric-sm mt-0.5"
            style={{ color: "var(--status-on-track)" }}
          >
            {formatCurrency(track.income)}
          </div>
        </div>
        <div className="rounded-xl bg-muted/50 p-3">
          <div className="text-xs font-medium text-muted-foreground">הוצאות</div>
          <div className="metric-sm mt-0.5" style={{ color: "var(--status-over)" }}>
            {formatCurrency(track.expenses)}
          </div>
        </div>
      </div>

      {/* income vs expense proportion, at a glance */}
      <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full"
          style={{
            width: `${bar(track.income, track.expenses)}%`,
            backgroundColor: "var(--status-on-track)",
          }}
        />
        <div
          className="h-full"
          style={{
            width: `${bar(track.expenses, track.income)}%`,
            backgroundColor: "var(--status-over)",
          }}
        />
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="sm" onClick={onOpen} className="flex-1">
          פירוט
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          עריכה
        </Button>
      </div>
    </div>
  );
}

function bar(part: number, other: number): number {
  const total = part + other;
  return total > 0 ? (part / total) * 100 : 0;
}
