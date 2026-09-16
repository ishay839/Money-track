"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { GripVertical, Plus, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionShell } from "@/components/settings/section-shell";
import { CategoryDetailSheet } from "@/components/settings/category-detail-sheet";
import { SmartAssignDialog } from "@/components/settings/smart-assign-dialog";
import { getMonthRange } from "@/lib/formatters";
import {
  createCategory,
  getCategories,
  getSummary,
  setCategoryParent,
} from "@/lib/api";
import type { Category, CategoryKind, CategoryWithData } from "@/lib/types";
import { translateCategoryName } from "@/lib/i18n-data";

const UNGROUPED = "__ungrouped__";

export default function CategoriesSettingsPage() {
  const t = useTranslations("settings.categories");
  const common = useTranslations("common");
  const tCat = useTranslations("categoriesSeeded");
  const queryClient = useQueryClient();
  const { from, to } = getMonthRange();

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
  });
  const { data: summary } = useQuery({
    queryKey: ["summary", from, to],
    queryFn: () => getSummary({ from, to }),
  });

  const [search, setSearch] = useState("");
  const [activeKind, setActiveKind] = useState<CategoryKind>("expense");
  const [openId, setOpenId] = useState<number | null>(null);
  const [smartOpen, setSmartOpen] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const dataByCategoryId = useMemo(() => {
    const m = new Map<number, CategoryWithData>();
    summary?.categoriesWithData.forEach((c) => m.set(c.categoryId, c));
    return m;
  }, [summary]);

  const ofKind = useMemo(
    () => (categories ?? []).filter((c) => c.kind === activeKind),
    [categories, activeKind]
  );

  const { groups, childrenByParent, ungrouped } = useMemo(() => {
    const parentIds = new Set(
      ofKind.map((c) => c.parentId).filter((id): id is number => id != null)
    );
    // A group is one the user declared, or (for rows predating that flag) one
    // that already holds categories. Without the declared half, a new empty
    // group would fall into the ungrouped tray and could never be filled.
    const isGroup = (c: Category) =>
      c.parentId == null && (c.isGroup === 1 || parentIds.has(c.id));
    const groups = ofKind
      .filter(isGroup)
      .sort((a, b) => a.name.localeCompare(b.name, "he"));
    const childrenByParent = new Map<number, Category[]>();
    for (const c of ofKind) {
      if (c.parentId == null) continue;
      const list = childrenByParent.get(c.parentId) ?? [];
      list.push(c);
      childrenByParent.set(c.parentId, list);
    }
    childrenByParent.forEach((list) =>
      list.sort((a, b) => a.name.localeCompare(b.name, "he"))
    );
    const ungrouped = ofKind
      .filter((c) => c.parentId == null && !isGroup(c))
      .sort((a, b) => a.name.localeCompare(b.name, "he"));
    return { groups, childrenByParent, ungrouped };
  }, [ofKind]);

  // Search filters which cards show, but never which groups exist - a group
  // must stay on screen while filtered so it is still a drop target.
  const matches = (c: Category) =>
    search.trim().length === 0 ||
    translateCategoryName(c.name, tCat)
      .toLocaleLowerCase("he-IL")
      .includes(search.trim().toLocaleLowerCase("he-IL"));

  const moveMutation = useMutation({
    mutationFn: ({
      categoryId,
      parentId,
    }: {
      categoryId: number;
      parentId: number | null;
    }) => setCategoryParent(categoryId, parentId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      const moved = ofKind.find((c) => c.id === variables.categoryId);
      const parent =
        variables.parentId != null
          ? ofKind.find((c) => c.id === variables.parentId)
          : null;
      const name = moved ? translateCategoryName(moved.name, tCat) : "";
      toast.success(
        parent
          ? t("movedToast", {
              name,
              parent: translateCategoryName(parent.name, tCat),
            })
          : t("movedToUngrouped", { name })
      );
    },
    onError: () => toast.error(t("moveFailed")),
  });

  const handleDrop = (targetKey: string) => {
    setDropTarget(null);
    const categoryId = dragId;
    setDragId(null);
    if (categoryId == null) return;

    const dragged = ofKind.find((c) => c.id === categoryId);
    if (!dragged) return;

    const parentId = targetKey === UNGROUPED ? null : Number(targetKey);
    if (dragged.parentId === parentId) return;
    // Dropping a group onto itself is not a move.
    if (parentId === categoryId) return;

    moveMutation.mutate({ categoryId, parentId });
  };

  // A group with children underneath it cannot be filed inside another group:
  // the schema is only two levels deep, so that drop is never legal.
  const draggedIsGroup = dragId != null && groups.some((g) => g.id === dragId);

  return (
    <>
      <SectionShell title={t("title")} description={t("description")} fullWidth>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-border bg-card p-0.5">
            <KindTab
              active={activeKind === "expense"}
              onClick={() => setActiveKind("expense")}
            >
              {t("tabExpense")}
            </KindTab>
            <KindTab
              active={activeKind === "income"}
              onClick={() => setActiveKind("income")}
            >
              {t("tabIncome")}
            </KindTab>
          </div>
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute start-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/70" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="ps-8"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setSmartOpen(true)}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t("smartAssignButton")}
          </Button>
          <NewCategoryDialog kind={activeKind} groups={groups} />
          <NewGroupDialog kind={activeKind} />
        </div>

        <p className="text-sm text-muted-foreground">{t("boardHint")}</p>

        {!categories ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {common("loading")}
          </div>
        ) : ofKind.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {t("noMatching")}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* The unassigned pile is a full-width tray rather than a column:
                with dozens of loose categories a narrow column becomes a
                skyscraper that dwarfs every group beside it. */}
            {(ungrouped.length > 0 || dragId != null) && (
              <UngroupedTray
                categories={ungrouped.filter(matches)}
                total={ungrouped.length}
                dataById={dataByCategoryId}
                onSelect={setOpenId}
                isDropTarget={dropTarget === UNGROUPED}
                canAcceptDrop={dragId != null && !draggedIsGroup}
                onDragOver={() => setDropTarget(UNGROUPED)}
                onDragLeave={() => setDropTarget(null)}
                onDrop={() => handleDrop(UNGROUPED)}
                onDragStartCategory={setDragId}
                onDragEndCategory={() => {
                  setDragId(null);
                  setDropTarget(null);
                }}
                tCat={tCat}
                title={t("ungrouped")}
                dropLabel={t("dropHere")}
                emptyLabel={t("emptyGroup")}
              />
            )}

            {/* Groups spread across the width instead of one long scroll. In
                RTL the first column lands on the right, which is the order the
                cards are read in. */}
            <div className="min-w-0 flex-1 gap-4 [column-fill:_balance] sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5">
              {groups.map((group) => (
                <GroupColumn
                  key={group.id}
                  group={group}
                  categories={(childrenByParent.get(group.id) ?? []).filter(
                    matches
                  )}
                  dataById={dataByCategoryId}
                  onSelect={setOpenId}
                  isDropTarget={dropTarget === String(group.id)}
                  canAcceptDrop={dragId != null && !draggedIsGroup}
                  onDragOver={() => setDropTarget(String(group.id))}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={() => handleDrop(String(group.id))}
                  onDragStartCategory={setDragId}
                  onDragEndCategory={() => {
                    setDragId(null);
                    setDropTarget(null);
                  }}
                  tCat={tCat}
                  emptyLabel={t("emptyGroup")}
                  dropLabel={t("dropHere")}
                  editLabel={t("editGroup")}
                />
              ))}
            </div>
          </div>
        )}
      </SectionShell>

      <SmartAssignDialog
        kind={activeKind}
        open={smartOpen}
        onClose={() => setSmartOpen(false)}
      />

      <CategoryDetailSheet
        categoryId={openId}
        data={openId != null ? (dataByCategoryId.get(openId) ?? null) : null}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

function KindTab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function UngroupedTray({
  categories,
  total,
  dataById,
  onSelect,
  isDropTarget,
  canAcceptDrop,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStartCategory,
  onDragEndCategory,
  tCat,
  title,
  dropLabel,
  emptyLabel,
}: {
  categories: Category[];
  total: number;
  dataById: Map<number, CategoryWithData>;
  onSelect: (id: number) => void;
  isDropTarget: boolean;
  canAcceptDrop: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragStartCategory: (id: number) => void;
  onDragEndCategory: () => void;
  tCat: ReturnType<typeof useTranslations<"categoriesSeeded">>;
  title: string;
  dropLabel: string;
  emptyLabel: string;
}) {
  return (
    <section
      onDragOver={(e) => {
        if (!canAcceptDrop) return;
        e.preventDefault();
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={`rounded-2xl border transition-colors ${
        isDropTarget
          ? "border-primary bg-accent/40 ring-2 ring-primary/30"
          : "border-dashed border-border bg-muted/20"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" />
        <span className="text-base font-bold">{title}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {total}
        </span>
        <span className="ms-auto text-sm text-muted-foreground">
          {isDropTarget ? dropLabel : "גררו מכאן אל אחת הקבוצות"}
        </span>
      </div>
      {categories.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {isDropTarget ? dropLabel : emptyLabel}
        </p>
      ) : (
        <ul className="gap-x-5 p-2 sm:columns-2 lg:columns-4 xl:columns-5 2xl:columns-6">
          {categories.map((c) => (
            <div key={c.id} className="break-inside-avoid">
              <CategoryChip
                category={c}
                data={dataById.get(c.id) ?? null}
                onSelect={() => onSelect(c.id)}
                onDragStart={() => onDragStartCategory(c.id)}
                onDragEnd={onDragEndCategory}
                tCat={tCat}
              />
            </div>
          ))}
        </ul>
      )}
    </section>
  );
}

function GroupColumn({
  group,
  title,
  categories,
  dataById,
  onSelect,
  isDropTarget,
  canAcceptDrop,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStartCategory,
  onDragEndCategory,
  tCat,
  emptyLabel,
  dropLabel,
  editLabel,
}: {
  group: Category | null;
  title?: string;
  categories: Category[];
  dataById: Map<number, CategoryWithData>;
  onSelect: (id: number) => void;
  isDropTarget: boolean;
  canAcceptDrop: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragStartCategory: (id: number) => void;
  onDragEndCategory: () => void;
  tCat: ReturnType<typeof useTranslations<"categoriesSeeded">>;
  emptyLabel: string;
  dropLabel: string;
  editLabel: string;
}) {
  const label = group ? translateCategoryName(group.name, tCat) : (title ?? "");
  return (
    <section
      onDragOver={(e) => {
        if (!canAcceptDrop) return;
        // Without preventDefault the browser refuses the drop entirely.
        e.preventDefault();
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={`mb-4 break-inside-avoid rounded-2xl border bg-card transition-colors ${
        isDropTarget
          ? "border-primary bg-accent/40 ring-2 ring-primary/30"
          : "border-border"
      }`}
    >
      <div className="border-b border-border/60 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: group?.color ?? "#9ca3af" }}
          />
          <span
            className="min-w-0 flex-1 text-base font-bold leading-tight"
            title={label}
          >
            {label}
          </span>
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {categories.length}
          </span>
        </div>
        {group && (
          <button
            type="button"
            onClick={() => onSelect(group.id)}
            className="mt-0.5 text-sm font-medium text-muted-foreground/70 hover:text-foreground"
          >
            {editLabel}
          </button>
        )}
      </div>

      <ul className="p-2">
        {categories.length === 0 ? (
          <li className="px-2 py-4 text-center text-sm text-muted-foreground">
            {isDropTarget ? dropLabel : emptyLabel}
          </li>
        ) : (
          categories.map((c) => (
            <CategoryChip
              key={c.id}
              category={c}
              data={dataById.get(c.id) ?? null}
              onSelect={() => onSelect(c.id)}
              onDragStart={() => onDragStartCategory(c.id)}
              onDragEnd={onDragEndCategory}
              tCat={tCat}
            />
          ))
        )}
      </ul>
    </section>
  );
}

function CategoryChip({
  category,
  data,
  onSelect,
  onDragStart,
  onDragEnd,
  tCat,
}: {
  category: Category;
  data: CategoryWithData | null;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  tCat: ReturnType<typeof useTranslations<"categoriesSeeded">>;
}) {
  return (
    <li
      draggable
      onDragStart={(e) => {
        // Firefox will not start a drag unless data is set on the transfer.
        e.dataTransfer.setData("text/plain", String(category.id));
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="group flex cursor-grab items-center gap-1.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted/60 active:cursor-grabbing"
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground" />
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: category.color }}
      />
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 truncate text-start text-[15px] font-medium"
      >
        {translateCategoryName(category.name, tCat)}
      </button>
      {data && data.spent > 0 && (
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          ₪{Math.round(data.spent).toLocaleString("he-IL")}
        </span>
      )}
    </li>
  );
}

/** Creates a plain (leaf) category, optionally straight into a group. */
function NewCategoryDialog({
  kind,
  groups,
}: {
  kind: CategoryKind;
  groups: Category[];
}) {
  const t = useTranslations("settings.categories");
  const common = useTranslations("common");
  const tCat = useTranslations("categoriesSeeded");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>(UNGROUPED);

  const mutation = useMutation({
    mutationFn: async () => {
      const created = await createCategory({
        name: name.trim(),
        kind,
        isParent: false,
      });
      // The create endpoint takes no parent, so a chosen group is applied as
      // a follow-up move.
      if (parentId !== UNGROUPED) {
        await setCategoryParent(created.id, Number(parentId));
      }
      return created;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success(t("createdToast", { name: created.name }));
      setName("");
      setParentId(UNGROUPED);
      setOpen(false);
    },
    onError: (err: Error) =>
      toast.error(err.message || t("createCategoryFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            {t("newCategoryButton")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("newCategoryDialogTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-category-name">{t("newCategoryName")}</Label>
            <Input
              id="new-category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("newCategoryNamePlaceholder")}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim().length > 0) {
                  mutation.mutate();
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("newCategoryParent")}</Label>
            <Select
              value={parentId}
              onValueChange={(v) => v && setParentId(String(v))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNGROUPED}>
                  {t("newCategoryParentNone")}
                </SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {translateCategoryName(g.name, tCat)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {common("cancel")}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={name.trim().length === 0 || mutation.isPending}
          >
            {mutation.isPending ? common("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewGroupDialog({ kind }: { kind: CategoryKind }) {
  const t = useTranslations("settings.categories");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [k, setK] = useState<CategoryKind>(kind);

  const mutation = useMutation({
    mutationFn: () =>
      createCategory({ name: name.trim(), kind: k, isParent: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success(t("createdToast", { name: name.trim() }));
      setName("");
      setOpen(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || t("createGroupFailed"));
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setK(kind);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            {t("newGroupButton")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("newGroupDialogTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-group-name">{t("newGroupName")}</Label>
            <Input
              id="new-group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("newGroupNamePlaceholder")}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim().length > 0) {
                  mutation.mutate();
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("newGroupKind")}</Label>
            <Select
              value={k}
              onValueChange={(v) => v && setK(v as CategoryKind)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">{t("tabExpense")}</SelectItem>
                <SelectItem value="income">{t("tabIncome")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {common("cancel")}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={name.trim().length === 0 || mutation.isPending}
          >
            {mutation.isPending ? common("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
