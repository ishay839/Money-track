import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/server/db";
import type { BalanceProvider, BalanceReading, BalanceConnection, BalancePayload } from "@/lib/balances";
import { validateReadings } from "./parsers";

export function connection(workspaceId: number, id: number) {
  return getDb().prepare(`SELECT id, provider, name, owner, last_success lastSuccess, last_error lastError
    FROM balance_connections WHERE workspace_id=? AND id=?`).get(workspaceId,id) as BalanceConnection | undefined;
}
export function addConnection(workspaceId: number, provider: BalanceProvider, name: string, owner: string) {
  return Number(getDb().prepare("INSERT INTO balance_connections(workspace_id,provider,name,owner) VALUES(?,?,?,?)").run(workspaceId,provider,name,owner).lastInsertRowid);
}
export function saveReadings(workspaceId: number, id: number, readings: BalanceReading[]) {
  validateReadings(readings);
  const db = getDb(), batch = randomUUID(), observedAt = new Date().toISOString();
  db.transaction(() => {
    const entry = connection(workspaceId,id);
    if (!entry) throw new Error("החיבור לא נמצא");
    for (const r of readings) {
      const duplicate = db.prepare(`SELECT 1 FROM balance_snapshots s JOIN balance_connections c ON c.id=s.connection_id
        WHERE c.workspace_id=? AND c.provider=? AND c.owner=? AND c.id!=? AND s.account_key=?
        AND s.batch=(SELECT latest.batch FROM balance_snapshots latest WHERE latest.connection_id=c.id ORDER BY latest.id DESC LIMIT 1)`).get(workspaceId,entry.provider,entry.owner,id,r.key);
      if (duplicate) throw new Error("נמצאו חשבונות כפולים בחיבור אחר של אותו בעל חשבון");
    }
    const insert = db.prepare(`INSERT INTO balance_snapshots(connection_id,batch,observed_at,account_key,label,kind,amount,currency) VALUES(?,?,?,?,?,?,?,?)`);
    for (const r of readings) insert.run(id,batch,observedAt,r.key,r.label,r.kind,r.amount,r.currency);
    db.prepare("UPDATE balance_connections SET last_success=?,last_error=NULL WHERE id=? AND workspace_id=?").run(observedAt,id,workspaceId);
  })();
}
/**
 * Records current-account balances captured during a bank sync.
 *
 * Bank balances live in the same table as the portal ones so the balances
 * screen shows one net-worth picture rather than two. The connection row is
 * owned by the sync (keyed by bank_provider) and created on first use, so the
 * user never has to add a "connection" for a bank they already connected.
 *
 * Deliberately silent on failure: a balance is a bonus on top of a
 * transaction sync, and must never turn a successful sync into a failed one.
 */
export function saveBankBalances(
  workspaceId: number,
  bankProvider: string,
  displayName: string,
  readings: BalanceReading[]
): void {
  if (!readings.length) return;
  const db = getDb();
  try {
    validateReadings(readings);
    db.transaction(() => {
      const existing = db
        .prepare("SELECT id FROM balance_connections WHERE workspace_id=? AND bank_provider=?")
        .get(workspaceId, bankProvider) as { id: number } | undefined;
      const id = existing
        ? existing.id
        : Number(
            db
              .prepare(
                "INSERT INTO balance_connections(workspace_id,provider,name,owner,bank_provider) VALUES(?,?,?,?,?)"
              )
              .run(workspaceId, bankProvider, displayName, displayName, bankProvider)
              .lastInsertRowid
          );
      const batch = randomUUID();
      const observedAt = new Date().toISOString();
      const insert = db.prepare(
        "INSERT INTO balance_snapshots(connection_id,batch,observed_at,account_key,label,kind,amount,currency) VALUES(?,?,?,?,?,?,?,?)"
      );
      for (const r of readings) {
        insert.run(id, batch, observedAt, r.key, r.label, r.kind, r.amount, r.currency);
      }
      db.prepare(
        "UPDATE balance_connections SET last_success=?,last_error=NULL,name=? WHERE id=? AND workspace_id=?"
      ).run(observedAt, displayName, id, workspaceId);
    })();
  } catch (error) {
    console.error("[balances] failed to store bank balance:", error);
  }
}

export function getBalances(workspaceId: number): Omit<BalancePayload,"active"> {
  const db = getDb();
  const connections = db.prepare(`SELECT id,provider,name,owner,last_success lastSuccess,last_error lastError,
    bank_provider bankProvider,
    EXISTS(SELECT 1 FROM balance_auth a WHERE a.connection_id=balance_connections.id) hasSavedLogin
    FROM balance_connections WHERE workspace_id=? ORDER BY id`).all(workspaceId) as BalanceConnection[];
  const accounts = db.prepare(`SELECT s.account_key key,s.label,COALESCE(k.kind,s.kind) kind,s.amount,s.currency,
    c.id connectionId,c.name connectionName,c.owner,s.observed_at observedAt
    FROM balance_snapshots s JOIN balance_connections c ON c.id=s.connection_id
    LEFT JOIN balance_account_kinds k ON k.connection_id=c.id AND k.account_key=s.account_key
    WHERE c.workspace_id=? AND s.batch=(SELECT latest.batch FROM balance_snapshots latest
      WHERE latest.connection_id=c.id ORDER BY latest.id DESC LIMIT 1)
    ORDER BY c.id,s.label`).all(workspaceId) as BalancePayload["accounts"];
  const history = db.prepare(`SELECT s.account_key key,s.label,COALESCE(k.kind,s.kind) kind,s.amount,s.currency,
    c.id connectionId,s.observed_at observedAt FROM balance_snapshots s
    JOIN balance_connections c ON c.id=s.connection_id
    LEFT JOIN balance_account_kinds k ON k.connection_id=c.id AND k.account_key=s.account_key
    WHERE c.workspace_id=? ORDER BY s.id DESC LIMIT 2000`).all(workspaceId) as BalancePayload["history"];
  return {connections,accounts,history};
}
