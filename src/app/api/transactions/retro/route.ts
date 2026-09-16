import { NextResponse } from "next/server";
import { applyRetro, previewRetro } from "@/server/db/queries/merchant-retro";
import { getAllCategories } from "@/server/db/queries/categories";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { getTransactionContext } from "@/server/db/queries/transactions";

interface Body {
  description?: unknown;
  categoryId?: unknown;
  excludeId?: unknown;
  scope?: unknown;
}

function parse(body: Body, workspaceId: number) {
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  if (!description) return { error: "חסר תיאור התנועה" as const };

  const categoryId = Number(body.categoryId);
  if (!Number.isInteger(categoryId)) {
    return { error: "קטגוריה לא תקינה" as const };
  }
  if (!getAllCategories(workspaceId).some((c) => c.id === categoryId)) {
    return { error: "הקטגוריה לא נמצאה" as const };
  }

  const rawExclude = Number(body.excludeId);
  const excludeId = Number.isInteger(rawExclude) ? rawExclude : undefined;

  // The counterparty lives in the memo, and a rule created from a transfer
  // keys on it. Reading it from the transaction itself keeps preview, apply
  // and the rule in agreement without trusting the client to pass it.
  const memo =
    excludeId === undefined
      ? null
      : (getTransactionContext(workspaceId, excludeId)?.memo ?? null);

  return { description, categoryId, excludeId, memo };
}

/** POST previews what applying this rule to history would change. */
export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "גוף הבקשה אינו תקין" }, { status: 400 });
  }
  const parsed = parse(body, workspaceId);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  return NextResponse.json(
    previewRetro(
      workspaceId,
      parsed.description,
      parsed.categoryId,
      parsed.excludeId,
      parsed.memo
    )
  );
}

/** PUT actually applies it. */
export async function PUT(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "גוף הבקשה אינו תקין" }, { status: 400 });
  }
  const parsed = parse(body, workspaceId);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  if (body.scope !== "uncategorised" && body.scope !== "all") {
    return NextResponse.json({ error: "היקף לא תקין" }, { status: 400 });
  }

  return NextResponse.json(
    applyRetro(
      workspaceId,
      parsed.description,
      parsed.categoryId,
      body.scope,
      parsed.excludeId,
      parsed.memo
    )
  );
}
