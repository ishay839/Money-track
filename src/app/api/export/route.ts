import { getDb } from "@/server/db";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

interface ExportRow {
  date: string;
  description: string;
  memo: string | null;
  amount: number;
  currency: string | null;
  kind: string;
  category: string | null;
  provider: string;
  account: string;
  needsReview: number;
  note: string | null;
}

/** RFC-4180 quoting: wrap in quotes and double any quote inside. */
function csvCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where = ["t.workspace_id = ?", "t.deleted_at IS NULL"];
  const params: unknown[] = [workspaceId];
  if (from) {
    where.push("t.date >= ?");
    params.push(from);
  }
  if (to) {
    where.push("t.date <= ?");
    params.push(to);
  }

  const rows = getDb()
    .prepare(
      `SELECT substr(t.date, 1, 10) AS date,
              t.description AS description,
              t.memo AS memo,
              t.charged_amount AS amount,
              COALESCE(t.charged_currency, t.original_currency) AS currency,
              t.kind AS kind,
              c.name AS category,
              t.provider AS provider,
              t.account_number AS account,
              t.needs_review AS needsReview,
              t.user_note AS note
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
        WHERE ${where.join(" AND ")}
        ORDER BY t.date DESC`
    )
    .all(...params) as ExportRow[];

  const header = [
    "תאריך",
    "תיאור",
    "פירוט",
    "סכום",
    "מטבע",
    "סוג",
    "קטגוריה",
    "מקור",
    "חשבון",
    "דורש בדיקה",
    "הערה",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.date,
        r.description,
        r.memo,
        r.amount,
        r.currency,
        r.kind,
        r.category,
        r.provider,
        r.account,
        r.needsReview ? "כן" : "",
        r.note,
      ]
        .map(csvCell)
        .join(",")
    );
  }

  // BOM so Excel opens the Hebrew as UTF-8 instead of mojibake.
  const body = "﻿" + lines.join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="spent-${stamp}.csv"`,
    },
  });
}
