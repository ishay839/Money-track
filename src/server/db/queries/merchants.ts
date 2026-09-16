import "server-only";

import { getDb } from "../index";
import type { TransactionWithCategory } from "@/lib/types";
import {
  BY_MARKER,
  FOR_MARKER,
  NON_NAME_PATTERNS,
  TO_MARKER,
  TRANSFER_PATTERNS,
} from "@/lib/merchant-key";

/**
 * Merchant detail: the mini-dashboard a category gets, but keyed on who the
 * money actually went to or came from.
 */

export interface MerchantMonthPoint {
  month: string;
  expense: number;
  income: number;
  count: number;
}

export interface MerchantCategorySlice {
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  amount: number;
  count: number;
}

export interface MerchantListRow {
  merchant: string;
  isCounterparty: boolean;
  expense: number;
  income: number;
  count: number;
  lastSeen: string;
}

export interface MerchantDetail {
  merchant: string;
  /** True when rows were matched on a transfer counterparty, not a description. */
  isCounterparty: boolean;
  year: number;
  expenseTotal: number;
  incomeTotal: number;
  net: number;
  count: number;
  firstSeen: string | null;
  lastSeen: string | null;
  /** Averaged over months that had activity, not over 12. */
  monthlyAverage: number;
  activeMonths: number;
  lifetimeExpense: number;
  lifetimeIncome: number;
  lifetimeCount: number;
  months: MerchantMonthPoint[];
  categories: MerchantCategorySlice[];
  transactions: TransactionWithCategory[];
  availableYears: number[];
}

/**
 * Transfer descriptions name the channel ("העברה בBIT", "PAYBOX"), never the
 * person, so 137 BIT rows would otherwise collapse into one meaningless
 * bucket. The counterparty lives in the memo instead.
 *
 * The rules themselves live in lib/merchant-key.ts, which the client uses to
 * decide which party a clicked row belongs to. This builds the equivalent SQL
 * from those same constants: if the two disagreed, clicking a row would open a
 * different party than the one it aggregates under.
 */
function afterMarker(marker: string): string {
  // instr() is 1-based and the marker is followed by a space, hence +1.
  return `substr(t.memo, instr(t.memo, '${marker}') + ${marker.length + 1})`;
}

/** Cuts a value at whichever terminator comes first: "." or "עבור:". */
function upToTerminator(expr: string): string {
  const dot = `instr(${expr}, '.')`;
  const forPos = `instr(${expr}, '${FOR_MARKER}')`;
  // Positions are 1-based with 0 meaning absent, so pick the smaller non-zero.
  const cut = `CASE
      WHEN ${dot} > 0 AND ${forPos} > 0 THEN MIN(${dot}, ${forPos})
      WHEN ${dot} > 0 THEN ${dot}
      WHEN ${forPos} > 0 THEN ${forPos}
      ELSE 0 END`;
  return `trim(CASE WHEN (${cut}) > 0
    THEN substr(${expr}, 1, (${cut}) - 1)
    ELSE ${expr} END)`;
}

const TRANSFER_LIKE = `(${TRANSFER_PATTERNS.map(
  (p) => `t.description LIKE '%${p}%'`
).join(" OR ")})`;

const NOT_A_NAME = `(${[
  ...NON_NAME_PATTERNS.map((p) => `t.memo LIKE '%${p}%'`),
  "t.memo LIKE '%תשלום %מתוך%'",
].join(" OR ")})`;

const COUNTERPARTY = `CASE
  WHEN t.memo LIKE '%${TO_MARKER}%' THEN ${upToTerminator(afterMarker(TO_MARKER))}
  WHEN t.memo LIKE '%${BY_MARKER}%' THEN ${upToTerminator(afterMarker(BY_MARKER))}
  WHEN t.memo IS NOT NULL AND trim(t.memo) <> ''
       AND ${TRANSFER_LIKE} AND NOT ${NOT_A_NAME}
       AND t.memo NOT LIKE '%${FOR_MARKER}%'
       AND length(trim(t.memo)) BETWEEN 2 AND 40
    THEN trim(t.memo)
  ELSE NULL END`;

const LABEL = `COALESCE(${COUNTERPARTY}, t.description)`;

const IS_EXPENSE = "t.kind <> 'income'";
const IS_INCOME = "t.kind = 'income'";

/** Every distinct party in the ledger, ranked by turnover. */
export function listMerchants(
  workspaceId: number,
  opts: { from?: string; to?: string; search?: string; limit?: number } = {}
): MerchantListRow[] {
  const where = ["t.deleted_at IS NULL", "t.workspace_id = ?"];
  const args: unknown[] = [workspaceId];

  if (opts.from) {
    where.push("t.date >= ?");
    args.push(opts.from);
  }
  if (opts.to) {
    where.push("substr(t.date,1,10) <= substr(?,1,10)");
    args.push(opts.to);
  }
  if (opts.search) {
    where.push(`${LABEL} LIKE ?`);
    args.push(`%${opts.search}%`);
  }
  args.push(opts.limit ?? 300);

  const rows = getDb()
    .prepare(
      `SELECT ${LABEL} AS merchant,
              MAX(CASE WHEN ${COUNTERPARTY} IS NOT NULL THEN 1 ELSE 0 END) AS isCounterparty,
              COALESCE(SUM(CASE WHEN ${IS_EXPENSE} THEN ABS(t.charged_amount) ELSE 0 END),0) AS expense,
              COALESCE(SUM(CASE WHEN ${IS_INCOME} THEN ABS(t.charged_amount) ELSE 0 END),0) AS income,
              COUNT(*) AS count,
              MAX(substr(t.date,1,10)) AS lastSeen
         FROM transactions t
        WHERE ${where.join(" AND ")}
        GROUP BY merchant
       HAVING merchant IS NOT NULL AND trim(merchant) <> ''
        ORDER BY (expense + income) DESC
        LIMIT ?`
    )
    // SQLite has no boolean, so the flag arrives as 0/1 and is widened here.
    .all(...args) as Array<Omit<MerchantListRow, "isCounterparty"> & {
    isCounterparty: number;
  }>;

  return rows.map((r) => ({ ...r, isCounterparty: Boolean(r.isCounterparty) }));
}

export function listMerchantYears(
  workspaceId: number,
  merchant: string
): number[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT CAST(substr(t.date,1,4) AS INTEGER) y
         FROM transactions t
        WHERE t.deleted_at IS NULL AND t.workspace_id = ? AND ${LABEL} = ?
        ORDER BY y DESC`
    )
    .all(workspaceId, merchant) as Array<{ y: number }>;
  return rows.map((r) => r.y);
}

export function getMerchantDetail(
  workspaceId: number,
  merchant: string,
  year: number
): MerchantDetail {
  const db = getDb();
  const scope = `t.deleted_at IS NULL AND t.workspace_id = ? AND ${LABEL} = ?`;
  const y = String(year);

  const lifetime = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN ${IS_EXPENSE} THEN ABS(t.charged_amount) ELSE 0 END),0) expense,
              COALESCE(SUM(CASE WHEN ${IS_INCOME} THEN ABS(t.charged_amount) ELSE 0 END),0) income,
              COUNT(*) count,
              MIN(substr(t.date,1,10)) firstSeen,
              MAX(substr(t.date,1,10)) lastSeen,
              MAX(CASE WHEN ${COUNTERPARTY} IS NOT NULL THEN 1 ELSE 0 END) isCounterparty
         FROM transactions t
        WHERE ${scope}`
    )
    .get(workspaceId, merchant) as {
    expense: number;
    income: number;
    count: number;
    firstSeen: string | null;
    lastSeen: string | null;
    isCounterparty: number;
  };

  const months = db
    .prepare(
      `SELECT substr(t.date,1,7) month,
              COALESCE(SUM(CASE WHEN ${IS_EXPENSE} THEN ABS(t.charged_amount) ELSE 0 END),0) expense,
              COALESCE(SUM(CASE WHEN ${IS_INCOME} THEN ABS(t.charged_amount) ELSE 0 END),0) income,
              COUNT(*) count
         FROM transactions t
        WHERE ${scope} AND substr(t.date,1,4) = ?
        GROUP BY month
        ORDER BY month`
    )
    .all(workspaceId, merchant, y) as MerchantMonthPoint[];

  const categories = db
    .prepare(
      `SELECT t.category_id categoryId, c.name categoryName, c.color categoryColor,
              COALESCE(SUM(ABS(t.charged_amount)),0) amount, COUNT(*) count
         FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
        WHERE ${scope} AND substr(t.date,1,4) = ?
        GROUP BY t.category_id, c.name, c.color
        ORDER BY amount DESC`
    )
    .all(workspaceId, merchant, y) as MerchantCategorySlice[];

  const transactions = db
    .prepare(
      `SELECT t.id, t.date, t.processed_date processedDate, t.description, t.memo,
              t.user_note userNote, t.charged_amount chargedAmount,
              t.charged_currency chargedCurrency, t.original_amount originalAmount,
              t.original_currency originalCurrency,
              t.category_id categoryId, c.name categoryName, c.color categoryColor,
              t.category_source categorySource, t.kind, t.status, t.provider,
              t.needs_review needsReview, t.review_reason reviewReason,
              t.account_number accountNumber, t.type, t.identifier,
              t.installment_number installmentNumber,
              t.installment_total installmentTotal,
              t.ai_confidence aiConfidence, t.sync_run_id syncRunId,
              t.created_at createdAt, t.updated_at updatedAt
         FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
        WHERE ${scope} AND substr(t.date,1,4) = ?
        ORDER BY t.date DESC, t.id DESC
        LIMIT 100`
    )
    .all(workspaceId, merchant, y) as unknown as TransactionWithCategory[];

  const totals = months.reduce(
    (acc, m) => {
      acc.expense += m.expense;
      acc.income += m.income;
      acc.count += m.count;
      return acc;
    },
    { expense: 0, income: 0, count: 0 }
  );
  const activeMonths = months.filter((m) => m.count > 0).length;

  return {
    merchant,
    isCounterparty: Boolean(lifetime.isCounterparty),
    year,
    expenseTotal: totals.expense,
    incomeTotal: totals.income,
    net: totals.income - totals.expense,
    count: totals.count,
    firstSeen: lifetime.firstSeen,
    lastSeen: lifetime.lastSeen,
    // Averaged over active months: a merchant seen twice in March is not a
    // "X per month" habit, and dividing by 12 would imply that it is.
    monthlyAverage:
      activeMonths > 0 ? (totals.expense + totals.income) / activeMonths : 0,
    activeMonths,
    lifetimeExpense: lifetime.expense,
    lifetimeIncome: lifetime.income,
    lifetimeCount: lifetime.count,
    months,
    categories,
    transactions,
    availableYears: listMerchantYears(workspaceId, merchant),
  };
}
