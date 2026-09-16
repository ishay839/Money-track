import "server-only";
import { getDb } from "../index";

export const DEFAULT_INVESTMENT_NAME = "השקעה כללית";
export const LARGE_INVESTMENT_THRESHOLD = 15_000;

export function createInvestment(workspaceId: number, name: string, mode: string) {
  const db = getDb();
  return db.transaction(() => {
    const parent = (kind: string) => {
      const name = kind === 'income' ? 'הכנסות מהשקעות' : 'השקעות';
      db.prepare("INSERT OR IGNORE INTO categories(workspace_id,name,color,kind,budget_mode) VALUES(?, ?, '#0d9488', ?, 'tracking')").run(workspaceId, name, kind);
      return (db.prepare("SELECT id FROM categories WHERE workspace_id=? AND name=?").get(workspaceId, name) as {id:number}).id;
    };
    const category = (label: string, kind: string) => Number(db.prepare(
      "INSERT INTO categories(workspace_id,parent_id,name,color,kind,budget_mode) VALUES(?,?,?,'#0d9488',?,'tracking')"
    ).run(workspaceId, parent(kind), label, kind).lastInsertRowid);
    const capital = category(`${name} · הון`, "expense");
    const expense = category(`${name} · תשלומים`, "expense");
    const income = category(`${name} · תקבולים`, "income");
    return Number(db.prepare("INSERT INTO investments(workspace_id,name,mode,capital_category_id,expense_category_id,income_category_id) VALUES(?,?,?,?,?,?)")
      .run(workspaceId, name, mode, capital, expense, income).lastInsertRowid);
  })();
}

export function investmentSummary(workspaceId: number, from: string, to: string) {
  return getDb().prepare(`SELECT i.*,
    COALESCE(SUM(CASE WHEN t.category_id=i.capital_category_id THEN -t.charged_amount ELSE 0 END),0) capital,
    COALESCE(SUM(CASE WHEN t.category_id=i.expense_category_id THEN -t.charged_amount ELSE 0 END),0) expenses,
    COALESCE(SUM(CASE WHEN t.category_id=i.income_category_id THEN t.charged_amount ELSE 0 END),0) income,
    COUNT(t.id) transactionCount
    FROM investments i LEFT JOIN transactions t ON t.workspace_id=i.workspace_id
      AND t.category_id IN (i.capital_category_id,i.expense_category_id,i.income_category_id)
      AND t.date>=? AND t.date<? AND t.status='completed'
    WHERE i.workspace_id=? GROUP BY i.id ORDER BY i.name`).all(from, to, workspaceId);
}

export function getOrCreateDefaultInvestment(workspaceId: number): number {
  const db = getDb();
  const existing = db.prepare(
    "SELECT id FROM investments WHERE workspace_id=? AND name=?"
  ).get(workspaceId, DEFAULT_INVESTMENT_NAME) as { id: number } | undefined;
  if (existing) return existing.id;
  return createInvestment(workspaceId, DEFAULT_INVESTMENT_NAME, "excluded");
}

export function assignTransactionToDefaultInvestment(
  workspaceId: number,
  transactionId: number,
  role: "capital" | "expense" | "income" = "capital"
) {
  return assignTransactionToInvestment(
    workspaceId,
    transactionId,
    getOrCreateDefaultInvestment(workspaceId),
    role
  );
}

export function autoAssignLargeExpenses(
  workspaceId: number,
  threshold = LARGE_INVESTMENT_THRESHOLD
): number {
  const db = getDb();
  const eligible = db.prepare(`SELECT COUNT(*) count FROM transactions t
    WHERE t.workspace_id=? AND t.kind='expense' AND t.charged_amount < -?
      AND t.category_source IS NOT 'user'
      AND NOT EXISTS (SELECT 1 FROM investments i WHERE i.workspace_id=t.workspace_id
        AND t.category_id IN(i.capital_category_id,i.expense_category_id,i.income_category_id))`)
    .get(workspaceId, threshold) as { count: number };
  if (eligible.count === 0) return 0;

  const investmentId = getOrCreateDefaultInvestment(workspaceId);
  const investment = db.prepare(
    "SELECT capital_category_id capital FROM investments WHERE workspace_id=? AND id=?"
  ).get(workspaceId, investmentId) as { capital: number };
  const result = db.prepare(`UPDATE transactions SET category_id=?,category_source='ai',
    needs_review=0,review_reason=NULL,updated_at=datetime('now')
    WHERE workspace_id=? AND kind='expense' AND charged_amount < -?
      AND category_source IS NOT 'user'
      AND NOT EXISTS (SELECT 1 FROM investments i WHERE i.workspace_id=transactions.workspace_id
        AND transactions.category_id IN(i.capital_category_id,i.expense_category_id,i.income_category_id))`)
    .run(investment.capital, workspaceId, threshold);
  return result.changes;
}

export function assignTransactionToInvestment(
  workspaceId: number,
  transactionId: number,
  investmentId: number,
  role: "capital" | "expense" | "income"
) {
  const db = getDb();
  return db.transaction(() => {
    const investment = db.prepare(`SELECT capital_category_id capital, expense_category_id expense,
      income_category_id income FROM investments WHERE workspace_id=? AND id=?`)
      .get(workspaceId, investmentId) as {capital:number;expense:number;income:number}|undefined;
    if (!investment) return false;
    const categoryId = investment[role];
    const kind = role === "income" ? "income" : "expense";
    const result = db.prepare(`UPDATE transactions SET category_id=?,kind=?,category_source='user',
      needs_review=0,review_reason=NULL,updated_at=datetime('now') WHERE workspace_id=? AND id=?`)
      .run(categoryId,kind,workspaceId,transactionId);
    return result.changes === 1;
  })();
}
