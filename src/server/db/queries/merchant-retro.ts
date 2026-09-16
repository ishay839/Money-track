import "server-only";

import { getDb } from "../index";
import { normalizeMerchant } from "@/server/lib/merchant-memory";
import { merchantKeyOf } from "@/lib/merchant-key";

/**
 * Applying a merchant rule backwards over history.
 *
 * "Remember for next time" only ever affected future syncs, so a merchant with
 * years of history stayed as it was. Going back is useful - but it is also the
 * dangerous direction, because a merchant can legitimately be split across
 * categories (three different salaries under one payer name), and a blind
 * rewrite would flatten distinctions the user made deliberately.
 *
 * So the preview separates the two populations: rows with no category yet
 * (safe - nothing is lost) and rows already filed somewhere else (a real
 * change, listed so the user can see exactly what would move).
 */

export interface RetroBucket {
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  count: number;
  total: number;
}

export interface RetroPreview {
  merchantKey: string;
  /** Rows carrying no category at all. */
  uncategorised: number;
  /** Rows already filed under some other category. */
  categorisedElsewhere: number;
  /** Rows already in the target category - nothing to do for these. */
  alreadyCorrect: number;
  /** Where the "elsewhere" rows currently sit, largest first. */
  buckets: RetroBucket[];
  oldest: string | null;
  newest: string | null;
}

/** Rows a rule for this merchant would cover, excluding the one just edited. */
function scopeSql(alias = "t"): string {
  // Mirrors normalizeMerchant: trim, collapse spaces, drop a trailing number.
  return `${alias}.deleted_at IS NULL
    AND ${alias}.workspace_id = ?
    AND ${alias}.kind <> 'transfer'
    AND lower(trim(${alias}.description)) = ?`;
}

export function previewRetro(
  workspaceId: number,
  description: string,
  targetCategoryId: number,
  excludeTransactionId?: number,
  memo?: string | null
): RetroPreview {
  const db = getDb();
  const key = normalizeMerchant(merchantKeyOf(description, memo ?? null));

  // The stored descriptions are matched on their normalised form. Doing that
  // in SQL for every row would skip the index, so candidates are narrowed by
  // prefix first and filtered exactly in JS.
  // A transfer's description names only the channel ("העברה בBIT"), so the
  // rule that was just created may key on the counterparty in the memo
  // instead. Retro has to group rows the same way the rule matches them,
  // otherwise it reports "nothing to fix" while the rule goes on to catch
  // those very rows on the next sync.
  const candidates = db
    .prepare(
      `SELECT t.id, t.date, t.description, t.memo, t.category_id AS categoryId,
              t.charged_amount AS amount,
              c.name AS categoryName, c.color AS categoryColor
         FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.deleted_at IS NULL AND t.workspace_id = ?
          AND t.kind <> 'transfer'
          AND (lower(trim(t.description)) LIKE ? OR t.memo IS NOT NULL)`
    )
    .all(workspaceId, `${key}%`) as Array<{
    id: number;
    date: string;
    description: string;
    memo: string | null;
    categoryId: number | null;
    amount: number;
    categoryName: string | null;
    categoryColor: string | null;
  }>;

  const rows = candidates.filter(
    (r) =>
      normalizeMerchant(merchantKeyOf(r.description, r.memo)) === key &&
      r.id !== excludeTransactionId
  );

  let uncategorised = 0;
  let alreadyCorrect = 0;
  const elsewhere = new Map<number, RetroBucket>();
  let oldest: string | null = null;
  let newest: string | null = null;

  for (const r of rows) {
    const day = r.date.slice(0, 10);
    if (oldest === null || day < oldest) oldest = day;
    if (newest === null || day > newest) newest = day;

    if (r.categoryId == null) {
      uncategorised++;
    } else if (r.categoryId === targetCategoryId) {
      alreadyCorrect++;
    } else {
      const bucket = elsewhere.get(r.categoryId) ?? {
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        categoryColor: r.categoryColor,
        count: 0,
        total: 0,
      };
      bucket.count += 1;
      bucket.total += Math.abs(r.amount);
      elsewhere.set(r.categoryId, bucket);
    }
  }

  return {
    merchantKey: key,
    uncategorised,
    categorisedElsewhere: [...elsewhere.values()].reduce(
      (sum, b) => sum + b.count,
      0
    ),
    alreadyCorrect,
    buckets: [...elsewhere.values()].sort((a, b) => b.count - a.count),
    oldest,
    newest,
  };
}

export interface ApplyRetroResult {
  updated: number;
}

/**
 * Applies the category to matching history.
 *
 * `scope` is the user's answer to the only question that matters: fill in the
 * blanks, or also take over rows that already have a category.
 */
export function applyRetro(
  workspaceId: number,
  description: string,
  targetCategoryId: number,
  scope: "uncategorised" | "all",
  excludeTransactionId?: number,
  memo?: string | null
): ApplyRetroResult {
  const db = getDb();
  const key = normalizeMerchant(merchantKeyOf(description, memo ?? null));

  const candidates = db
    .prepare(
      `SELECT id, description, memo, category_id AS categoryId
         FROM transactions
        WHERE deleted_at IS NULL AND workspace_id = ?
          AND kind <> 'transfer'
          AND (lower(trim(description)) LIKE ? OR memo IS NOT NULL)`
    )
    .all(workspaceId, `${key}%`) as Array<{
    id: number;
    description: string;
    memo: string | null;
    categoryId: number | null;
  }>;

  const ids = candidates
    .filter(
      (r) =>
        normalizeMerchant(merchantKeyOf(r.description, r.memo)) === key &&
        r.id !== excludeTransactionId &&
        r.categoryId !== targetCategoryId &&
        (scope === "all" || r.categoryId == null)
    )
    .map((r) => r.id);

  if (ids.length === 0) return { updated: 0 };

  return db.transaction(() => {
    let updated = 0;
    // Chunked to stay under SQLite's variable limit on large histories.
    for (let i = 0; i < ids.length; i += 400) {
      const chunk = ids.slice(i, i + 400);
      const placeholders = chunk.map(() => "?").join(",");
      updated += db
        .prepare(
          `UPDATE transactions
              SET category_id = ?, category_source = 'user',
                  needs_review = 0, updated_at = datetime('now')
            WHERE workspace_id = ? AND id IN (${placeholders})`
        )
        .run(targetCategoryId, workspaceId, ...chunk).changes;
    }
    return { updated };
  })();
}
