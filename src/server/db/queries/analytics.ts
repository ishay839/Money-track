import "server-only";

import { getDb } from "../index";

/**
 * Analytics queries that look across many months rather than inside one period.
 *
 * Everything here reads `operating_transactions`, the view that already drops
 * transfers and investment movements, so a credit-card settlement or a move
 * between the user's own accounts never counts as spending.
 */

export interface MonthPoint {
  month: string; // YYYY-MM
  amount: number;
  count: number;
}

/**
 * Spend per calendar month for one category (and its children, when ids are
 * passed in). Months with no activity come back as zero so the chart keeps an
 * unbroken axis.
 */
export function getCategoryMonthlyHistory(
  workspaceId: number,
  categoryIds: number[],
  fromMonth: string,
  toMonth: string
): MonthPoint[] {
  if (categoryIds.length === 0) return [];
  const placeholders = categoryIds.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT substr(date, 1, 7) AS month,
              SUM(ABS(charged_amount)) AS amount,
              COUNT(*) AS count
         FROM operating_transactions
        WHERE workspace_id = ?
          AND category_id IN (${placeholders})
          AND status = 'completed'
          AND kind = 'expense'
          AND substr(date, 1, 7) >= ?
          AND substr(date, 1, 7) <= ?
        GROUP BY month`
    )
    .all(workspaceId, ...categoryIds, fromMonth, toMonth) as MonthPoint[];

  return fillMonths(rows, fromMonth, toMonth);
}

/** Total expense per month across every category. */
export function getMonthlyTotals(
  workspaceId: number,
  fromMonth: string,
  toMonth: string,
  kind: "expense" | "income" = "expense"
): MonthPoint[] {
  const rows = getDb()
    .prepare(
      `SELECT substr(date, 1, 7) AS month,
              SUM(ABS(charged_amount)) AS amount,
              COUNT(*) AS count
         FROM operating_transactions
        WHERE workspace_id = ?
          AND status = 'completed'
          AND kind = ?
          AND substr(date, 1, 7) >= ?
          AND substr(date, 1, 7) <= ?
        GROUP BY month`
    )
    .all(workspaceId, kind, fromMonth, toMonth) as MonthPoint[];
  return fillMonths(rows, fromMonth, toMonth);
}

function fillMonths(
  rows: MonthPoint[],
  fromMonth: string,
  toMonth: string
): MonthPoint[] {
  const map = new Map(rows.map((r) => [r.month, r]));
  const out: MonthPoint[] = [];
  const [fy, fm] = fromMonth.split("-").map(Number);
  const [ty, tm] = toMonth.split("-").map(Number);
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(map.get(key) ?? { month: key, amount: 0, count: 0 });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Data coverage                                                       */
/* ------------------------------------------------------------------ */

export interface CoverageCell {
  month: string;
  provider: string;
  count: number;
  expense: number;
}

/**
 * Transaction count per month per provider. A provider that produced nothing
 * in a month simply has no row, which is what the coverage grid renders as a
 * gap. Counts every stored transaction, transfers included, because the
 * question here is "did the data arrive", not "what did I spend".
 */
export function getCoverageMatrix(workspaceId: number): CoverageCell[] {
  return getDb()
    .prepare(
      `SELECT substr(date, 1, 7) AS month,
              provider,
              COUNT(*) AS count,
              COALESCE(SUM(CASE WHEN kind = 'expense' THEN ABS(charged_amount) END), 0) AS expense
         FROM transactions
        WHERE workspace_id = ? AND deleted_at IS NULL
        GROUP BY month, provider
        ORDER BY month DESC`
    )
    .all(workspaceId) as CoverageCell[];
}

/* ------------------------------------------------------------------ */
/* Recurring charges                                                   */
/* ------------------------------------------------------------------ */

export interface RecurringCharge {
  description: string;
  months: number;
  count: number;
  avgAmount: number;
  minAmount: number;
  maxAmount: number;
  lastDate: string;
  lastAmount: number;
  /** (max-min)/avg as a percent: 0 means the amount never moves. */
  spreadPercent: number;
  /** A charge whose amount barely moves is a real commitment, not just a habit. */
  isFixed: boolean;
  /** Days since the most recent charge. */
  daysSinceLast: number;
  /**
   * A monthly charge that skipped its slot: nothing in the previous calendar
   * month and nothing so far in this one. A lease that ended in July looks
   * exactly like this by September, and must not be counted as still running.
   */
  isStale: boolean;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  /** Latest amount vs the average of the earlier ones, in percent. */
  driftPercent: number | null;
}

/**
 * Charges that repeat across calendar months under the same description.
 * `minMonths` of 4 keeps out things that merely happened twice.
 */
export function getRecurringCharges(
  workspaceId: number,
  sinceMonth: string,
  minMonths = 4
): RecurringCharge[] {
  const rows = getDb()
    .prepare(
      `SELECT t.description                       AS description,
              COUNT(DISTINCT substr(t.date, 1, 7)) AS months,
              COUNT(*)                            AS count,
              AVG(ABS(t.charged_amount))          AS avgAmount,
              MIN(ABS(t.charged_amount))          AS minAmount,
              MAX(ABS(t.charged_amount))          AS maxAmount,
              MAX(t.date)                         AS lastDate,
              MAX(t.category_id)                  AS categoryId,
              MAX(c.name)                         AS categoryName,
              MAX(c.color)                        AS categoryColor
         FROM operating_transactions t
         LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.workspace_id = ?
          AND t.status = 'completed'
          AND t.kind = 'expense'
          AND substr(t.date, 1, 7) >= ?
        GROUP BY t.description
       HAVING months >= ?
        ORDER BY avgAmount * months DESC`
    )
    .all(workspaceId, sinceMonth, minMonths) as Array<
    Omit<
      RecurringCharge,
      | "lastAmount"
      | "driftPercent"
      | "spreadPercent"
      | "isFixed"
      | "daysSinceLast"
      | "isStale"
    >
  >;

  const lastAmountStmt = getDb().prepare(
    `SELECT ABS(charged_amount) AS amount
       FROM operating_transactions
      WHERE workspace_id = ? AND description = ? AND kind = 'expense'
      ORDER BY date DESC LIMIT 1`
  );
  const earlierAvgStmt = getDb().prepare(
    `SELECT AVG(amount) AS avg FROM (
        SELECT ABS(charged_amount) AS amount
          FROM operating_transactions
         WHERE workspace_id = ? AND description = ? AND kind = 'expense'
         ORDER BY date DESC LIMIT 6 OFFSET 1
     )`
  );

  return rows.map((r) => {
    const last =
      (lastAmountStmt.get(workspaceId, r.description) as { amount: number } | undefined)
        ?.amount ?? 0;
    const prior =
      (earlierAvgStmt.get(workspaceId, r.description) as { avg: number | null } | undefined)
        ?.avg ?? null;
    const spread =
      r.avgAmount > 0 ? ((r.maxAmount - r.minAmount) / r.avgAmount) * 100 : 0;
    const lastMs = Date.parse(r.lastDate.slice(0, 10));
    const daysSinceLast = Number.isFinite(lastMs)
      ? Math.floor((Date.now() - lastMs) / 86_400_000)
      : 0;
    // Compare calendar months rather than raw days: a charge billed on the 14th
    // is ~31 days old at its next due date, but one that skipped a whole month
    // has stopped regardless of where in the month we happen to be standing.
    const now = new Date();
    const lastMonthKey = r.lastDate.slice(0, 7);
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthKey = `${prevMonth.getFullYear()}-${String(
      prevMonth.getMonth() + 1
    ).padStart(2, "0")}`;
    return {
      ...r,
      lastAmount: last,
      daysSinceLast,
      isStale: lastMonthKey < prevMonthKey,
      spreadPercent: spread,
      // 25% allows for index-linked or rate-driven drift (a mortgage moves a
      // little) while excluding merchants that merely recur at random amounts.
      isFixed: spread <= 25,
      driftPercent:
        prior && prior > 0 ? ((last - prior) / prior) * 100 : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Cumulative pace                                                     */
/* ------------------------------------------------------------------ */

export interface CumulativePoint {
  day: number;
  amount: number;
}

/**
 * Running expense total by day-of-month, so the current month can be laid over
 * previous ones ("am I ahead of where I usually am by the 9th?").
 */
export function getCumulativeByDay(
  workspaceId: number,
  month: string
): CumulativePoint[] {
  const rows = getDb()
    .prepare(
      `SELECT CAST(substr(date, 9, 2) AS INTEGER) AS day,
              SUM(ABS(charged_amount)) AS amount
         FROM operating_transactions
        WHERE workspace_id = ?
          AND status = 'completed'
          AND kind = 'expense'
          AND substr(date, 1, 7) = ?
        GROUP BY day
        ORDER BY day`
    )
    .all(workspaceId, month) as Array<{ day: number; amount: number }>;

  const out: CumulativePoint[] = [];
  let running = 0;
  const byDay = new Map(rows.map((r) => [r.day, r.amount]));
  for (let d = 1; d <= 31; d++) {
    running += byDay.get(d) ?? 0;
    out.push({ day: d, amount: running });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Outliers                                                            */
/* ------------------------------------------------------------------ */

export interface Outlier {
  id: number;
  date: string;
  description: string;
  amount: number;
  categoryName: string | null;
  typicalAmount: number;
  timesTypical: number;
}

/**
 * Transactions far larger than what that merchant usually charges. Needs at
 * least three prior charges from the same merchant before it will call one
 * unusual, so a first-time large purchase is not flagged.
 */
export function getOutliers(
  workspaceId: number,
  fromMonth: string,
  minMultiple = 3
): Outlier[] {
  return getDb()
    .prepare(
      `WITH stats AS (
         SELECT description,
                AVG(ABS(charged_amount)) AS typical,
                COUNT(*) AS n
           FROM operating_transactions
          WHERE workspace_id = ? AND kind = 'expense' AND status = 'completed'
          GROUP BY description
         HAVING n >= 4
       )
       SELECT t.id, t.date, t.description,
              ABS(t.charged_amount) AS amount,
              c.name AS categoryName,
              s.typical AS typicalAmount,
              ABS(t.charged_amount) / s.typical AS timesTypical
         FROM operating_transactions t
         JOIN stats s ON s.description = t.description
         LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.workspace_id = ?
          AND t.kind = 'expense'
          AND t.status = 'completed'
          AND substr(t.date, 1, 7) >= ?
          AND ABS(t.charged_amount) > s.typical * ?
        ORDER BY timesTypical DESC
        LIMIT 40`
    )
    .all(workspaceId, workspaceId, fromMonth, minMultiple) as Outlier[];
}

/* ------------------------------------------------------------------ */
/* Year over year                                                      */
/* ------------------------------------------------------------------ */

export interface YearCategoryRow {
  categoryId: number;
  name: string;
  color: string;
  current: number;
  previous: number;
}

export function getYearCategoryComparison(
  workspaceId: number,
  currentYear: number
): YearCategoryRow[] {
  return getDb()
    .prepare(
      `SELECT c.id AS categoryId, c.name AS name, c.color AS color,
              COALESCE(SUM(CASE WHEN substr(t.date,1,4) = ? THEN ABS(t.charged_amount) END), 0) AS current,
              COALESCE(SUM(CASE WHEN substr(t.date,1,4) = ? THEN ABS(t.charged_amount) END), 0) AS previous
         FROM operating_transactions t
         JOIN categories c ON c.id = t.category_id
        WHERE t.workspace_id = ?
          AND t.kind = 'expense'
          AND t.status = 'completed'
          AND substr(t.date,1,4) IN (?, ?)
        GROUP BY c.id
       HAVING current > 0 OR previous > 0
        ORDER BY ABS(current - previous) DESC`
    )
    .all(
      String(currentYear),
      String(currentYear - 1),
      workspaceId,
      String(currentYear),
      String(currentYear - 1)
    ) as YearCategoryRow[];
}

/* ------------------------------------------------------------------ */
/* Income breakdown                                                    */
/* ------------------------------------------------------------------ */

export interface IncomeCategoryRow {
  categoryId: number;
  name: string;
  color: string;
  icon: string | null;
  parentId: number | null;
  received: number;
  count: number;
  /** Same category in the preceding period, for a like-for-like delta. */
  previous: number;
  topSource: string | null;
  /**
   * Distinct calendar months this category paid out over the trailing year -
   * not just the selected period, which would always be 1 for a monthly view.
   */
  activeMonths: number;
  lastDate: string | null;
}

/**
 * Income per category for a period, with the previous period alongside.
 * Mirrors the expense breakdown so the income page can show the same shape of
 * information rather than a thinner version of it.
 */
export function getIncomeBreakdown(
  workspaceId: number,
  from: string,
  to: string,
  prevFrom: string,
  prevTo: string
): IncomeCategoryRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.id            AS categoryId,
              c.name          AS name,
              c.color         AS color,
              c.icon          AS icon,
              c.parent_id     AS parentId,
              SUM(ABS(t.charged_amount)) AS received,
              COUNT(*)        AS count,
              MAX(t.date)     AS lastDate
         FROM operating_transactions t
         JOIN categories c ON c.id = t.category_id
        WHERE t.workspace_id = ?
          AND t.kind = 'income'
          AND t.status = 'completed'
          AND t.date >= ?
          AND substr(t.date, 1, 10) <= substr(?, 1, 10)
          -- Offsets sit in an expense category; they belong to that
          -- category's spend, not to the income list.
          AND c.kind = 'income'
        GROUP BY c.id
        ORDER BY received DESC`
    )
    .all(workspaceId, from, to) as Array<
    Omit<IncomeCategoryRow, "previous" | "topSource" | "activeMonths">
  >;

  // "Does this category pay out regularly?" only means something over a longer
  // window than the month on screen.
  const yearStart = new Date(from);
  yearStart.setMonth(yearStart.getMonth() - 11);
  const yearFromMonth = `${yearStart.getFullYear()}-${String(
    yearStart.getMonth() + 1
  ).padStart(2, "0")}`;
  const toMonth = to.slice(0, 7);
  const activeStmt = db.prepare(
    `SELECT COUNT(DISTINCT substr(date, 1, 7)) AS months
       FROM operating_transactions
      WHERE workspace_id = ? AND kind = 'income' AND status = 'completed'
        AND category_id = ?
        AND substr(date, 1, 7) >= ? AND substr(date, 1, 7) <= ?`
  );

  const prevStmt = db.prepare(
    `SELECT SUM(ABS(charged_amount)) AS total
       FROM operating_transactions
      WHERE workspace_id = ? AND kind = 'income' AND status = 'completed'
        AND category_id = ? AND date >= ?
        AND substr(date, 1, 10) <= substr(?, 1, 10)`
  );
  const topStmt = db.prepare(
    `SELECT description, SUM(ABS(charged_amount)) AS total
       FROM operating_transactions
      WHERE workspace_id = ? AND kind = 'income' AND status = 'completed'
        AND category_id = ? AND date >= ?
        AND substr(date, 1, 10) <= substr(?, 1, 10)
      GROUP BY description
      ORDER BY total DESC
      LIMIT 1`
  );

  return rows.map((r) => ({
    ...r,
    activeMonths:
      (
        activeStmt.get(
          workspaceId,
          r.categoryId,
          yearFromMonth,
          toMonth
        ) as { months: number }
      ).months,
    previous:
      (prevStmt.get(workspaceId, r.categoryId, prevFrom, prevTo) as {
        total: number | null;
      }).total ?? 0,
    topSource:
      (
        topStmt.get(workspaceId, r.categoryId, from, to) as
          | { description: string }
          | undefined
      )?.description ?? null,
  }));
}

export interface IncomeSource {
  description: string;
  total: number;
  count: number;
  categoryName: string | null;
  categoryColor: string | null;
  lastDate: string;
}

/** Who actually paid, regardless of category. */
export function getTopIncomeSources(
  workspaceId: number,
  from: string,
  to: string,
  limit = 8
): IncomeSource[] {
  return getDb()
    .prepare(
      `SELECT t.description AS description,
              SUM(ABS(t.charged_amount)) AS total,
              COUNT(*) AS count,
              MAX(c.name) AS categoryName,
              MAX(c.color) AS categoryColor,
              MAX(t.date) AS lastDate
         FROM operating_transactions t
         LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.workspace_id = ?
          AND t.kind = 'income'
          AND t.status = 'completed'
          AND t.date >= ?
          AND substr(t.date, 1, 10) <= substr(?, 1, 10)
        GROUP BY t.description
        ORDER BY total DESC
        LIMIT ?`
    )
    .all(workspaceId, from, to, limit) as IncomeSource[];
}

/**
 * Monthly income totals split into recurring and one-off.
 * A source seen in at least three distinct months counts as recurring, which
 * separates a salary from a windfall without needing the user to tag anything.
 */
export function getIncomeStability(
  workspaceId: number,
  fromMonth: string,
  toMonth: string
): Array<{ month: string; recurring: number; oneOff: number }> {
  const db = getDb();
  const recurringSources = new Set(
    (
      db
        .prepare(
          `SELECT description
             FROM operating_transactions
            WHERE workspace_id = ? AND kind = 'income' AND status = 'completed'
              AND substr(date, 1, 7) >= ? AND substr(date, 1, 7) <= ?
            GROUP BY description
           HAVING COUNT(DISTINCT substr(date, 1, 7)) >= 3`
        )
        .all(workspaceId, fromMonth, toMonth) as Array<{ description: string }>
    ).map((r) => r.description)
  );

  const rows = db
    .prepare(
      `SELECT substr(date, 1, 7) AS month,
              description,
              SUM(ABS(charged_amount)) AS total
         FROM operating_transactions
        WHERE workspace_id = ? AND kind = 'income' AND status = 'completed'
          AND substr(date, 1, 7) >= ? AND substr(date, 1, 7) <= ?
        GROUP BY month, description`
    )
    .all(workspaceId, fromMonth, toMonth) as Array<{
    month: string;
    description: string;
    total: number;
  }>;

  const byMonth = new Map<string, { recurring: number; oneOff: number }>();
  for (const r of rows) {
    const bucket = byMonth.get(r.month) ?? { recurring: 0, oneOff: 0 };
    if (recurringSources.has(r.description)) bucket.recurring += r.total;
    else bucket.oneOff += r.total;
    byMonth.set(r.month, bucket);
  }

  return fillMonths(
    Array.from(byMonth, ([month, v]) => ({
      month,
      amount: v.recurring + v.oneOff,
      count: 0,
    })),
    fromMonth,
    toMonth
  ).map((m) => ({
    month: m.month,
    recurring: byMonth.get(m.month)?.recurring ?? 0,
    oneOff: byMonth.get(m.month)?.oneOff ?? 0,
  }));
}


/** Income per month for a single category, for the drill-down trend. */
export function getIncomeCategoryHistory(
  workspaceId: number,
  categoryId: number,
  fromMonth: string,
  toMonth: string
): MonthPoint[] {
  const rows = getDb()
    .prepare(
      `SELECT substr(date, 1, 7) AS month,
              SUM(ABS(charged_amount)) AS amount,
              COUNT(*) AS count
         FROM operating_transactions
        WHERE workspace_id = ?
          AND category_id = ?
          AND kind = 'income'
          AND status = 'completed'
          AND substr(date, 1, 7) >= ?
          AND substr(date, 1, 7) <= ?
        GROUP BY month`
    )
    .all(workspaceId, categoryId, fromMonth, toMonth) as MonthPoint[];
  return fillMonths(rows, fromMonth, toMonth);
}

/* ------------------------------------------------------------------ */
/* Big household expenses                                              */
/* ------------------------------------------------------------------ */

export interface GroupSpendRow {
  categoryId: number;
  name: string;
  color: string;
  /** Spend in the requested window. */
  total: number;
  transactionCount: number;
  /** Same length of window immediately before it, for a like-for-like delta. */
  previous: number;
  /** Leaf categories inside this group, biggest first. */
  children: Array<{ categoryId: number; name: string; total: number }>;
}

/**
 * Spend per top-level group over a window, rolled up from the leaves beneath
 * it. A leaf with no parent is reported as its own group, so nothing is
 * invisible just because it was never filed under a heading.
 */
export function getGroupSpend(
  workspaceId: number,
  from: string,
  to: string,
  previousFrom: string,
  previousTo: string
): GroupSpendRow[] {
  const rows = getDb()
    .prepare(
      `SELECT COALESCE(p.id, c.id)    AS groupId,
              COALESCE(p.name, c.name) AS groupName,
              COALESCE(p.color, c.color) AS groupColor,
              c.id                     AS leafId,
              c.name                   AS leafName,
              COALESCE(SUM(CASE WHEN substr(t.date,1,10) >= ? AND substr(t.date,1,10) <= ?
                                THEN ABS(t.charged_amount) END), 0) AS total,
              COALESCE(SUM(CASE WHEN substr(t.date,1,10) >= ? AND substr(t.date,1,10) <= ?
                                THEN ABS(t.charged_amount) END), 0) AS previous,
              COUNT(CASE WHEN substr(t.date,1,10) >= ? AND substr(t.date,1,10) <= ?
                         THEN t.id END) AS transactionCount
         FROM operating_transactions t
         JOIN categories c ON c.id = t.category_id
    LEFT JOIN categories p ON p.id = c.parent_id
        WHERE t.workspace_id = ?
          AND t.kind = 'expense'
          AND t.status = 'completed'
          AND substr(t.date,1,10) >= ?
          AND substr(t.date,1,10) <= ?
     GROUP BY groupId, c.id
       HAVING total > 0 OR previous > 0`
    )
    .all(
      from, to,
      previousFrom, previousTo,
      from, to,
      workspaceId,
      previousFrom, to
    ) as Array<{
    groupId: number;
    groupName: string;
    groupColor: string;
    leafId: number;
    leafName: string;
    total: number;
    previous: number;
    transactionCount: number;
  }>;

  const byGroup = new Map<number, GroupSpendRow>();
  for (const r of rows) {
    let group = byGroup.get(r.groupId);
    if (!group) {
      group = {
        categoryId: r.groupId,
        name: r.groupName,
        color: r.groupColor,
        total: 0,
        previous: 0,
        transactionCount: 0,
        children: [],
      };
      byGroup.set(r.groupId, group);
    }
    group.total += r.total;
    group.previous += r.previous;
    group.transactionCount += r.transactionCount;
    if (r.total > 0) {
      group.children.push({
        categoryId: r.leafId,
        name: r.leafName,
        total: r.total,
      });
    }
  }

  const out = [...byGroup.values()];
  for (const g of out) g.children.sort((a, b) => b.total - a.total);
  return out.sort((a, b) => b.total - a.total);
}
