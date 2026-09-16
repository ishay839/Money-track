"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createTrack,
  deleteTrack,
  getCategories,
  updateTrack,
  type Track,
  type TrackMode,
} from "@/lib/api";
import type { Category } from "@/lib/types";

/** A parent group and its leaves. `parent: null` = ungrouped. */
interface Group {
  parent: Category | null;
  allChildren: Category[];
  children: Category[];
}

const MODES: Array<{ value: TrackMode; label: string; help: string }> = [
  {
    value: "excluded",
    label: "מוחרג מהתזרים",
    help: "הכי נפוץ. התזרים המשפחתי לא רואה את המסלול כלל - לא כהכנסה ולא כהוצאה.",
  },
  {
    value: "net_income",
    label: "נטו בתזרים",
    help: "התזרים מקבל שורה אחת בחודש: ההכנסות פחות ההוצאות. מתאים כשהמסלול מייצר עודף שאתם באמת מוציאים ממנו.",
  },
  {
    value: "included",
    label: "נספר בתזרים",
    help: "שום שינוי בתזרים. המסלול נותן תצוגה נפרדת בלבד.",
  },
];

const COLORS = [
  "#0F766E",
  "#1D4ED8",
  "#B45309",
  "#7C3AED",
  "#BE123C",
  "#0891B2",
];

/**
 * Create or edit a track. The heart of it is the category picker: a track is
 * defined entirely by which existing categories belong to it, so that list is
 * given the room, with income and expense split apart because the whole point
 * of a track is seeing those two sides against each other.
 */
export function TrackEditor({
  track,
  onClose,
  onSaved,
  translate,
}: {
  track: Track | null;
  onClose: () => void;
  onSaved: () => void;
  translate: (name: string) => string;
}) {
  const [name, setName] = useState(track?.name ?? "");
  const [mode, setMode] = useState<TrackMode>(track?.mode ?? "excluded");
  const [color, setColor] = useState(track?.color ?? COLORS[0]);
  const [selected, setSelected] = useState<Set<number>>(
    new Set(track?.categoryIds ?? [])
  );
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ["categories", "all"],
    queryFn: () => getCategories(),
  });

  // `initial` freezes which categories were already in the track when the
  // dialog opened. Sorting by live selection instead would make rows jump
  // out from under the cursor the moment they are ticked.
  const [initial] = useState<Set<number>>(
    () => new Set(track?.categoryIds ?? [])
  );

  const { income, expense } = useMemo(() => {
    const all = categoriesQuery.data ?? [];
    const q = filter.trim();
    const match = (c: Category) =>
      !q || c.name.includes(q) || translate(c.name).includes(q);
    // Parents are aggregates, never carry transactions themselves - only their
    // leaves are ever stored as track members. The parent row exists here so a
    // whole group can be taken in one click.
    const isParent = (c: Category) =>
      all.some((other) => other.parentId === c.id);
    const leaves = all.filter((c) => !isParent(c));

    // The track's own categories float to the top: with ~90 categories they
    // would otherwise be lost somewhere down an alphabetical list, and what
    // the track already contains is the first thing you come here to check.
    const order = (list: Category[]) =>
      [...list].sort(
        (a, b) => Number(initial.has(b.id)) - Number(initial.has(a.id))
      );

    // A group survives the filter if its own name matches or any child does,
    // so searching "דירה" still shows the group it lives in.
    const build = (wanted: (c: Category) => boolean): Group[] => {
      const parents = all.filter((c) => isParent(c) && wanted(c));
      const groups: Group[] = [];
      for (const parent of parents) {
        // A matching group name shows all its children; otherwise only the
        // children that match. `wanted` always applies, so an income leaf can
        // never surface in the expense column.
        const mine = leaves.filter(
          (c) => c.parentId === parent.id && wanted(c)
        );
        const shown = order(match(parent) ? mine : mine.filter(match));
        if (shown.length > 0) {
          groups.push({ parent, allChildren: mine, children: shown });
        }
      }
      const loose = order(
        leaves.filter((c) => wanted(c) && c.parentId == null && match(c))
      );
      if (loose.length > 0) {
        groups.push({ parent: null, allChildren: loose, children: loose });
      }
      return groups;
    };

    return {
      income: build((c) => c.kind === "income"),
      expense: build((c) => c.kind !== "income"),
    };
  }, [categoriesQuery.data, filter, translate, initial]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  /** Take or drop a whole group at once - the point of grouping them here. */
  const toggleGroup = (children: Category[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const allIn = children.every((c) => next.has(c.id));
      for (const c of children) {
        if (allIn) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });

  const save = async () => {
    setBusy(true);
    try {
      const categoryIds = [...selected];
      if (track) {
        await updateTrack({ id: track.id, name, mode, color, categoryIds });
      } else {
        await createTrack({ name, mode, color, categoryIds });
      }
      onSaved();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "שמירת המסלול נכשלה"
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!track) return;
    if (
      !window.confirm(
        `למחוק את המסלול "${track.name}"? התנועות והקטגוריות יישארו כמו שהן ויחזרו להיספר בתזרים השוטף.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteTrack(track.id);
      onSaved();
    } catch {
      toast.error("מחיקת המסלול נכשלה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-2xl!">
        <DialogHeader>
          <DialogTitle>{track ? "עריכת מסלול" : "מסלול חדש"}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              שם המסלול
              <Input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="למשל: הדירה באופקים"
              />
            </label>
            <div className="grid gap-2 text-sm font-medium">
              צבע
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`צבע ${c}`}
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                    className={`h-8 w-8 rounded-full transition-transform ${
                      color === c
                        ? "scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-background"
                        : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">
              איך המסלול משפיע על התזרים השוטף
            </legend>
            <div className="grid gap-2">
              {MODES.map((m) => (
                <label
                  key={m.value}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
                    mode === m.value
                      ? "border-primary bg-accent/40"
                      : "border-border hover:bg-accent/20"
                  }`}
                >
                  <input
                    type="radio"
                    name="track-mode"
                    className="mt-1"
                    checked={mode === m.value}
                    onChange={() => setMode(m.value)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {m.label}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {m.help}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">
                קטגוריות במסלול
                <span className="ms-2 text-muted-foreground">
                  {selected.size} נבחרו
                </span>
              </span>
              <div className="relative">
                <Search className="pointer-events-none absolute end-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="חיפוש קטגוריה"
                  className="h-9 w-48 pe-8"
                />
              </div>
            </div>

            {categoriesQuery.isLoading ? (
              <Skeleton className="h-64 w-full rounded-xl" />
            ) : (
              <div className="grid max-h-72 gap-4 overflow-y-auto rounded-xl border border-border p-3 sm:grid-cols-2">
                <CategoryColumn
                  title="הכנסות"
                  tone="var(--status-on-track)"
                  groups={income}
                  selected={selected}
                  onToggle={toggle}
                  onToggleGroup={toggleGroup}
                  translate={translate}
                />
                <CategoryColumn
                  title="הוצאות"
                  tone="var(--status-over)"
                  groups={expense}
                  selected={selected}
                  onToggle={toggle}
                  onToggleGroup={toggleGroup}
                  translate={translate}
                />
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              סימון קבוצת אב מוסיף את כל הקטגוריות שבתוכה בבת אחת. קטגוריה
              שייכת למסלול אחד בלבד; אם היא כבר במסלול אחר, היא תעבור לכאן.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "שומר…" : "שמירה"}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              ביטול
            </Button>
            {track && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void remove()}
                className="ms-auto text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                מחיקת המסלול
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CategoryColumn({
  title,
  tone,
  groups,
  selected,
  onToggle,
  onToggleGroup,
  translate,
}: {
  title: string;
  tone: string;
  groups: Group[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleGroup: (children: Category[]) => void;
  translate: (name: string) => string;
}) {
  return (
    <div className="min-w-0">
      <div className="card-label mb-2" style={{ color: tone }}>
        {title}
      </div>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">אין קטגוריות תואמות.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <GroupBlock
              key={g.parent ? g.parent.id : "__loose__"}
              group={g}
              selected={selected}
              onToggle={onToggle}
              onToggleGroup={onToggleGroup}
              translate={translate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One parent group with its leaves. The group checkbox is the whole point:
 * tick it and every category inside joins the track at once. It shows a dash
 * when only some children are in, so a partial group never looks empty.
 */
function GroupBlock({
  group,
  selected,
  onToggle,
  onToggleGroup,
  translate,
}: {
  group: Group;
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleGroup: (children: Category[]) => void;
  translate: (name: string) => string;
}) {
  const { parent, allChildren, children } = group;
  const inCount = allChildren.filter((c) => selected.has(c.id)).length;
  const allIn = inCount === allChildren.length;
  const someIn = inCount > 0 && !allIn;

  return (
    <div className="min-w-0">
      {parent ? (
        <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-accent/30 px-2 py-1.5 text-sm font-semibold hover:bg-accent/50">
          <input
            type="checkbox"
            checked={allIn}
            ref={(el) => {
              if (el) el.indeterminate = someIn;
            }}
            onChange={() => onToggleGroup(allChildren)}
          />
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: parent.color }}
          />
          <span className="min-w-0 flex-1 truncate">
            {translate(parent.name)}
          </span>
          <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
            {inCount}/{allChildren.length}
          </span>
        </label>
      ) : (
        <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
          ללא קבוצה
        </div>
      )}
      <ul className={parent ? "mt-0.5 space-y-1 ps-5" : "space-y-1"}>
        {children.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent/40">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => onToggle(c.id)}
              />
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              <span className="min-w-0 flex-1 truncate">
                {translate(c.name)}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
