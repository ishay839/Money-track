import type { Category } from "@/lib/types";

export type CategoryOption = { category: Category; depth: number };

/**
 * Wording for the "book this against the other side" affordance in the
 * category picker.
 *
 * An income row offsetting an expense is the common case: a shop refund, a
 * reimbursed expense, a returned purchase. Filed as income it leaves the
 * original expense standing at full size, which is exactly what the user does
 * not want to see. The reverse (an expense reducing income) is rarer but is
 * the same operation, so both directions are spelled out here.
 */
export function offsetCopy(rowKind: "expense" | "income"): {
  label: string;
  hint: string;
} {
  return rowKind === "income"
    ? {
        label: "צמצום הוצאה",
        hint: "הסכום ינוכה מההוצאות בקטגוריה שתיבחר - למשל החזר על מוצר שהוחזר.",
      }
    : {
        label: "צמצום הכנסה",
        hint: "הסכום ינוכה מההכנסות בקטגוריה שתיבחר.",
      };
}

/** The other side of the ledger, for the picker's `offset` prop. */
export function offsetSection(
  rowKind: "expense" | "income",
  options: CategoryOption[]
): { label: string; hint: string; options: CategoryOption[] } {
  return { ...offsetCopy(rowKind), options };
}
