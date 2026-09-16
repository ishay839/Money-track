import { NextResponse } from "next/server";
import {
  updateTransactionCategory,
  setTransactionKind,
  setTransactionNeedsReview,
  setTransactionNote,
  setTransactionAmount,
  deleteTransaction,
  getTransactionContext,
} from "@/server/db/queries/transactions";
import {
  lookupMerchantCategory,
  recordMerchantCategory,
} from "@/server/lib/merchant-memory";
import { recordCorrection } from "@/server/db/queries/category-corrections";
import {
  createRule,
  listRules,
  updateRule,
} from "@/server/db/queries/category-rules";
import { counterpartyOf } from "@/lib/merchant-key";
import { getAllCategories } from "@/server/db/queries/categories";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const body = (await request.json()) as {
    categoryId: number;
    remember?: boolean;
  };

  if (!body.categoryId) {
    return NextResponse.json(
      { error: "חובה לבחור קטגוריה" },
      { status: 400 }
    );
  }

  const numericId = Number(id);

  const before = getTransactionContext(workspaceId, numericId);
  const selectedCategory = getAllCategories(workspaceId).find(c => c.id === body.categoryId);
  if (!before || !selectedCategory) {
    return NextResponse.json({error:"התנועה או הקטגוריה לא נמצאו"},{status:404});
  }
  updateTransactionCategory(workspaceId, numericId, body.categoryId, "user");
  setTransactionNeedsReview(workspaceId, numericId, false);

  let remembered = false;
  if (
    body.remember === true &&
    before &&
    (before.kind === "expense" || before.kind === "income")
  ) {
    const category = getAllCategories(workspaceId).find(
      (c) => c.id === body.categoryId
    );
    if (category && (category.kind === "expense" || category.kind === "income")) {
      recordMerchantCategory(
        workspaceId,
        before.description,
        body.categoryId,
        category.kind,
        "user"
      );
      const saved = lookupMerchantCategory(workspaceId, before.description);
      remembered =
        saved?.categoryId === body.categoryId && saved.kind === category.kind;
      // Merchant memory alone is invisible: the rules screen reads
      // category_rules, so a rule the user asked for must appear there too.
      ensureVisibleRule(workspaceId, before, body.categoryId);

      // If the user just overrode an AI-set category, log it as a correction
      // so the categorizer learns not to repeat the mistake on similar merchants.
      if (
        before.categorySource === "ai" &&
        before.categoryId != null &&
        before.categoryId !== body.categoryId
      ) {
        recordCorrection(
          workspaceId,
          before.description,
          before.categoryId,
          body.categoryId,
          category.kind
        );
      }
    }
  }

  return NextResponse.json({ success: true, remembered });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    kind?: unknown;
    approve?: unknown;
    remember?: unknown;
    note?: unknown;
    amount?: unknown;
  };

  const numericId = Number(id);

  if (Object.hasOwn(body, "note")) {
    if (body.note !== null && typeof body.note !== "string") {
      return NextResponse.json({ error: "ההערה אינה תקינה" }, { status: 400 });
    }
    const note = typeof body.note === "string" ? body.note.trim() : null;
    if (note && note.length > 500) {
      return NextResponse.json({ error: "ההערה ארוכה מדי" }, { status: 400 });
    }
    if (!getTransactionContext(workspaceId, numericId)) {
      return NextResponse.json({ error: "התנועה לא נמצאה" }, { status: 404 });
    }
    setTransactionNote(workspaceId, numericId, note || null);
    return NextResponse.json({ success: true });
  }

  if (Object.hasOwn(body, "amount")) {
    if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || Math.abs(body.amount) > 1e12) {
      return NextResponse.json({ error: "הסכום אינו תקין" }, { status: 400 });
    }
    if (!getTransactionContext(workspaceId, numericId)) {
      return NextResponse.json({ error: "התנועה לא נמצאה" }, { status: 404 });
    }
    setTransactionAmount(workspaceId, numericId, Math.round(body.amount * 100) / 100);
    return NextResponse.json({ success: true });
  }

  if (body.approve === true) {
    const ctx = getTransactionContext(workspaceId, numericId);
    if (!ctx) {
      return NextResponse.json({ error: "התנועה לא נמצאה" }, { status: 404 });
    }
    setTransactionNeedsReview(workspaceId, numericId, false);
    let remembered = false;
    if (
      body.remember === true &&
      ctx.categoryId != null &&
      (ctx.kind === "expense" || ctx.kind === "income")
    ) {
      const category = getAllCategories(workspaceId).find(
        (c) => c.id === ctx.categoryId
      );
      if (
        category &&
        (category.kind === "expense" || category.kind === "income")
      ) {
        recordMerchantCategory(
          workspaceId,
          ctx.description,
          ctx.categoryId,
          category.kind,
          "approved-ai"
        );
        const saved = lookupMerchantCategory(workspaceId, ctx.description);
        remembered =
          saved?.categoryId === ctx.categoryId && saved.kind === category.kind;
        ensureVisibleRule(workspaceId, ctx, ctx.categoryId);
      }
    }
    return NextResponse.json({ success: true, remembered });
  }

  if (
    body.kind !== "expense" &&
    body.kind !== "income" &&
    body.kind !== "transfer"
  ) {
    return NextResponse.json(
      { error: "סוג התנועה אינו תקין" },
      { status: 400 }
    );
  }

  setTransactionKind(workspaceId, numericId, body.kind);
  if (body.kind === "transfer") {
    setTransactionNeedsReview(workspaceId, numericId, false);
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || !getTransactionContext(workspaceId, numericId)) {
    return NextResponse.json({ error: "התנועה לא נמצאה" }, { status: 404 });
  }
  deleteTransaction(workspaceId, numericId);
  return NextResponse.json({ success: true });
}


/**
 * Mirrors "make it a rule" into category_rules - the table the rules screen
 * shows and the sync applies. Merchant memory remains the fast path for exact
 * repeats; this is the half the user can actually see and edit.
 *
 * A transfer is keyed on its counterparty, because its description names only
 * the channel ("העברה בBIT") and a rule on that would swallow every unrelated
 * transfer.
 */
function ensureVisibleRule(
  workspaceId: number,
  source: { description: string; memo?: string | null },
  categoryId: number
): void {
  const party = counterpartyOf(source.description, source.memo ?? null);
  const matchField = party ? "counterparty" : "description";
  const value = (party ?? source.description).trim();
  if (!value) return;

  const existing = listRules(workspaceId).find(
    (r) =>
      r.matchField === matchField &&
      r.matchType === "equals" &&
      (r.merchantValue ?? "").trim().toLowerCase() === value.toLowerCase()
  );

  if (existing) {
    // Re-categorising the same merchant should move the rule, not add a second.
    if (existing.categoryId !== categoryId) {
      updateRule(workspaceId, existing.id, { categoryId });
    }
    return;
  }

  createRule(workspaceId, {
    categoryId,
    matchType: "equals",
    matchField,
    merchantValue: value,
    note: "נוצר מסיווג תנועה",
  });
}
