import "server-only";
import { getDb } from "../index";
import type { CategoryKind } from "@/lib/types";
import { counterpartyOf } from "@/lib/merchant-key";

export type RuleMatchType = "contains" | "equals" | "starts";

/**
 * What the rule looks at. A transfer names the channel in its description
 * ("העברה בBIT") and the person in its memo, so matching the counterparty is
 * a different question from matching the description.
 */
export type RuleMatchField = "description" | "counterparty";

export interface CategoryRule {
  id: number;
  categoryId: number;
  categoryName: string;
  categoryColor: string;
  categoryKind: CategoryKind;
  matchType: RuleMatchType;
  matchField: RuleMatchField;
  merchantValue: string | null;
  amountMin: number | null;
  amountMax: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  priority: number;
  enabled: boolean;
  hitCount: number;
  note: string | null;
}

export interface RuleInput {
  categoryId: number;
  matchType?: RuleMatchType;
  matchField?: RuleMatchField;
  merchantValue?: string | null;
  amountMin?: number | null;
  amountMax?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  priority?: number;
  enabled?: boolean;
  note?: string | null;
}

const SELECT = `
  SELECT r.id, r.category_id AS categoryId,
         c.name AS categoryName, c.color AS categoryColor, c.kind AS categoryKind,
         r.match_type AS matchType, r.match_field AS matchField,
         r.merchant_value AS merchantValue,
         r.amount_min AS amountMin, r.amount_max AS amountMax,
         r.date_from AS dateFrom, r.date_to AS dateTo,
         r.priority, r.enabled, r.hit_count AS hitCount, r.note
    FROM category_rules r
    JOIN categories c ON c.id = r.category_id
`;

function hydrate(row: Record<string, unknown>): CategoryRule {
  return { ...(row as unknown as CategoryRule), enabled: Boolean(row.enabled) };
}

export function listRules(
  workspaceId: number,
  categoryId?: number
): CategoryRule[] {
  const where = categoryId
    ? "WHERE r.workspace_id = ? AND r.category_id = ?"
    : "WHERE r.workspace_id = ?";
  const params = categoryId ? [workspaceId, categoryId] : [workspaceId];
  const rows = getDb()
    .prepare(`${SELECT} ${where} ORDER BY r.priority, r.id`)
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map(hydrate);
}

export function createRule(workspaceId: number, input: RuleInput): number {
  return Number(
    getDb()
      .prepare(
        `INSERT INTO category_rules
           (workspace_id, category_id, match_type, match_field, merchant_value,
            amount_min, amount_max, date_from, date_to, priority, enabled, note)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        workspaceId,
        input.categoryId,
        input.matchType ?? "contains",
        input.matchField ?? "description",
        input.merchantValue?.trim() || null,
        input.amountMin ?? null,
        input.amountMax ?? null,
        input.dateFrom ?? null,
        input.dateTo ?? null,
        input.priority ?? 100,
        input.enabled === false ? 0 : 1,
        input.note?.trim() || null
      ).lastInsertRowid
  );
}

export function updateRule(
  workspaceId: number,
  id: number,
  patch: Partial<RuleInput>
): boolean {
  const columns: Record<keyof RuleInput, string> = {
    categoryId: "category_id",
    matchType: "match_type",
    matchField: "match_field",
    merchantValue: "merchant_value",
    amountMin: "amount_min",
    amountMax: "amount_max",
    dateFrom: "date_from",
    dateTo: "date_to",
    priority: "priority",
    enabled: "enabled",
    note: "note",
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(columns) as Array<
    [keyof RuleInput, string]
  >) {
    const value = patch[key];
    if (value === undefined) continue;
    sets.push(`${column} = ?`);
    values.push(key === "enabled" ? (value ? 1 : 0) : value);
  }
  if (sets.length === 0) return false;
  sets.push("updated_at = datetime('now')");
  values.push(workspaceId, id);
  return (
    getDb()
      .prepare(
        `UPDATE category_rules SET ${sets.join(", ")} WHERE workspace_id = ? AND id = ?`
      )
      .run(...values).changes === 1
  );
}

export function deleteRule(workspaceId: number, id: number): boolean {
  return (
    getDb()
      .prepare("DELETE FROM category_rules WHERE workspace_id = ? AND id = ?")
      .run(workspaceId, id).changes === 1
  );
}

export interface MatchableTransaction {
  id: number;
  description: string;
  chargedAmount: number;
  date: string;
  /** Needed to resolve a transfer counterparty; absent on older callers. */
  memo?: string | null;
}

/**
 * The first enabled rule whose every condition holds, in priority order.
 *
 * Amounts are compared on the absolute value: the user thinks in "a charge of
 * 250", not "-250", and income and expenses would otherwise need opposite
 * rules to express the same idea.
 */
export function matchRule(
  rules: CategoryRule[],
  txn: MatchableTransaction
): CategoryRule | null {
  const description = txn.description.trim().toLowerCase();
  // Resolved lazily: most rules never ask for it.
  let counterparty: string | null | undefined;
  const amount = Math.abs(txn.chargedAmount);
  const day = txn.date.slice(0, 10);

  for (const rule of rules) {
    if (!rule.enabled) continue;

    if (rule.merchantValue) {
      let haystack: string;
      if (rule.matchField === "counterparty") {
        if (counterparty === undefined) {
          counterparty = counterpartyOf(txn.description, txn.memo ?? null);
        }
        // A counterparty rule simply does not apply to a row that has none.
        if (!counterparty) continue;
        haystack = counterparty.trim().toLowerCase();
      } else {
        haystack = description;
      }

      const needle = rule.merchantValue.trim().toLowerCase();
      const hit =
        rule.matchType === "equals"
          ? haystack === needle
          : rule.matchType === "starts"
            ? haystack.startsWith(needle)
            : haystack.includes(needle);
      if (!hit) continue;
    }

    if (rule.amountMin != null && amount < rule.amountMin) continue;
    if (rule.amountMax != null && amount > rule.amountMax) continue;
    if (rule.dateFrom != null && day < rule.dateFrom) continue;
    if (rule.dateTo != null && day > rule.dateTo) continue;

    return rule;
  }
  return null;
}

export function incrementRuleHits(ids: number[]): void {
  if (ids.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    "UPDATE category_rules SET hit_count = hit_count + 1 WHERE id = ?"
  );
  db.transaction(() => {
    for (const id of ids) stmt.run(id);
  })();
}

/**
 * Applies every rule to existing transactions and reports what changed.
 * `dryRun` returns the same shape without writing, which is what the preview
 * in the UI uses - a rule that would sweep up 400 transactions should be seen
 * before it is applied, not after.
 */
export function applyRulesToExisting(
  workspaceId: number,
  opts: { ruleId?: number; onlyUncategorised: boolean; dryRun: boolean }
): { matched: number; changed: number; samples: Array<{ description: string; categoryName: string }> } {
  const db = getDb();
  const rules = listRules(workspaceId).filter(
    (r) => r.enabled && (opts.ruleId == null || r.id === opts.ruleId)
  );
  if (rules.length === 0) return { matched: 0, changed: 0, samples: [] };

  const rows = db
    .prepare(
      // memo carries the transfer counterparty, which counterparty rules match on.
      `SELECT id, description, memo, charged_amount AS chargedAmount, date,
              category_id AS categoryId, kind
         FROM transactions
        WHERE workspace_id = ? AND deleted_at IS NULL
          ${opts.onlyUncategorised ? "AND category_id IS NULL" : ""}`
    )
    .all(workspaceId) as Array<
    MatchableTransaction & {
      categoryId: number | null;
      kind: CategoryKind | "transfer";
    }
  >;

  const rulesByKind = {
    expense: rules.filter((rule) => rule.categoryKind === "expense"),
    income: rules.filter((rule) => rule.categoryKind === "income"),
  };

  const updates: Array<{ id: number; categoryId: number; ruleId: number }> = [];
  const samples: Array<{ description: string; categoryName: string }> = [];
  for (const row of rows) {
    if (row.kind === "transfer") continue;
    const rule = matchRule(rulesByKind[row.kind], row);
    if (!rule) continue;
    if (row.categoryId === rule.categoryId) continue;
    updates.push({ id: row.id, categoryId: rule.categoryId, ruleId: rule.id });
    if (samples.length < 8) {
      samples.push({
        description: row.description,
        categoryName: rule.categoryName,
      });
    }
  }

  if (opts.dryRun || updates.length === 0) {
    return { matched: updates.length, changed: 0, samples };
  }

  const stmt = db.prepare(
    `UPDATE transactions
        SET category_id = ?, category_source = 'user', needs_review = 0,
            review_reason = NULL, updated_at = datetime('now')
      WHERE workspace_id = ? AND id = ?`
  );
  let changed = 0;
  db.transaction(() => {
    for (const u of updates) changed += stmt.run(u.categoryId, workspaceId, u.id).changes;
  })();
  incrementRuleHits(updates.map((u) => u.ruleId));

  return { matched: updates.length, changed, samples };
}
