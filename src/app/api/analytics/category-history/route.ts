import { NextResponse } from "next/server";
import { getCategoryMonthlyHistory } from "@/server/db/queries/analytics";
import { getAllCategories } from "@/server/db/queries/categories";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const categoryId = Number(searchParams.get("categoryId"));
  if (!Number.isFinite(categoryId)) {
    return NextResponse.json({ error: "invalid categoryId" }, { status: 400 });
  }
  const months = Math.min(48, Number(searchParams.get("months") ?? 24));

  const all = getAllCategories(workspaceId);
  const children = all.filter((c) => c.parentId === categoryId).map((c) => c.id);
  const ids = [categoryId, ...children];

  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  return NextResponse.json({
    history: getCategoryMonthlyHistory(workspaceId, ids, fmt(start), fmt(end)),
  });
}
