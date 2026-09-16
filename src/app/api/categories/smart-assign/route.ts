import { NextResponse } from "next/server";
import { getAllCategories } from "@/server/db/queries/categories";
import { setCategoryParent } from "@/server/db/queries/categories";
import { createAIProvider } from "@/server/ai/factory";
import { ensureOllamaRunning } from "@/server/ai/ollama-manager";
import { getAppSettings } from "@/server/db/queries/settings";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import type { CategoryKind } from "@/lib/types";

interface Proposal {
  categoryId: number;
  categoryName: string;
  categoryColor: string;
  currentParentId: number | null;
  currentParentName: string | null;
  proposedParentId: number;
  proposedParentName: string;
}

/**
 * Proposes a parent group for leaf categories.
 *
 * The AI never writes anything here: POST returns proposals only, and a
 * separate PUT applies the subset the user approved. Grouping is a structural
 * change affecting every past transaction's rollup, so it is not something to
 * apply on a model's say-so.
 *
 * `scope: "unassigned"` looks only at leaves with no parent; `scope: "all"`
 * also re-examines already-grouped leaves and reports only genuine moves.
 */
export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);

  let body: { kind?: unknown; scope?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "גוף הבקשה אינו תקין" }, { status: 400 });
  }

  const kind: CategoryKind = body.kind === "income" ? "income" : "expense";
  const scope = body.scope === "all" ? "all" : "unassigned";

  const provider = createAIProvider();
  if (!provider) {
    return NextResponse.json(
      { error: "ספק הבינה המלאכותית אינו מוגדר. אפשר להגדיר אותו בהגדרות ← בינה מלאכותית." },
      { status: 400 }
    );
  }

  const settings = getAppSettings(workspaceId);
  if (settings.aiProvider === "ollama") {
    const status = await ensureOllamaRunning(settings.ollamaUrl);
    if (!status.ok) {
      return NextResponse.json(
        { error: status.error ?? "Ollama אינו זמין." },
        { status: 503 }
      );
    }
  }

  const all = getAllCategories(workspaceId, kind);
  const parentIds = new Set(
    all.map((c) => c.parentId).filter((id): id is number => id != null)
  );
  // A group is a top-level category that already has children under it.
  const groups = all.filter((c) => c.parentId == null && parentIds.has(c.id));
  if (groups.length === 0) {
    return NextResponse.json(
      { error: "אין קבוצות אב להשתמש בהן. צרו קודם קבוצה אחת לפחות." },
      { status: 400 }
    );
  }

  // Candidates are leaves: never a group itself (moving a group under another
  // would break the two-level rule the schema enforces).
  const candidates = all.filter(
    (c) =>
      !parentIds.has(c.id) &&
      (scope === "all" ? true : c.parentId == null)
  );
  if (candidates.length === 0) {
    return NextResponse.json({ proposals: [], considered: 0 });
  }

  const groupNames = groups.map((g) => g.name);
  const byName = new Map(groups.map((g) => [g.name.toLowerCase(), g]));

  // The provider interface is transaction-shaped, so each category is passed
  // as one "transaction" whose description is the category name, and the
  // groups play the part of the category list. That reuses the exact prompt,
  // schema and parsing each provider already implements.
  const mappings = await provider.categorize(
    candidates.map((c) => ({
      description: c.name,
      amount: 0,
      currency: "ILS",
      memo: c.description ?? null,
    })),
    groups.map((g) => ({
      name: g.name,
      description: g.description,
      parentName: null,
    })),
    { allowProposals: false }
  );

  const proposals: Proposal[] = [];
  for (const m of mappings) {
    const category = candidates[m.index];
    if (!category) continue;
    const target = byName.get(m.categoryName.trim().toLowerCase());
    if (!target) continue;
    // Not a move if it is already there, and never parent a thing to itself.
    if (target.id === category.id) continue;
    if (category.parentId === target.id) continue;

    const currentParent =
      category.parentId != null
        ? (all.find((c) => c.id === category.parentId) ?? null)
        : null;

    proposals.push({
      categoryId: category.id,
      categoryName: category.name,
      categoryColor: category.color,
      currentParentId: category.parentId,
      currentParentName: currentParent?.name ?? null,
      proposedParentId: target.id,
      proposedParentName: target.name,
    });
  }

  return NextResponse.json({
    proposals,
    considered: candidates.length,
    groups: groupNames,
  });
}

/** Applies only the assignments the user ticked in the proposal dialog. */
export async function PUT(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);

  let body: { assignments?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "גוף הבקשה אינו תקין" }, { status: 400 });
  }

  const raw = body.assignments;
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ error: "לא נבחרו שיוכים" }, { status: 400 });
  }

  let applied = 0;
  const failed: Array<{ categoryId: number; reason: string }> = [];
  for (const entry of raw) {
    const categoryId = (entry as { categoryId?: unknown }).categoryId;
    const parentId = (entry as { parentId?: unknown }).parentId;
    if (!Number.isInteger(categoryId) || !Number.isInteger(parentId)) continue;
    const result = setCategoryParent(
      workspaceId,
      categoryId as number,
      parentId as number
    );
    if (result.ok) applied += 1;
    else failed.push({ categoryId: categoryId as number, reason: result.reason });
  }

  return NextResponse.json({ applied, failed });
}
