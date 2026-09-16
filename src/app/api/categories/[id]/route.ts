import { NextResponse } from "next/server";
import {
  categoryDeleteImpact,
  deleteCategory,
  renameCategory,
  setCategoryParent,
  updateCategoryBudgetMode,
  updateCategoryDescription,
} from "@/server/db/queries/categories";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

const MAX_DESCRIPTION_LENGTH = 500;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isFinite(categoryId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const typed = body as {
    budgetMode?: unknown;
    description?: unknown;
    parentId?: unknown;
    name?: unknown;
    renameMode?: unknown;
  };

  let applied = false;
  let newCategoryId: number | undefined;

  if (typed.name !== undefined) {
    if (typeof typed.name !== "string" || !typed.name.trim()) {
      return NextResponse.json(
        { error: "חובה להזין שם קטגוריה" },
        { status: 400 }
      );
    }
    if (typed.name.length > 60) {
      return NextResponse.json(
        { error: "שם הקטגוריה ארוך מדי" },
        { status: 400 }
      );
    }
    const mode = typed.renameMode === "forward" ? "forward" : "retro";
    const result = renameCategory(workspaceId, categoryId, typed.name, mode);
    if (!result.ok) {
      const message =
        result.reason === "duplicate"
          ? "כבר קיימת קטגוריה בשם הזה"
          : result.reason === "not-found"
            ? "הקטגוריה לא נמצאה"
            : "שם לא תקין";
      return NextResponse.json(
        { error: message },
        { status: result.reason === "not-found" ? 404 : 400 }
      );
    }
    newCategoryId = result.newCategoryId;
    applied = true;
  }

  if (typed.budgetMode !== undefined) {
    if (typed.budgetMode !== "budgeted" && typed.budgetMode !== "tracking") {
      return NextResponse.json(
        { error: "budgetMode must be 'budgeted' or 'tracking'" },
        { status: 400 }
      );
    }
    const ok = updateCategoryBudgetMode(workspaceId, categoryId, typed.budgetMode);
    if (!ok) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    applied = true;
  }

  if (typed.description !== undefined) {
    if (typed.description !== null && typeof typed.description !== "string") {
      return NextResponse.json(
        { error: "description must be a string or null" },
        { status: 400 }
      );
    }
    if (
      typeof typed.description === "string" &&
      typed.description.length > MAX_DESCRIPTION_LENGTH
    ) {
      return NextResponse.json(
        { error: `description must be ${MAX_DESCRIPTION_LENGTH} chars or fewer` },
        { status: 400 }
      );
    }
    const ok = updateCategoryDescription(
      workspaceId,
      categoryId,
      typed.description as string | null
    );
    if (!ok) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    applied = true;
  }

  if (typed.parentId !== undefined) {
    if (typed.parentId !== null && typeof typed.parentId !== "number") {
      return NextResponse.json(
        { error: "parentId must be a number or null" },
        { status: 400 }
      );
    }
    const result = setCategoryParent(
      workspaceId,
      categoryId,
      typed.parentId as number | null
    );
    if (!result.ok) {
      const status =
        result.reason === "not-found" || result.reason === "target-not-found"
          ? 404
          : 400;
      return NextResponse.json(
        { error: result.reason },
        { status }
      );
    }
    applied = true;
  }

  if (!applied) {
    return NextResponse.json(
      { error: "no recognized fields in body" },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, newCategoryId });
}

/** GET returns what deleting this category would affect. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId)) {
    return NextResponse.json({ error: "מזהה לא תקין" }, { status: 400 });
  }
  return NextResponse.json(categoryDeleteImpact(workspaceId, categoryId));
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId)) {
    return NextResponse.json({ error: "מזהה לא תקין" }, { status: 400 });
  }

  // An investment's three categories hold its accounting together; removing
  // one would leave the investment referencing a category that is gone.
  const impact = categoryDeleteImpact(workspaceId, categoryId);
  if (impact.isInvestment) {
    return NextResponse.json(
      { error: "הקטגוריה משמשת השקעה ולא ניתן למחוק אותה" },
      { status: 409 }
    );
  }

  const result = deleteCategory(workspaceId, categoryId);
  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "הקטגוריה לא נמצאה" }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: `יש להעביר או למחוק קודם את ${result.childCount} הקטגוריות שבתוך הקבוצה`,
      },
      { status: 409 }
    );
  }
  return NextResponse.json({ success: true, orphaned: result.orphaned });
}
