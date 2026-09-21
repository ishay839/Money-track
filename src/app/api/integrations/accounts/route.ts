import { NextResponse } from "next/server";
import {
  getAccountFilter,
  setAccountFilter,
} from "@/server/db/queries/bank-credentials";
import { getDb } from "@/server/db";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

/**
 * The accounts a connection has actually delivered, and which of them this
 * workspace imports.
 *
 * One login can expose several accounts - a personal and a business current
 * account, or several cards. The list comes from transactions already on disk
 * rather than from a fresh scrape, so opening this screen never costs a bank
 * login. An account that has never delivered a transaction simply is not
 * listed yet; syncing once makes it appear.
 */
export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const provider = new URL(request.url).searchParams.get("provider");
  if (!provider) {
    return NextResponse.json({ error: "חסר מזהה חיבור" }, { status: 400 });
  }

  const rows = getDb()
    .prepare(
      `SELECT account_number AS accountNumber,
              COUNT(*)        AS transactionCount,
              MIN(date)       AS firstSeen,
              MAX(date)       AS lastSeen
         FROM transactions
        WHERE workspace_id = ? AND provider = ? AND deleted_at IS NULL
        GROUP BY account_number
        ORDER BY transactionCount DESC`
    )
    .all(workspaceId, provider) as Array<{
    accountNumber: string;
    transactionCount: number;
    firstSeen: string;
    lastSeen: string;
  }>;

  return NextResponse.json({
    accounts: rows,
    // null means "import everything", which is the default.
    filter: getAccountFilter(workspaceId, provider),
  });
}

export async function PUT(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  let body: { provider?: unknown; accounts?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "גוף הבקשה אינו תקין" }, { status: 400 });
  }

  if (typeof body.provider !== "string" || !body.provider) {
    return NextResponse.json({ error: "חסר מזהה חיבור" }, { status: 400 });
  }

  // null clears the filter and goes back to importing every account.
  if (body.accounts === null || body.accounts === undefined) {
    setAccountFilter(workspaceId, body.provider, null);
    return NextResponse.json({ success: true, filter: null });
  }

  if (!Array.isArray(body.accounts)) {
    return NextResponse.json({ error: "רשימת החשבונות אינה תקינה" }, { status: 400 });
  }

  const accounts = body.accounts
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 50);

  // Saving an empty selection would quietly stop importing anything at all,
  // which is never what someone means by "none of these".
  if (accounts.length === 0) {
    return NextResponse.json(
      { error: "יש לבחור לפחות חשבון אחד, או לבטל את הסינון" },
      { status: 400 }
    );
  }

  setAccountFilter(workspaceId, body.provider, accounts);
  return NextResponse.json({ success: true, filter: accounts });
}
