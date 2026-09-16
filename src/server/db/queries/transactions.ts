import "server-only";

import { getDb } from "../index";
import { computeDedupHash } from "../../lib/dedup";
import { detectKind } from "../../lib/transfers";
import type {
  TransactionWithCategory,
  MonthlySummary,
  MerchantSummary,
  CategoryBreakdown,
} from "@/lib/types";
export type TransactionKindFilter = "expense" | "income" | "all";

interface RawTransaction {
  accountNumber: string;
  date: string;
  processedDate: string;
  originalAmount: number;
  originalCurrency: string;
  chargedAmount: number;
  chargedCurrency?: string;
  description: string;
  memo?: string;
  type: "normal" | "installments";
  status: "completed" | "pending";
  identifier?: string | number;
  installmentNumber?: number;
  installmentTotal?: number;
}

interface InsertResult {
  added: number;
  updated: number;
}

export function insertTransactions(
  workspaceId: number,
  transactions: RawTransaction[],
  provider: string,
  syncRunId: number
): InsertResult {
  const db = getDb();
  let added = 0;
  let updated = 0;

  const hashCounts = new Map<string, number>();

  const existingCountStmt = db.prepare(
    "SELECT COUNT(*) as count FROM transactions WHERE workspace_id = ? AND dedup_hash = ?"
  );

  const insertStmt = db.prepare(`
    INSERT INTO transactions (
      workspace_id, account_number, date, processed_date, original_amount, original_currency,
      charged_amount, charged_currency, description, memo, type, status,
      identifier, installment_number, installment_total, provider,
      sync_run_id, dedup_hash, dedup_sequence, kind
    ) VALUES (
      @workspaceId, @accountNumber, @date, @processedDate, @originalAmount, @originalCurrency,
      @chargedAmount, @chargedCurrency, @description, @memo, @type, @status,
      @identifier, @installmentNumber, @installmentTotal, @provider,
      @syncRunId, @dedupHash, @dedupSequence, @kind
    )
    ON CONFLICT(workspace_id, dedup_hash, dedup_sequence) DO UPDATE SET
      status = CASE WHEN transactions.status = 'pending' THEN excluded.status ELSE transactions.status END,
      charged_amount = CASE
        WHEN transactions.amount_edited = 1 THEN transactions.charged_amount
        WHEN transactions.status = 'pending' THEN excluded.charged_amount
        ELSE transactions.charged_amount
      END,
      processed_date = CASE WHEN transactions.status = 'pending' THEN excluded.processed_date ELSE transactions.processed_date END,
      kind = CASE
        WHEN transactions.category_source = 'user' THEN transactions.kind
        ELSE excluded.kind
      END,
      updated_at = CASE WHEN transactions.status = 'pending' THEN datetime('now') ELSE transactions.updated_at END
  `);

  const batchInsert = db.transaction(() => {
    for (const txn of transactions) {
      const hash = computeDedupHash({
        accountNumber: txn.accountNumber,
        date: txn.date,
        originalAmount: txn.originalAmount,
        originalCurrency: txn.originalCurrency,
        description: txn.description,
        identifier: txn.identifier,
        installmentNumber: txn.installmentNumber,
        installmentTotal: txn.installmentTotal,
      });

      const batchCount = (hashCounts.get(hash) ?? 0) + 1;
      hashCounts.set(hash, batchCount);

      const { count: existingCount } = existingCountStmt.get(workspaceId, hash) as {
        count: number;
      };

      const sequence = batchCount - 1;
      const kind = detectKind(txn.description, provider, txn.chargedAmount);

      const params = {
        workspaceId,
        accountNumber: txn.accountNumber,
        date: txn.date,
        processedDate: txn.processedDate,
        originalAmount: txn.originalAmount,
        originalCurrency: txn.originalCurrency,
        chargedAmount: txn.chargedAmount,
        chargedCurrency: txn.chargedCurrency ?? null,
        description: txn.description,
        memo: txn.memo ?? null,
        type: txn.type,
        status: txn.status,
        identifier: txn.identifier != null ? String(txn.identifier) : null,
        installmentNumber: txn.installmentNumber ?? null,
        installmentTotal: txn.installmentTotal ?? null,
        provider,
        syncRunId: syncRunId,
        dedupHash: hash,
        dedupSequence: sequence,
        kind,
      };

      if (batchCount > existingCount) {
        insertStmt.run(params);
        added++;
      } else {
        const result = insertStmt.run(params);
        if (result.changes > 0) {
          updated++;
        }
      }
    }
  });

  batchInsert();
  return { added, updated };
}

interface QueryParams {
  from?: string;
  to?: string;
  search?: string;
  category?: number;
  /**
   * Multi-id filter for parent-category aggregation. Takes precedence over
   * `category` when present and non-empty. Use it to fetch transactions
   * across all children of a parent category.
   */
  categoryIds?: number[];
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
  kind?: TransactionKindFilter;
  provider?: string;
  needsReview?: boolean;
  /** Show internal transfers (card settlements, bank-to-bank) too. */
  includeTransfers?: boolean;
  /** Absolute-value bounds, so one range covers charges and credits alike. */
  minAmount?: number;
  maxAmount?: number;
}

const ALLOWED_SORT_COLUMNS = new Set([
  "date",
  "charged_amount",
  "description",
  "processed_date",
  "category",
]);

/**
 * Sorting by category groups children under their parent, so "מזון" and its
 * sub-categories stay together instead of scattering alphabetically.
 * Uncategorised rows sort last whichever way the column runs.
 */
function categoryOrderBy(direction: "ASC" | "DESC"): string {
  return [
    "(c.name IS NULL)",
    `COALESCE(parent.name, c.name) ${direction}`,
    "(parent.name IS NULL) DESC",
    `c.name ${direction}`,
  ].join(", ");
}

export function queryTransactions(
  workspaceId: number,
  params: QueryParams
): { transactions: TransactionWithCategory[]; total: number } {
  const db = getDb();
  const conditions: string[] = ["t.workspace_id = ?", "t.deleted_at IS NULL"];
  const values: (string | number)[] = [workspaceId];

  if (params.from) {
    conditions.push("t.date >= ?");
    values.push(params.from);
  }
  if (params.to) {
    conditions.push("substr(t.date, 1, 10) <= substr(?, 1, 10)");
    values.push(params.to);
  }
  if (params.search) {
    const raw = params.search.trim();
    const term = `%${raw}%`;
    // One box, three kinds of question: "who did I pay", "which 200 shekel
    // charge", "what happened on that date". Text always matches; a numeric or
    // date-shaped query additionally matches those columns, so the user never
    // has to pick a mode.
    const clauses = [
      "t.description LIKE ?",
      "t.memo LIKE ?",
      "t.user_note LIKE ?",
    ];
    values.push(term, term, term);

    const asNumber = Number(raw.replace(/[,₪\s]/g, ""));
    if (Number.isFinite(asNumber) && raw !== "") {
      // Match the amount to the agora, ignoring sign: "200" finds a 200 charge
      // and a 200 credit alike.
      clauses.push("ABS(ABS(t.charged_amount) - ?) < 0.005");
      values.push(Math.abs(asNumber));
    }

    // Accept 2026-09-05, 05/09/2026 and 5.9.2026 as the same day.
    const iso = normalizeDateQuery(raw);
    if (iso) {
      clauses.push("substr(t.date, 1, 10) = ?");
      values.push(iso);
    } else if (/^\d{4}-\d{2}$/.test(raw)) {
      clauses.push("substr(t.date, 1, 7) = ?");
      values.push(raw);
    }

    conditions.push(`(${clauses.join(" OR ")})`);
  }
  if (params.categoryIds && params.categoryIds.length > 0) {
    const placeholders = params.categoryIds.map(() => "?").join(",");
    conditions.push(`t.category_id IN (${placeholders})`);
    for (const cid of params.categoryIds) values.push(cid);
  } else if (params.category !== undefined) {
    conditions.push("t.category_id = ?");
    values.push(params.category);
  }
  const kind: TransactionKindFilter = params.kind ?? "all";
  if (kind === "income") {
    conditions.push("t.charged_amount > 0");
  } else if (kind === "expense") {
    conditions.push("t.charged_amount < 0");
  }
  // Transfers are money moving between the user's own accounts: a credit-card
  // settlement, a move between banks. The card's own itemised transactions are
  // already listed, so showing the settlement too reads as a duplicate. Hidden
  // unless explicitly asked for.
  if (params.includeTransfers !== true) {
    conditions.push("t.kind <> 'transfer'");
  }
  if (params.provider) {
    conditions.push("t.provider = ?");
    values.push(params.provider);
  }
  if (params.needsReview === true) {
    conditions.push("t.needs_review = 1");
  }
  // Compared on the absolute value: the user thinks "a charge of 200-500",
  // not "-500 to -200", and the same range should find a credit too.
  if (params.minAmount !== undefined) {
    conditions.push("ABS(t.charged_amount) >= ?");
    values.push(params.minAmount);
  }
  if (params.maxAmount !== undefined) {
    conditions.push("ABS(t.charged_amount) <= ?");
    values.push(params.maxAmount);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const sortCol = ALLOWED_SORT_COLUMNS.has(params.sort ?? "")
    ? params.sort!
    : "date";
  const sortOrder = params.order === "asc" ? "ASC" : "DESC";
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM transactions t ${where}`)
    .get(...values) as { total: number };

  const orderBy =
    sortCol === "category"
      ? categoryOrderBy(sortOrder as "ASC" | "DESC")
      : `t.${sortCol} ${sortOrder}`;

  const rows = db
    .prepare(
      `SELECT t.*, c.name as category_name, c.color as category_color
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN categories parent ON c.parent_id = parent.id
       ${where}
       ORDER BY ${orderBy}, t.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...values, limit, offset);

  return {
    transactions: rows.map(mapTransactionRow),
    total: countRow.total,
  };
}

export function getLatestTransactionDate(workspaceId: number): string | null {
  const row = getDb()
    .prepare(
      "SELECT MAX(date) AS latestDate FROM transactions WHERE workspace_id = ? AND deleted_at IS NULL"
    )
    .get(workspaceId) as { latestDate: string | null };
  return row.latestDate;
}

export function getUncategorizedTransactionIds(workspaceId: number): number[] {
  const rows = getDb()
    .prepare(
      "SELECT id FROM transactions WHERE workspace_id = ? AND deleted_at IS NULL AND category_id IS NULL AND kind != 'transfer' ORDER BY date DESC"
    )
    .all(workspaceId) as { id: number }[];
  return rows.map((r) => r.id);
}

export function getUncategorizedIdsByKind(
  workspaceId: number,
  kind: "expense" | "income"
): number[] {
  const rows = getDb()
    .prepare(
      "SELECT id FROM transactions WHERE workspace_id = ? AND deleted_at IS NULL AND category_id IS NULL AND kind = ? ORDER BY date DESC"
    )
    .all(workspaceId, kind) as { id: number }[];
  return rows.map((r) => r.id);
}

export function getTransactionsForCategorization(
  workspaceId: number,
  ids: number[]
): { id: number; description: string; chargedAmount: number; originalCurrency: string; memo: string | null; date: string }[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  // `date` is selected because user-written rules can carry a date range;
  // without it a date condition would silently never match during sync.
  return getDb()
    .prepare(
      `SELECT id, description, charged_amount as chargedAmount,
              original_currency as originalCurrency, memo, date
       FROM transactions WHERE workspace_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`
    )
    .all(workspaceId, ...ids) as { id: number; description: string; chargedAmount: number; originalCurrency: string; memo: string | null; date: string }[];
}

export function updateTransactionCategory(
  workspaceId: number,
  id: number,
  categoryId: number,
  source: "ai" | "user"
): void {
  getDb()
    .prepare(
      `UPDATE transactions
       SET category_id = ?, category_source = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(categoryId, source, workspaceId, id);
}

export function batchUpdateCategories(
  workspaceId: number,
  updates: { id: number; categoryId: number; aiConfidence?: number | null }[]
): void {
  const db = getDb();
  const stmt = db.prepare(
    `UPDATE transactions
     SET category_id = ?, category_source = 'ai', ai_confidence = ?, updated_at = datetime('now')
     WHERE workspace_id = ? AND id = ? AND category_source IS NOT 'user'`
  );

  db.transaction(() => {
    for (const { id, categoryId, aiConfidence } of updates) {
      stmt.run(categoryId, aiConfidence ?? null, workspaceId, id);
    }
  })();
}


export function getMonthlySummary(
  workspaceId: number,
  months: number
): MonthlySummary[] {
  return getDb()
    .prepare(
      `SELECT strftime('%Y-%m', date) as month,
              SUM(ABS(charged_amount)) as amount
       FROM operating_transactions
       WHERE workspace_id = ?
         AND date >= date('now', '-' || ? || ' months')
         AND status = 'completed'
         AND kind = 'expense'
       GROUP BY month
       ORDER BY month ASC`
    )
    .all(workspaceId, months) as MonthlySummary[];
}

export function getTopMerchants(
  workspaceId: number,
  from: string,
  to: string,
  limit = 10
): MerchantSummary[] {
  return getDb()
    .prepare(
      `SELECT description as name,
              SUM(ABS(charged_amount)) as amount,
              COUNT(*) as count
       FROM operating_transactions
       WHERE workspace_id = ? AND date >= ? AND substr(date, 1, 10) <= substr(?, 1, 10) AND status = 'completed' AND kind = 'expense'
       GROUP BY description
       ORDER BY amount DESC
       LIMIT ?`
    )
    .all(workspaceId, from, to, limit) as MerchantSummary[];
}

export function getCategoryBreakdown(
  workspaceId: number,
  from: string,
  to: string
): CategoryBreakdown[] {
  return getDb()
    .prepare(
      `SELECT
         COALESCE(t.category_id, 0) as categoryId,
         COALESCE(c.name, 'Uncategorized') as name,
         COALESCE(c.color, '#B5B3AC') as color,
         SUM(CASE WHEN t.kind = 'income' THEN -ABS(t.charged_amount)
                  ELSE ABS(t.charged_amount) END) as amount,
         COUNT(*) as count
       FROM operating_transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.workspace_id = ? AND t.date >= ? AND substr(t.date, 1, 10) <= substr(?, 1, 10)
         AND t.status = 'completed'
         AND (t.kind = 'expense'
              OR (t.kind = 'income' AND c.kind = 'expense'))
       GROUP BY t.category_id
       ORDER BY amount DESC`
    )
    .all(workspaceId, from, to) as CategoryBreakdown[];
}

export interface CategorySpend {
  categoryId: number;
  amount: number;
  count: number;
}

export function getCategorySpendInRange(
  workspaceId: number,
  from: string,
  to: string
): CategorySpend[] {
  return getDb()
    .prepare(
      // Income rows filed under an *expense* category are offsets - a refund
      // for something returned - so they subtract from that category's spend
      // instead of being dropped. Without this a ₪500 refund against a ₪1,000
      // purchase would leave the category still reading ₪1,000. The join on
      // c.kind keeps genuine income categories out of the spend figure.
      `SELECT t.category_id as categoryId,
              SUM(CASE WHEN t.kind = 'income' THEN -ABS(t.charged_amount)
                       ELSE ABS(t.charged_amount) END) as amount,
              COUNT(*) as count
       FROM operating_transactions t
       JOIN categories c ON c.id = t.category_id
       WHERE t.workspace_id = ? AND t.date >= ? AND substr(t.date, 1, 10) <= substr(?, 1, 10)
         AND t.status = 'completed' AND t.kind <> 'transfer'
         AND c.kind = 'expense'
       GROUP BY t.category_id`
    )
    .all(workspaceId, from, to) as CategorySpend[];
}

export interface CategoryTopMerchant {
  categoryId: number;
  merchant: string;
  amount: number;
}

export function getTopMerchantPerCategory(
  workspaceId: number,
  from: string,
  to: string
): CategoryTopMerchant[] {
  return getDb()
    .prepare(
      `SELECT category_id as categoryId, description as merchant, amount
       FROM (
         SELECT category_id, description, SUM(ABS(charged_amount)) as amount,
                ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY SUM(ABS(charged_amount)) DESC) as rn
         FROM operating_transactions
         WHERE workspace_id = ? AND date >= ? AND substr(date, 1, 10) <= substr(?, 1, 10) AND status = 'completed' AND kind = 'expense' AND category_id IS NOT NULL
         GROUP BY category_id, description
       )
       WHERE rn = 1`
    )
    .all(workspaceId, from, to) as CategoryTopMerchant[];
}

export interface DailySpendPoint {
  date: string;
  amount: number;
}

export function getCategorySpendByDay(
  workspaceId: number,
  categoryId: number,
  from: string,
  to: string
): DailySpendPoint[] {
  return getDb()
    .prepare(
      `WITH RECURSIVE days(d) AS (
         SELECT date(?)
         UNION ALL
         SELECT date(d, '+1 day') FROM days WHERE d < date(?)
       )
       -- Refunds (income rows filed under this expense category) subtract,
       -- matching getCategorySpendInRange so the detail sheet and the card
       -- cannot disagree about what was spent.
       SELECT days.d as date,
              COALESCE(SUM(CASE WHEN t.kind = 'income' THEN -ABS(t.charged_amount)
                                ELSE ABS(t.charged_amount) END), 0) as amount
       FROM days
       LEFT JOIN operating_transactions t
         ON substr(t.date, 1, 10) = days.d
         AND t.workspace_id = ?
         AND t.category_id = ?
         AND t.kind <> 'transfer'
         AND t.status = 'completed'
       GROUP BY days.d
       ORDER BY days.d ASC`
    )
    .all(from, to, workspaceId, categoryId) as DailySpendPoint[];
}

export interface TopMerchantForCategory {
  merchant: string;
  amount: number;
  count: number;
}

export function getTopMerchantsForCategory(
  workspaceId: number,
  categoryId: number,
  from: string,
  to: string,
  limit = 8
): TopMerchantForCategory[] {
  return getDb()
    .prepare(
      `SELECT description as merchant,
              SUM(ABS(charged_amount)) as amount,
              COUNT(*) as count
       FROM operating_transactions
       WHERE workspace_id = ? AND category_id = ?
         AND date >= ? AND substr(date, 1, 10) <= substr(?, 1, 10)
         AND status = 'completed'
         AND kind = 'expense'
       GROUP BY description
       ORDER BY amount DESC
       LIMIT ?`
    )
    .all(workspaceId, categoryId, from, to, limit) as TopMerchantForCategory[];
}

export function getPeriodTotal(
  workspaceId: number,
  from: string,
  to: string
): number {
  const row = getDb()
    .prepare(
      // Offsets (an income row filed under an expense category) reduce the
      // period's spend, the same way they reduce their category's.
      `SELECT COALESCE(SUM(CASE WHEN t.kind = 'income' THEN -ABS(t.charged_amount)
                               ELSE ABS(t.charged_amount) END), 0) as total
       FROM operating_transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.workspace_id = ? AND t.date >= ? AND substr(t.date, 1, 10) <= substr(?, 1, 10)
         AND t.status = 'completed'
         AND (t.kind = 'expense'
              OR (t.kind = 'income' AND c.kind = 'expense'))`
    )
    .get(workspaceId, from, to) as { total: number };
  return row.total;
}

export function getPeriodCount(
  workspaceId: number,
  from: string,
  to: string
): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as count
       FROM operating_transactions
       WHERE workspace_id = ? AND date >= ? AND substr(date, 1, 10) <= substr(?, 1, 10) AND status = 'completed' AND kind = 'expense'`
    )
    .get(workspaceId, from, to) as { count: number };
  return row.count;
}

interface TransactionRow {
  id: number;
  account_number: string;
  date: string;
  processed_date: string;
  original_amount: number;
  original_currency: string;
  charged_amount: number;
  charged_currency: string | null;
  description: string;
  memo: string | null;
  user_note: string | null;
  type: string;
  status: string;
  identifier: string | null;
  installment_number: number | null;
  installment_total: number | null;
  category_id: number | null;
  category_source: string | null;
  ai_confidence: number | null;
  provider: string;
  sync_run_id: number;
  kind: string;
  needs_review: number;
  review_reason: string | null;
  created_at: string;
  updated_at: string;
  category_name?: string | null;
  category_color?: string | null;
}

function mapTransactionRow(row: unknown): TransactionWithCategory {
  const r = row as TransactionRow;
  return {
    id: r.id,
    accountNumber: r.account_number,
    date: r.date,
    processedDate: r.processed_date,
    originalAmount: r.original_amount,
    originalCurrency: r.original_currency,
    chargedAmount: r.charged_amount,
    chargedCurrency: r.charged_currency,
    description: r.description,
    memo: r.memo,
    userNote: r.user_note,
    type: r.type as "normal" | "installments",
    status: r.status as "completed" | "pending",
    identifier: r.identifier,
    installmentNumber: r.installment_number,
    installmentTotal: r.installment_total,
    categoryId: r.category_id,
    categorySource: r.category_source as "ai" | "user" | null,
    aiConfidence: r.ai_confidence,
    provider: r.provider,
    syncRunId: r.sync_run_id,
    kind: r.kind as "expense" | "income" | "transfer",
    needsReview: r.needs_review === 1,
    reviewReason: r.review_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    categoryName: r.category_name ?? null,
    categoryColor: r.category_color ?? null,
  };
}

export function setTransactionKind(
  workspaceId: number,
  id: number,
  kind: "expense" | "income" | "transfer"
): void {
  getDb()
    .prepare(
      `UPDATE transactions
       SET kind = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(kind, workspaceId, id);
}

export function setTransactionNote(
  workspaceId: number,
  id: number,
  note: string | null
): void {
  getDb()
    .prepare(
      `UPDATE transactions
       SET user_note = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(note, workspaceId, id);
}

export function setTransactionAmount(
  workspaceId: number,
  id: number,
  value: number
): void {
  getDb()
    .prepare(
      `UPDATE transactions
       SET charged_amount = ?, amount_edited = 1, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL`
    )
    .run(value, workspaceId, id);
}

export function deleteTransaction(workspaceId: number, id: number): void {
  getDb()
    .prepare(
      `UPDATE transactions
       SET deleted_at = datetime('now'), updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL`
    )
    .run(workspaceId, id);
}

export function setTransactionNeedsReview(
  workspaceId: number,
  id: number,
  value: boolean,
  reason: string | null = null
): void {
  getDb()
    .prepare(
      `UPDATE transactions
       SET needs_review = ?, review_reason = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(value ? 1 : 0, value ? reason : null, workspaceId, id);
}

interface TransactionContext {
  id: number;
  description: string;
  /** Holds the transfer counterparty, which rule creation keys on. */
  memo: string | null;
  categoryId: number | null;
  categorySource: "ai" | "user" | null;
  kind: "expense" | "income" | "transfer";
}

export function getTransactionContext(
  workspaceId: number,
  id: number
): TransactionContext | null {
  const row = getDb()
    .prepare(
      `SELECT id, description, memo, category_id as categoryId,
              category_source as categorySource, kind
       FROM transactions WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL`
    )
    .get(workspaceId, id) as TransactionContext | undefined;
  return row ?? null;
}

export function batchSetNeedsReview(
  workspaceId: number,
  updates: { id: number; needsReview: boolean; reason?: string | null }[]
): void {
  if (updates.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    `UPDATE transactions
     SET needs_review = ?, review_reason = ?, updated_at = datetime('now')
     WHERE workspace_id = ? AND id = ?`
  );
  db.transaction(() => {
    for (const { id, needsReview, reason } of updates) {
      stmt.run(needsReview ? 1 : 0, needsReview ? reason ?? null : null, workspaceId, id);
    }
  })();
}

export interface NeedsReviewCount {
  categoryId: number;
  count: number;
}

export interface TransactionsSummary {
  income: {
    total: number;
    count: number;
    largest: TransactionWithCategory | null;
  };
  expense: {
    total: number;
    count: number;
    largest: TransactionWithCategory | null;
  };
  net: number;
  topMerchants: { description: string; total: number; count: number }[];
  pendingReviewCount: number;
}

export function getTransactionsSummary(
  workspaceId: number,
  from: string,
  to: string
): TransactionsSummary {
  const db = getDb();

  const incomeAgg = db
    .prepare(
      // An income row filed under an expense category is an offset, already
      // counted as negative spend. Counting it here as well would inflate
      // income and overstate net cash flow by the refund twice over.
      `SELECT COALESCE(SUM(t.charged_amount), 0) as total, COUNT(*) as count
       FROM operating_transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.workspace_id = ? AND t.date >= ? AND substr(t.date, 1, 10) <= substr(?, 1, 10)
         AND t.status = 'completed' AND t.kind = 'income'
         AND (c.kind IS NULL OR c.kind <> 'expense')`
    )
    .get(workspaceId, from, to) as { total: number; count: number };

  const expenseAgg = db
    .prepare(
      `SELECT COALESCE(SUM(ABS(charged_amount)), 0) as total, COUNT(*) as count
       FROM operating_transactions
       WHERE workspace_id = ? AND date >= ? AND substr(date, 1, 10) <= substr(?, 1, 10) AND status = 'completed' AND kind = 'expense'`
    )
    .get(workspaceId, from, to) as { total: number; count: number };

  const pickLargest = (sign: "income" | "expense"): TransactionWithCategory | null => {
    const row = db
      .prepare(
        `SELECT t.*, c.name as category_name, c.color as category_color
         FROM operating_transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.workspace_id = ? AND t.date >= ? AND substr(t.date, 1, 10) <= substr(?, 1, 10) AND t.status = 'completed' AND t.kind = ?
         ORDER BY ABS(t.charged_amount) DESC, t.id DESC
         LIMIT 1`
      )
      .get(workspaceId, from, to, sign);
    return row ? mapTransactionRow(row) : null;
  };

  const topMerchantsRows = db
    .prepare(
      `SELECT description,
              SUM(ABS(charged_amount)) as total,
              COUNT(*) as count
       FROM operating_transactions
       WHERE workspace_id = ? AND date >= ? AND substr(date, 1, 10) <= substr(?, 1, 10) AND status = 'completed' AND kind = 'expense'
       GROUP BY description
       ORDER BY total DESC
       LIMIT 5`
    )
    .all(workspaceId, from, to) as { description: string; total: number; count: number }[];

  const pendingReview = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM operating_transactions
       WHERE workspace_id = ? AND date >= ? AND substr(date, 1, 10) <= substr(?, 1, 10) AND status = 'completed' AND needs_review = 1`
    )
    .get(workspaceId, from, to) as { count: number };

  return {
    income: {
      total: incomeAgg.total,
      count: incomeAgg.count,
      largest: pickLargest("income"),
    },
    expense: {
      total: expenseAgg.total,
      count: expenseAgg.count,
      largest: pickLargest("expense"),
    },
    net: incomeAgg.total - expenseAgg.total,
    topMerchants: topMerchantsRows,
    pendingReviewCount: pendingReview.count,
  };
}

export function getNeedsReviewCountByCategory(
  workspaceId: number,
  from: string,
  to: string
): NeedsReviewCount[] {
  return getDb()
    .prepare(
      `SELECT category_id as categoryId, COUNT(*) as count
       FROM operating_transactions
       WHERE workspace_id = ? AND date >= ? AND substr(date, 1, 10) <= substr(?, 1, 10)
         AND status = 'completed'
         AND kind = 'expense'
         AND needs_review = 1
         AND category_id IS NOT NULL
       GROUP BY category_id`
    )
    .all(workspaceId, from, to) as NeedsReviewCount[];
}

/**
 * Set one category on many transactions as a deliberate user action.
 * Unlike batchUpdateCategories (which records AI guesses and refuses to touch
 * rows the user already decided), this marks the rows as user-owned and clears
 * the review flag, because the user is the one asking for it.
 */
export function bulkAssignCategory(
  workspaceId: number,
  ids: number[],
  categoryId: number
): number {
  if (ids.length === 0) return 0;
  const db = getDb();
  const stmt = db.prepare(
    `UPDATE transactions
        SET category_id = ?, category_source = 'user', needs_review = 0,
            review_reason = NULL, updated_at = datetime('now')
      WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL`
  );
  let changed = 0;
  db.transaction(() => {
    for (const id of ids) {
      changed += stmt.run(categoryId, workspaceId, id).changes;
    }
  })();
  return changed;
}


/**
 * Turn a user-typed date into YYYY-MM-DD, or null when it is not a date.
 * Accepts 2026-09-05, 05/09/2026, 5.9.26 and similar day-first forms, which is
 * how dates are written locally.
 */
function normalizeDateQuery(raw: string): string | null {
  const pad = (n: number) => String(n).padStart(2, "0");

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${pad(Number(m))}-${pad(Number(d))}`;
  }

  const dmy = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (dmy) {
    const [, d, m, yRaw] = dmy;
    const year = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return `${year}-${pad(Number(m))}-${pad(Number(d))}`;
    }
  }
  return null;
}
