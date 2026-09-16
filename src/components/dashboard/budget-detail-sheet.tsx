"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  HelpCircle,
  Check,
  ChevronDown,
  Pencil,
  type LucideIcon,
  CircleDot,
} from "lucide-react";
import {
  ShoppingBasket,
  UtensilsCrossed,
  TramFront,
  ShoppingBag,
  Ticket,
  HeartPulse,
  GraduationCap,
  Receipt,
  RefreshCw,
  Plane,
  Banknote,
  ArrowLeftRight,
  Shield,
  Home,
  Sparkles,
  Briefcase,
} from "lucide-react";
import {
  approveTransactionCategory,
  getCategories,
  getCategoryDetail,
  updateBudget,
  updateCategoryBudgetMode,
  updateTransactionCategory,
  type CategoryDetail,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Switch } from "@/components/ui/switch";
import { useTranslations } from "next-intl";
import { translateCategoryName } from "@/lib/i18n-data";
import type { Category, TransactionWithCategory } from "@/lib/types";
import type { CategoryChildBreakdown } from "@/lib/api";
import { TransactionNote } from "@/components/dashboard/transaction-note";
import { CategoryHistoryChart } from "@/components/dashboard/category-history-chart";
import { CategoryPicker } from "@/components/dashboard/category-picker";
import { offsetSection } from "@/lib/category-offset";
import { ChevronRight, ChevronLeft } from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  "shopping-basket": ShoppingBasket,
  "utensils-crossed": UtensilsCrossed,
  "tram-front": TramFront,
  "shopping-bag": ShoppingBag,
  ticket: Ticket,
  "heart-pulse": HeartPulse,
  "graduation-cap": GraduationCap,
  receipt: Receipt,
  "refresh-cw": RefreshCw,
  plane: Plane,
  banknote: Banknote,
  "arrow-left-right": ArrowLeftRight,
  shield: Shield,
  home: Home,
  sparkles: Sparkles,
  "circle-dot": CircleDot,
  briefcase: Briefcase,
};

interface BudgetDetailSheetProps {
  categoryId: number | null;
  from: string;
  to: string;
  onClose: () => void;
}

export function BudgetDetailSheet({
  categoryId,
  from,
  to,
  onClose,
}: BudgetDetailSheetProps) {
  const open = categoryId !== null;

  // The sheet keeps its own month so the user can walk back through history
  // without changing the period the page behind it is showing.
  const [month, setMonth] = useState<string>(() => from.slice(0, 7));
  useEffect(() => {
    if (open) setMonth(from.slice(0, 7));
  }, [open, from, categoryId]);

  const range = useMemo(() => monthRange(month), [month]);

  const detailQuery = useQuery({
    enabled: open && categoryId !== null,
    queryKey: ["category-detail", categoryId, range.from, range.to],
    queryFn: () => getCategoryDetail(categoryId as number, range),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full p-0 sm:max-w-xl! md:max-w-2xl! lg:max-w-[35vw]!"
      >
        {detailQuery.isLoading || !detailQuery.data ? (
          <DetailSkeleton />
        ) : (
          <DetailContent
            data={detailQuery.data}
            month={month}
            onMonthChange={setMonth}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Skeleton className="h-12 w-3/4" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

function DetailContent({
  data,
  month,
  onMonthChange,
}: {
  data: CategoryDetail;
  month: string;
  onMonthChange: (m: string) => void;
}) {
  const tCat = useTranslations("categoriesSeeded");
  const [compareYoY, setCompareYoY] = useState(false);
  const queryClient = useQueryClient();
  const sameKindCategoriesQuery = useQuery({
    queryKey: ["categories", data.category.kind],
    queryFn: () => getCategories(data.category.kind),
  });
  // The other side, so a row here can be booked as an offset instead.
  const otherKind = data.category.kind === "income" ? "expense" : "income";
  const otherKindCategoriesQuery = useQuery({
    queryKey: ["categories", otherKind],
    queryFn: () => getCategories(otherKind),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["category-detail"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
  };

  const handleApprove = async (id: number) => {
    await approveTransactionCategory(id);
    invalidate();
  };
  const handleChangeCategory = async (id: number, categoryId: number) => {
    await updateTransactionCategory(id, categoryId);
    invalidate();
  };

  const handleToggleMode = async (checked: boolean) => {
    await updateCategoryBudgetMode(
      data.category.id,
      checked ? "budgeted" : "tracking"
    );
    invalidate();
  };

  const handleSaveBudget = async (amount: number | null) => {
    await updateBudget(data.category.id, amount);
    invalidate();
  };

  // Parents first with their children indented, matching the transactions table.
  const buildOptions = (all: Category[]) => {
    const roots = all.filter((c) => c.parentId == null);
    const out: Array<{ category: Category; depth: number }> = [];
    for (const root of roots) {
      out.push({ category: root, depth: 0 });
      for (const child of all.filter((c) => c.parentId === root.id)) {
        out.push({ category: child, depth: 1 });
      }
    }
    // Anything whose parent is missing from this kind still needs to be pickable.
    for (const c of all) {
      if (!out.some((o) => o.category.id === c.id)) out.push({ category: c, depth: 0 });
    }
    return out;
  };

  const pickerOptions = useMemo(
    () => buildOptions(sameKindCategoriesQuery.data ?? []),
    [sameKindCategoriesQuery.data]
  );
  const offset = useMemo(
    () =>
      offsetSection(
        data.category.kind === "income" ? "income" : "expense",
        buildOptions(otherKindCategoriesQuery.data ?? [])
      ),
    [otherKindCategoriesQuery.data, data.category.kind]
  );

  const Icon = ICON_MAP[data.category.icon ?? "circle-dot"] ?? CircleDot;
  const iconColor = shade(data.category.color);
  const pct = Math.min(100, Math.round(data.percentSpent));
  const isTracking = data.category.budgetMode === "tracking";

  const chartData = useMemo(
    () =>
      data.dailySpend.map((d) => ({
        day: d.date.slice(8, 10),
        amount: d.amount,
        date: d.date,
      })),
    [data.dailySpend]
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <SheetHeader
        className="gap-3 p-6 pb-5"
        style={{ background: tint(data.category.color, 0.22) }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-background/70"
          >
            <Icon className="h-5 w-5" style={{ color: iconColor }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="card-label">
              {data.category.kind === "income"
                ? "קטגוריית הכנסה"
                : "קטגוריית הוצאה"}
            </div>
            <SheetTitle className="truncate text-xl font-bold tracking-tight">
              {translateCategoryName(data.category.name, tCat)}
            </SheetTitle>
          </div>
          {data.category.kind !== "income" && (
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <span>יעד חודשי</span>
              <Switch
                size="sm"
                checked={!isTracking}
                onCheckedChange={handleToggleMode}
              />
            </label>
          )}
        </div>

        {isTracking ? (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Stat label="הוצאו" value={formatCurrency(data.spent)} />
            <Stat
              label="ממוצע לחודש"
              value={
                data.vsTypical && data.vsTypical.typical > 0
                  ? formatCurrency(data.vsTypical.typical)
                  : "—"
              }
              sublabel={
                data.vsTypical && data.vsTypical.typical > 0
                  ? `${Math.round(data.vsTypical.percentDiff) >= 0 ? "+" : ""}${Math.round(data.vsTypical.percentDiff)}% החודש`
                  : undefined
              }
            />
          </div>
        ) : (
          <>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <Stat label="הוצאו" value={formatCurrency(data.spent)} />
              <BudgetStat
                amount={data.budget}
                isAuto={data.isAutoBudget}
                onSave={handleSaveBudget}
              />
              <Stat
                label="נותרו"
                value={formatCurrency(Math.max(0, data.budget - data.spent))}
              />
            </div>

            {data.budget > 0 && (
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-background/40">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    background: shade(data.category.color),
                  }}
                />
              </div>
            )}
          </>
        )}
      </SheetHeader>

      <div className="space-y-5 p-6 pt-3">
        {data.category.isParent && data.children && data.children.length > 0 && (
          <ChildrenBreakdownSection
            children={data.children}
            budgetSource={data.budgetSource}
            color={data.category.color}
          />
        )}
        {data.needsReviewCount > 0 && (
          <NeedsReviewSection
            transactions={data.needsReviewTransactions}
            categories={sameKindCategoriesQuery.data ?? []}
            onApprove={handleApprove}
            onChange={handleChangeCategory}
            color={data.category.color}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardLabel>לעומת החודש הקודם</CardLabel>
            <div className="mt-1 metric-md">
              {data.prevSpent > 0
                ? `${data.spent - data.prevSpent >= 0 ? "+" : "-"}${formatCurrency(Math.abs(data.spent - data.prevSpent))}`
                : "—"}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {data.prevSpent > 0 ? (
                <>
                  {data.prevPeriodLabel}: {formatCurrency(data.prevSpent)}
                  {data.vsLastMonth != null && (
                    <>
                      {" · "}
                      {Math.abs(Math.round(data.vsLastMonth))}%{" "}
                      {data.vsLastMonth < 0 ? "פחות" : "יותר"}
                    </>
                  )}
                </>
              ) : (
                "לא היו הוצאות בתקופה הקודמת"
              )}
            </div>
          </Card>

          <Card>
            <CardLabel>ממוצע לתנועה</CardLabel>
            <div className="mt-1 metric-md">
              {formatCurrency(data.avgPerTransaction)}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {data.transactionCount} תנועות בתקופה
            </div>
          </Card>
        </div>

        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <CardLabel>לפי חודשים</CardLabel>
            <div className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                <Switch
                  size="sm"
                  checked={compareYoY}
                  onCheckedChange={setCompareYoY}
                />
                השוואה לאשתקד
              </label>
              <MonthStepper month={month} onChange={onMonthChange} />
            </div>
          </div>
          <CategoryHistoryChart
            categoryId={data.category.id}
            selectedMonth={month}
            onSelectMonth={onMonthChange}
            color={shade(data.category.color)}
            compareToLastYear={compareYoY}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            לחיצה על עמודה עוברת לאותו חודש. הפירוט למטה מתעדכן בהתאם.
          </p>
        </Card>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">
              תנועות · {data.transactionCount}
            </h3>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs"
              disabled
              title="הוספת תנועה ידנית עדיין אינה זמינה"
            >
              <Plus className="h-3.5 w-3.5" /> הוספה
            </Button>
          </div>
          <div className="overflow-hidden rounded-2xl border bg-card">
            {data.transactions.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                אין תנועות בקטגוריה הזו בחודש שנבחר.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {data.transactions.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-[15px] font-semibold">
                        {t.description}
                      </div>
                      <div className="text-sm text-muted-foreground tabular-nums">
                        {formatDate(t.date)}
                      </div>
                      <TransactionNote id={t.id} note={t.userNote} />
                    </div>
                    <CategoryPicker
                      name={
                        t.categoryName
                          ? translateCategoryName(t.categoryName, tCat)
                          : "ללא קטגוריה"
                      }
                      color={t.categoryColor}
                      options={pickerOptions}
                      offset={offset}
                      disabled={false}
                      onSelect={(categoryId) =>
                        handleChangeCategory(t.id, categoryId)
                      }
                    />
                    <div className="metric-sm shrink-0">
                      {formatCurrency(t.chargedAmount)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChildrenBreakdownSection({
  children,
  budgetSource,
  color,
}: {
  children: CategoryChildBreakdown[];
  budgetSource: "own" | "rollup" | "leaf";
  color: string;
}) {
  const tCat = useTranslations("categoriesSeeded");
  const banner =
    budgetSource === "own"
      ? "לקבוצת האב הוגדר יעד משלה. יעדי תת־הקטגוריות מנוהלים בנפרד."
      : "היעד מחושב מתת־הקטגוריות. אפשר להגדיר כאן יעד עצמאי לקבוצה.";
  return (
    <div
      className="space-y-3 rounded-2xl p-4"
      style={{ background: tint(color, 0.12) }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">
          תת־קטגוריות · {children.length}
        </h3>
        <span className="text-sm text-muted-foreground">
          {budgetSource === "own" ? "יעד עצמאי" : "מצטבר מתת־קטגוריות"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{banner}</p>
      <ul className="space-y-1.5">
        {children.map((c) => {
          const pct = Math.min(100, Math.round(c.percentSpent));
          return (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-background/70 px-3 py-2"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: c.color }}
                />
                <span className="truncate text-sm font-medium">{translateCategoryName(c.name,tCat)}</span>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums">
                <div className="text-end">
                  <div className="font-medium">{formatCurrency(c.spent)}</div>
                  <div className="text-sm text-muted-foreground">
                    {c.budget > 0
                      ? `מתוך ${formatCurrency(c.budget)}`
                      : c.budgetMode === "tracking"
                        ? "מעקב בלבד"
                        : "ללא יעד"}
                  </div>
                </div>
                {c.budget > 0 && (
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: shade(c.color),
                      }}
                    />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NeedsReviewSection({
  transactions,
  categories,
  onApprove,
  onChange,
  color,
}: {
  transactions: TransactionWithCategory[];
  categories: Category[];
  onApprove: (id: number) => void;
  onChange: (id: number, categoryId: number) => void;
  color: string;
}) {
  const tCat = useTranslations("categoriesSeeded");
  return (
    <div
      className="space-y-2 rounded-2xl p-4"
      style={{ background: tint(color, 0.12) }}
    >
      <div className="flex items-center gap-2">
        <HelpCircle
          className="h-4 w-4"
          style={{ color: "var(--status-heads-up)" }}
        />
        <h3 className="text-sm font-medium">
          דרושות לבדיקה · {transactions.length}
        </h3>
      </div>
      <p className="text-xs text-muted-foreground">
        הסיווג אינו ודאי. אפשר לאשר אותו או לבחור קטגוריה אחרת. הבחירה תישמר
        לפעם הבאה.
      </p>
      <ul className="mt-2 space-y-2">
        {transactions.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-background/70 p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="break-words text-sm font-medium">
                {t.description}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {formatDate(t.date)} · {formatCurrency(t.chargedAmount)}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
                >
                  <Badge
                    variant="outline"
                    className="border-none p-0"
                    style={{
                      color: t.categoryColor ?? undefined,
                    }}
                  >
                    {t.categoryName ? translateCategoryName(t.categoryName, tCat) : "ללא קטגוריה"}
                  </Badge>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {categories.map((cat) => (
                    <DropdownMenuItem
                      key={cat.id}
                      onClick={() => onChange(t.id, cat.id)}
                    >
                      <div
                        className="me-2 h-2 w-2 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      {translateCategoryName(cat.name, tCat)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => onApprove(t.id)}
              >
                <Check className="h-3.5 w-3.5" />
                אישור
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div>
      <div className="card-label">
        {label}
      </div>
      <div className="mt-0.5 font-serif text-xl tabular-nums">{value}</div>
      {sublabel && (
        <div className="text-sm text-muted-foreground">
          {sublabel}
        </div>
      )}
    </div>
  );
}

function BudgetStat({
  amount,
  isAuto,
  onSave,
}: {
  amount: number;
  isAuto: boolean;
  onSave: (amount: number | null) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEdit = () => {
    setDraft(amount > 0 ? Math.round(amount).toString() : "");
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft("");
  };

  const commit = async () => {
    if (saving) return;
    const trimmed = draft.trim();
    let next: number | null;
    if (trimmed === "") {
      next = null;
    } else {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) {
        cancel();
        return;
      }
      next = parsed === 0 ? null : parsed;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="card-label">
        יעד
      </div>
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          className="mt-0.5 w-full rounded-md border border-border bg-background/70 px-1.5 py-0.5 font-serif text-xl tabular-nums outline-none focus:border-foreground/40 disabled:opacity-60"
          placeholder="אוטומטי"
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="group mt-0.5 flex w-full cursor-pointer items-center gap-1.5 rounded-md text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="עריכת סכום היעד"
        >
          <span className="font-serif text-xl tabular-nums">
            {amount > 0 ? formatCurrency(amount) : "—"}
          </span>
          <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        </button>
      )}
      {!editing && isAuto && amount > 0 && (
        <div className="text-sm text-muted-foreground">
          אוטומטי
        </div>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="surface p-4">{children}</div>;
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="card-label">
      {children}
    </div>
  );
}

function tint(hex: string, opacity: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function shade(hex: string): string {
  const { r, g, b } = parseHex(hex);
  const factor = 0.78;
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}



/** First and last day of a YYYY-MM month, as YYYY-MM-DD. */
function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
}

function addMonth(month: string, step: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + step, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function MonthStepper({
  month,
  onChange,
}: {
  month: string;
  onChange: (m: string) => void;
}) {
  const [y, m] = month.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString("he-IL", {
    month: "long",
    year: "numeric",
  });
  const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  return (
    <div className="inline-flex h-8 items-center gap-0.5 rounded-lg border border-border bg-card px-1">
      <button
        type="button"
        onClick={() => onChange(addMonth(month, 1))}
        disabled={month >= thisMonth}
        aria-label="לחודש הבא"
        className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-accent disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <span className="min-w-24 text-center text-xs font-semibold">{label}</span>
      <button
        type="button"
        onClick={() => onChange(addMonth(month, -1))}
        aria-label="לחודש הקודם"
        className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
    </div>
  );
}
