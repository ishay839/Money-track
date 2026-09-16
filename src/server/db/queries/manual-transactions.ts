import "server-only";
import { randomUUID } from "node:crypto";

import { getDb } from "../index";
import { computeDedupHash } from "@/server/lib/dedup";

/** Rows the user typed in themselves, kept apart from anything scraped. */
export const MANUAL_PROVIDER = "manual";
const MANUAL_ACCOUNT = "manual-entry";

export interface ManualTransactionInput {
  date: string;
  description: string;
  /** Always a magnitude; `kind` decides the sign that gets stored. */
  amount: number;
  kind: "expense" | "income" | "transfer";
  categoryId?: number | null;
  note?: string | null;
}

/**
 * The sync run every manual entry is filed under.
 *
 * transactions.sync_run_id is NOT NULL because every row historically came
 * from a scrape. Manual rows reuse one per-workspace run rather than creating
 * a run each time, which would bloat the sync history the user reads.
 */
function manualSyncRunId(workspaceId: number): number {
  const db = getDb();
  const existing = db
    .prepare(
      "SELECT id FROM sync_runs WHERE workspace_id = ? AND provider = ? ORDER BY id LIMIT 1"
    )
    .get(workspaceId, MANUAL_PROVIDER) as { id: number } | undefined;
  if (existing) return existing.id;

  return Number(
    db
      .prepare(
        `INSERT INTO sync_runs
           (workspace_id, provider, started_at, completed_at, status, scrape_from_date)
         VALUES (?, ?, datetime('now'), datetime('now'), 'completed', date('now'))`
      )
      .run(workspaceId, MANUAL_PROVIDER).lastInsertRowid
  );
}

export function createManualTransaction(
  workspaceId: number,
  input: ManualTransactionInput
): number {
  const db = getDb();
  const magnitude = Math.abs(input.amount);
  // Expenses are stored negative, income positive - the convention the whole
  // ledger already follows.
  const signed = input.kind === "income" ? magnitude : -magnitude;

  // Two ₪200 cash withdrawals on the same day are genuinely two events, but
  // they hash identically and the unique index would silently merge them into
  // one. A per-entry token keeps each row distinct.
  const dedupHash = computeDedupHash({
    accountNumber: MANUAL_ACCOUNT,
    date: input.date,
    originalAmount: signed,
    originalCurrency: "ILS",
    description: input.description,
    identifier: `manual:${randomUUID()}`,
  });

  return db.transaction(() => {
    const syncRunId = manualSyncRunId(workspaceId);
    const id = Number(
      db
        .prepare(
          `INSERT INTO transactions (
             workspace_id, account_number, date, processed_date,
             original_amount, original_currency, charged_amount, charged_currency,
             description, memo, type, status, provider, sync_run_id,
             dedup_hash, dedup_sequence, kind, category_id, category_source,
             needs_review
           ) VALUES (
             ?, ?, ?, ?, ?, 'ILS', ?, 'ILS', ?, ?, 'normal', 'completed', ?, ?,
             ?, 0, ?, ?, ?, 0
           )`
        )
        .run(
          workspaceId,
          MANUAL_ACCOUNT,
          input.date,
          input.date,
          signed,
          signed,
          input.description.trim(),
          input.note?.trim() || null,
          MANUAL_PROVIDER,
          syncRunId,
          dedupHash,
          input.kind,
          input.categoryId ?? null,
          // A category the user picked themselves is never "AI-assigned".
          input.categoryId != null ? "user" : null
        ).lastInsertRowid
    );
    return id;
  })();
}
