import { NextResponse } from "next/server";
import {
  queryTransactions,
  type TransactionKindFilter,
} from "@/server/db/queries/transactions";
import { createManualTransaction } from "@/server/db/queries/manual-transactions";
import { getAllCategories } from "@/server/db/queries/categories";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { listRules, matchRule } from "@/server/db/queries/category-rules";

/** Amount bounds are absolute values; anything unparseable is ignored. */
function parseAmount(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.abs(n) : undefined;
}

function parseKind(raw: string | null): TransactionKindFilter | undefined {
  if (raw === "expense" || raw === "income" || raw === "all") {
    return raw;
  }
  return undefined;
}

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);

  // Support multi-id filter ("?categoryIds=1&categoryIds=2") for parent
  // category drilldowns (parent expands to its children client-side).
  const categoryIds = searchParams
    .getAll("categoryIds")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));

  const result = queryTransactions(workspaceId, {
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    category: searchParams.has("category")
      ? Number(searchParams.get("category"))
      : undefined,
    categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
    sort: searchParams.get("sort") ?? undefined,
    order: (searchParams.get("order") as "asc" | "desc") ?? undefined,
    limit: searchParams.has("limit")
      ? Number(searchParams.get("limit"))
      : undefined,
    offset: searchParams.has("offset")
      ? Number(searchParams.get("offset"))
      : undefined,
    kind: parseKind(searchParams.get("kind")),
    provider: searchParams.get("provider") ?? undefined,
    needsReview: searchParams.get("needsReview") === "true" || undefined,
    includeTransfers: searchParams.get("includeTransfers") === "true" || undefined,
    minAmount: parseAmount(searchParams.get("minAmount")),
    maxAmount: parseAmount(searchParams.get("maxAmount")),
  });

  // Which rows a rule already covers, decided by the same matcher the sync
  // uses so the UI can never disagree with the rules screen. One rule list per
  // request; matchRule itself is pure.
  const rules = listRules(workspaceId).filter((r) => r.enabled);
  const byKind = {
    expense: rules.filter((r) => r.categoryKind === "expense"),
    income: rules.filter((r) => r.categoryKind === "income"),
  };
  const transactions = result.transactions.map((t) => {
    if (t.kind !== "expense" && t.kind !== "income") return t;
    const rule = matchRule(byKind[t.kind], t);
    // Only a rule that agrees with where the row actually sits counts as
    // covering it. One that points somewhere else has not been applied, so
    // "make it a rule" is still the useful action.
    return rule && rule.categoryId === t.categoryId
      ? { ...t, ruleId: rule.id }
      : t;
  });

  return NextResponse.json({ ...result, transactions });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Records a transaction the user entered by hand, e.g. a cash withdrawal. */
export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "גוף הבקשה אינו תקין" }, { status: 400 });
  }

  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  if (!description) {
    return NextResponse.json({ error: "יש להזין תיאור" }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) {
    return NextResponse.json({ error: "יש להזין סכום תקין" }, { status: 400 });
  }

  const kind = body.kind;
  if (kind !== "expense" && kind !== "income" && kind !== "transfer") {
    return NextResponse.json({ error: "סוג תנועה לא תקין" }, { status: 400 });
  }

  const date = typeof body.date === "string" ? body.date : "";
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(date))) {
    return NextResponse.json({ error: "תאריך לא תקין" }, { status: 400 });
  }

  let categoryId: number | null = null;
  if (body.categoryId != null) {
    const raw = Number(body.categoryId);
    if (!Number.isInteger(raw)) {
      return NextResponse.json({ error: "קטגוריה לא תקינה" }, { status: 400 });
    }
    // Verified against this workspace so a stale id cannot attach a row to
    // someone else's category.
    const exists = getAllCategories(workspaceId).some((c) => c.id === raw);
    if (!exists) {
      return NextResponse.json({ error: "הקטגוריה לא נמצאה" }, { status: 404 });
    }
    categoryId = raw;
  }

  const id = createManualTransaction(workspaceId, {
    date,
    description: description.slice(0, 200),
    amount,
    kind,
    categoryId,
    note: typeof body.note === "string" ? body.note.slice(0, 300) : null,
  });

  return NextResponse.json({ id, success: true });
}
