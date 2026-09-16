import "server-only";
import { getDb } from "../index";

export type TrackMode = "excluded" | "net_income" | "included";

export interface Track {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  mode: TrackMode;
  categoryIds: number[];
}

export interface TrackSummary extends Track {
  income: number;
  expenses: number;
  net: number;
  transactionCount: number;
}

export interface TrackMonth {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

export function listTracks(workspaceId: number): Track[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, name, color, icon, mode FROM tracks WHERE workspace_id = ? ORDER BY name"
    )
    .all(workspaceId) as Array<Omit<Track, "categoryIds">>;
  const members = db
    .prepare(
      "SELECT track_id, category_id FROM track_categories WHERE workspace_id = ?"
    )
    .all(workspaceId) as Array<{ track_id: number; category_id: number }>;
  return rows.map((r) => ({
    ...r,
    categoryIds: members
      .filter((m) => m.track_id === r.id)
      .map((m) => m.category_id),
  }));
}

export function createTrack(
  workspaceId: number,
  name: string,
  mode: TrackMode,
  color: string,
  categoryIds: number[]
): number {
  const db = getDb();
  return db.transaction(() => {
    const id = Number(
      db
        .prepare(
          "INSERT INTO tracks (workspace_id, name, mode, color) VALUES (?,?,?,?)"
        )
        .run(workspaceId, name, mode, color).lastInsertRowid
    );
    setTrackCategories(workspaceId, id, categoryIds);
    return id;
  })();
}

export function updateTrack(
  workspaceId: number,
  id: number,
  patch: { name?: string; mode?: TrackMode; color?: string }
): boolean {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of ["name", "mode", "color"] as const) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(patch[key]);
    }
  }
  if (sets.length === 0) return false;
  values.push(workspaceId, id);
  return (
    getDb()
      .prepare(
        `UPDATE tracks SET ${sets.join(", ")} WHERE workspace_id = ? AND id = ?`
      )
      .run(...values).changes === 1
  );
}

/**
 * Removing a track touches no transaction: membership rows cascade away and
 * the categories simply rejoin the everyday cash flow.
 */
export function deleteTrack(workspaceId: number, id: number): boolean {
  return (
    getDb()
      .prepare("DELETE FROM tracks WHERE workspace_id = ? AND id = ?")
      .run(workspaceId, id).changes === 1
  );
}

/**
 * Replace a track's membership. A category belongs to at most one track, so
 * claiming one another track holds moves it rather than failing - a conflict
 * error here is something the user could do nothing useful with.
 */
export function setTrackCategories(
  workspaceId: number,
  trackId: number,
  categoryIds: number[]
): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM track_categories WHERE track_id = ?").run(trackId);
    const claim = db.prepare(
      "DELETE FROM track_categories WHERE workspace_id = ? AND category_id = ?"
    );
    const insert = db.prepare(
      "INSERT INTO track_categories (track_id, category_id, workspace_id) VALUES (?,?,?)"
    );
    for (const categoryId of categoryIds) {
      claim.run(workspaceId, categoryId);
      insert.run(trackId, categoryId, workspaceId);
    }
  })();
}

// Dates are stored with mixed precision (some rows carry a time component),
// so the upper bound compares date-only - the same fix applied across the
// transaction queries.
const RANGE =
  "AND t.date >= ? AND substr(t.date,1,10) <= substr(?,1,10) AND t.kind <> 'transfer'";
const INCOME = "c.kind = 'income'";

export function trackSummaries(
  workspaceId: number,
  from: string,
  to: string
): TrackSummary[] {
  const totals = getDb()
    .prepare(
      `SELECT tc.track_id id,
         COALESCE(SUM(CASE WHEN ${INCOME} THEN ABS(t.charged_amount) ELSE 0 END),0) income,
         COALESCE(SUM(CASE WHEN ${INCOME} THEN 0 ELSE ABS(t.charged_amount) END),0) expenses,
         COUNT(t.id) transactionCount
       FROM track_categories tc
       JOIN categories c ON c.id = tc.category_id
       LEFT JOIN transactions t ON t.workspace_id = tc.workspace_id
         AND t.category_id = tc.category_id
         AND t.deleted_at IS NULL AND t.status = 'completed' ${RANGE}
       WHERE tc.workspace_id = ?
       GROUP BY tc.track_id`
    )
    .all(from, to, workspaceId) as Array<{
    id: number;
    income: number;
    expenses: number;
    transactionCount: number;
  }>;

  return listTracks(workspaceId).map((track) => {
    const row = totals.find((x) => x.id === track.id);
    const income = row?.income ?? 0;
    const expenses = row?.expenses ?? 0;
    return {
      ...track,
      income,
      expenses,
      net: income - expenses,
      transactionCount: row?.transactionCount ?? 0,
    };
  });
}

/** Month-by-month history for one track, quiet months filled with zeros. */
export function trackMonthlyHistory(
  workspaceId: number,
  trackId: number,
  from: string,
  to: string
): TrackMonth[] {
  const rows = getDb()
    .prepare(
      `SELECT substr(t.date,1,7) month,
         COALESCE(SUM(CASE WHEN ${INCOME} THEN ABS(t.charged_amount) ELSE 0 END),0) income,
         COALESCE(SUM(CASE WHEN ${INCOME} THEN 0 ELSE ABS(t.charged_amount) END),0) expenses
       FROM transactions t
       JOIN track_categories tc ON tc.workspace_id = t.workspace_id
         AND tc.category_id = t.category_id
       JOIN categories c ON c.id = t.category_id
       WHERE tc.track_id = ? AND t.workspace_id = ?
         AND t.deleted_at IS NULL AND t.status = 'completed' ${RANGE}
       GROUP BY month ORDER BY month`
    )
    .all(trackId, workspaceId, from, to) as Array<{
    month: string;
    income: number;
    expenses: number;
  }>;

  const out: TrackMonth[] = [];
  const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);
  while (cursor <= end) {
    const month = cursor.toISOString().slice(0, 7);
    const row = rows.find((r) => r.month === month);
    const income = row?.income ?? 0;
    const expenses = row?.expenses ?? 0;
    out.push({ month, income, expenses, net: income - expenses });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

/** Per-category totals inside a track, biggest contribution first. */
export function trackCategoryBreakdown(
  workspaceId: number,
  trackId: number,
  from: string,
  to: string
) {
  return getDb()
    .prepare(
      `SELECT c.id categoryId, c.name, c.color, c.kind,
         COALESCE(SUM(ABS(t.charged_amount)),0) total,
         COUNT(t.id) count
       FROM track_categories tc
       JOIN categories c ON c.id = tc.category_id
       LEFT JOIN transactions t ON t.workspace_id = tc.workspace_id
         AND t.category_id = tc.category_id
         AND t.deleted_at IS NULL AND t.status = 'completed' ${RANGE}
       WHERE tc.track_id = ? AND tc.workspace_id = ?
       GROUP BY c.id ORDER BY total DESC`
    )
    .all(from, to, trackId, workspaceId) as Array<{
    categoryId: number;
    name: string;
    color: string;
    kind: string;
    total: number;
    count: number;
  }>;
}

/** The individual movements behind a track, newest first. */
export function trackTransactions(
  workspaceId: number,
  trackId: number,
  from: string,
  to: string,
  limit = 500
) {
  return getDb()
    .prepare(
      `SELECT t.id, t.date, t.description, t.charged_amount amount,
         c.name categoryName, c.color categoryColor, c.kind
       FROM transactions t
       JOIN track_categories tc ON tc.workspace_id = t.workspace_id
         AND tc.category_id = t.category_id
       JOIN categories c ON c.id = t.category_id
       WHERE tc.track_id = ? AND t.workspace_id = ?
         AND t.deleted_at IS NULL AND t.status = 'completed' ${RANGE}
       ORDER BY t.date DESC, t.id DESC LIMIT ?`
    )
    .all(trackId, workspaceId, from, to, limit) as Array<{
    id: number;
    date: string;
    description: string;
    amount: number;
    categoryName: string;
    categoryColor: string;
    kind: string;
  }>;
}
