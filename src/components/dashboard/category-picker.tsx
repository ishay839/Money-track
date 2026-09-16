"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { translateCategoryName } from "@/lib/i18n-data";
import type { Category } from "@/lib/types";

export type CategoryOption = { category: Category; depth: number };

/**
 * Picking a category for one transaction.
 *
 * `offset` is the opposite side of the ledger, reachable from a footer button
 * rather than mixed into the main list. A ₪500 shop refund is an income row,
 * but it belongs against the clothing expense it reverses - otherwise the
 * ₪1,000 purchase still reads as ₪1,000 spent. The two lists stay separate so
 * the ordinary case never has to scroll past categories from the wrong side.
 */
export function CategoryPicker({
  name,
  color,
  options,
  offset,
  disabled,
  onSelect,
}: {
  name: string;
  color: string | null;
  options: CategoryOption[];
  offset?: { label: string; hint: string; options: CategoryOption[] };
  disabled: boolean;
  onSelect: (categoryId: number) => void;
}) {
  const tCat = useTranslations("categoriesSeeded");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showOffset, setShowOffset] = useState(false);

  const reset = () => {
    setSearch("");
    setShowOffset(false);
  };

  const active = showOffset && offset ? offset.options : options;
  const normalized = search.trim().toLocaleLowerCase("he-IL");
  const shown = active.filter(
    ({ category }) =>
      !normalized ||
      translateCategoryName(category.name, tCat)
        .toLocaleLowerCase("he-IL")
        .includes(normalized)
  );

  return <Popover open={open} onOpenChange={next=>{setOpen(next);if(!next)reset();}}>
    <PopoverTrigger className="inline-flex" disabled={disabled}>
      <Badge variant="outline" className="cursor-pointer transition-colors hover:bg-accent" style={color?{borderColor:color+"40",backgroundColor:color+"15",color}:undefined}>{name}</Badge>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-72 p-2">
      <Input value={search} onChange={event=>setSearch(event.target.value)} placeholder="חיפוש קטגוריה..." aria-label="חיפוש קטגוריה" className="h-9" />

      {showOffset && offset && (
        <p className="mt-2 rounded-md bg-accent/40 px-2 py-1.5 text-xs text-muted-foreground">
          {offset.hint}
        </p>
      )}

      <div className="mt-2 max-h-64 overflow-y-auto">
        {shown.map(({category,depth})=><button type="button" key={category.id} onClick={()=>{setOpen(false);reset();onSelect(category.id);}} className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-start text-sm hover:bg-accent ${depth?"ps-7":"font-semibold"}`}><span className="h-2 w-2 shrink-0 rounded-full" style={{backgroundColor:category.color}}/>{translateCategoryName(category.name,tCat)}</button>)}
        {!shown.length&&<div className="py-5 text-center text-xs text-muted-foreground">לא נמצאה קטגוריה</div>}
      </div>

      {offset && offset.options.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setShowOffset((v) => !v);
            setSearch("");
          }}
          className="mt-1 flex w-full items-center justify-between gap-2 rounded-md border-t border-border px-2 pb-1 pt-2.5 text-start text-xs font-semibold text-primary hover:bg-accent"
        >
          {showOffset ? "חזרה לרשימה הרגילה" : offset.label}
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
        </button>
      )}
    </PopoverContent>
  </Popover>;
}
