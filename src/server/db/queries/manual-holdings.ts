import "server-only";
import { getDb } from "../index";

export type HoldingSide = "asset" | "liability";

export interface ManualHolding {
  id: number;
  name: string;
  side: HoldingSide;
  category: string | null;
  amount: number;
  currency: string;
  note: string | null;
  asOf: string;
  updatedAt: string;
}

export interface HoldingInput {
  name: string;
  side: HoldingSide;
  category?: string | null;
  amount: number;
  currency?: string;
  note?: string | null;
  asOf?: string;
}

const COLUMNS = `id, name, side, category, amount, currency, note,
  as_of AS asOf, updated_at AS updatedAt`;

export function listHoldings(workspaceId: number): ManualHolding[] {
  return getDb()
    .prepare(
      `SELECT ${COLUMNS} FROM manual_holdings WHERE workspace_id = ?
       ORDER BY side, category, name`
    )
    .all(workspaceId) as ManualHolding[];
}

export function createHolding(workspaceId: number, input: HoldingInput): number {
  const db = getDb();
  return db.transaction(() => {
    const id = Number(
      db
        .prepare(
          `INSERT INTO manual_holdings
             (workspace_id, name, side, category, amount, currency, note, as_of)
           VALUES (?,?,?,?,?,?,?,?)`
        )
        .run(
          workspaceId,
          input.name.trim(),
          input.side,
          input.category?.trim() || null,
          input.amount,
          (input.currency ?? "ILS").toUpperCase(),
          input.note?.trim() || null,
          input.asOf ?? new Date().toISOString().slice(0, 10)
        ).lastInsertRowid
    );
    db.prepare(
      "INSERT INTO manual_holding_history (holding_id, amount, as_of) VALUES (?,?,?)"
    ).run(id, input.amount, input.asOf ?? new Date().toISOString().slice(0, 10));
    return id;
  })();
}

/**
 * Updates a holding. A changed amount also appends to the history, so the
 * balance sheet can show how a mortgage has come down over time rather than
 * only where it stands today.
 */
export function updateHolding(
  workspaceId: number,
  id: number,
  patch: Partial<HoldingInput>
): boolean {
  const db = getDb();
  return db.transaction(() => {
    const current = db
      .prepare("SELECT amount, as_of AS asOf FROM manual_holdings WHERE workspace_id = ? AND id = ?")
      .get(workspaceId, id) as { amount: number; asOf: string } | undefined;
    if (!current) return false;

    const columns: Record<string, string> = {
      name: "name",
      side: "side",
      category: "category",
      amount: "amount",
      currency: "currency",
      note: "note",
      asOf: "as_of",
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(columns)) {
      const value = (patch as Record<string, unknown>)[key];
      if (value === undefined) continue;
      sets.push(`${column} = ?`);
      values.push(
        typeof value === "string" && key !== "asOf" ? value.trim() || null : value
      );
    }
    if (sets.length === 0) return false;
    sets.push("updated_at = datetime('now')");
    values.push(workspaceId, id);
    db.prepare(
      `UPDATE manual_holdings SET ${sets.join(", ")} WHERE workspace_id = ? AND id = ?`
    ).run(...values);

    if (patch.amount !== undefined && patch.amount !== current.amount) {
      db.prepare(
        "INSERT INTO manual_holding_history (holding_id, amount, as_of) VALUES (?,?,?)"
      ).run(id, patch.amount, patch.asOf ?? current.asOf);
    }
    return true;
  })();
}

export function deleteHolding(workspaceId: number, id: number): boolean {
  return (
    getDb()
      .prepare("DELETE FROM manual_holdings WHERE workspace_id = ? AND id = ?")
      .run(workspaceId, id).changes === 1
  );
}

export function holdingHistory(workspaceId: number, id: number) {
  return getDb()
    .prepare(
      `SELECT h.amount, h.as_of AS asOf, h.recorded_at AS recordedAt
         FROM manual_holding_history h
         JOIN manual_holdings m ON m.id = h.holding_id
        WHERE m.workspace_id = ? AND h.holding_id = ?
        ORDER BY h.as_of, h.id`
    )
    .all(workspaceId, id) as Array<{
    amount: number;
    asOf: string;
    recordedAt: string;
  }>;
}

export interface NetWorth {
  /** Balances pulled from banks, brokers and pension providers. */
  trackedAssets: number;
  /** Manually entered assets (property, car, anything not scrapeable). */
  manualAssets: number;
  /** Manually entered debts (mortgage, loans). */
  liabilities: number;
  net: number;
  trackedByKind: Array<{ kind: string; amount: number }>;
  holdings: ManualHolding[];
  /** Non-ILS holdings, reported separately rather than silently converted. */
  otherCurrencies: Array<{ currency: string; assets: number; liabilities: number }>;
}

/**
 * The whole picture: what the scrapers know plus what the user told us.
 *
 * Foreign-currency holdings are NOT converted into shekels - there is no rate
 * source in this app, and inventing one would make the headline figure a
 * guess. They are returned separately so the UI can show them as their own
 * line instead.
 */
export function getNetWorth(workspaceId: number): NetWorth {
  const db = getDb();

  // Latest snapshot per connection, matching the balances screen.
  const tracked = db
    .prepare(
      `SELECT COALESCE(k.kind, s.kind) AS kind, s.amount, s.currency
         FROM balance_snapshots s
         JOIN balance_connections c ON c.id = s.connection_id
    LEFT JOIN balance_account_kinds k
           ON k.connection_id = c.id AND k.account_key = s.account_key
        WHERE c.workspace_id = ?
          AND s.batch = (SELECT latest.batch FROM balance_snapshots latest
                          WHERE latest.connection_id = c.id
                          ORDER BY latest.id DESC LIMIT 1)`
    )
    .all(workspaceId) as Array<{ kind: string; amount: number; currency: string }>;

  const byKind = new Map<string, number>();
  let trackedAssets = 0;
  for (const row of tracked) {
    if (row.currency !== "ILS") continue;
    trackedAssets += row.amount;
    byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + row.amount);
  }

  const holdings = listHoldings(workspaceId);
  let manualAssets = 0;
  let liabilities = 0;
  const fx = new Map<string, { assets: number; liabilities: number }>();

  for (const h of holdings) {
    if (h.currency === "ILS") {
      if (h.side === "asset") manualAssets += h.amount;
      else liabilities += h.amount;
      continue;
    }
    const entry = fx.get(h.currency) ?? { assets: 0, liabilities: 0 };
    if (h.side === "asset") entry.assets += h.amount;
    else entry.liabilities += h.amount;
    fx.set(h.currency, entry);
  }

  // Foreign-currency tracked balances join the same separate bucket.
  for (const row of tracked) {
    if (row.currency === "ILS") continue;
    const entry = fx.get(row.currency) ?? { assets: 0, liabilities: 0 };
    entry.assets += row.amount;
    fx.set(row.currency, entry);
  }

  return {
    trackedAssets,
    manualAssets,
    liabilities,
    net: trackedAssets + manualAssets - liabilities,
    trackedByKind: [...byKind]
      .map(([kind, amount]) => ({ kind, amount }))
      .sort((a, b) => b.amount - a.amount),
    holdings,
    otherCurrencies: [...fx].map(([currency, v]) => ({ currency, ...v })),
  };
}
