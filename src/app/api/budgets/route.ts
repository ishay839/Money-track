import { NextResponse } from "next/server";
import {
  getAllBudgets,
  setBudget,
  deleteBudget,
} from "@/server/db/queries/budgets";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json(getAllBudgets(workspaceId));
}

export async function PUT(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = (await request.json()) as {
    categoryId: number;
    amount?: number | null;
  };

  if (!body.categoryId) {
    return NextResponse.json(
      { error: "חובה לבחור קטגוריה" },
      { status: 400 }
    );
  }

  if (body.amount == null) {
    deleteBudget(workspaceId, body.categoryId);
    return NextResponse.json({ success: true });
  }

  if (body.amount < 0) {
    return NextResponse.json(
      { error: "הסכום אינו יכול להיות שלילי" },
      { status: 400 }
    );
  }

  setBudget(workspaceId, body.categoryId, body.amount, false);
  return NextResponse.json({ success: true });
}
