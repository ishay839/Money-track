import { NextResponse } from "next/server";
import { bulkAssignCategory } from "@/server/db/queries/transactions";
import { getAllCategories } from "@/server/db/queries/categories";
import { recordMerchantCategory } from "@/server/lib/merchant-memory";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

interface Body {
  ids: number[];
  categoryId: number;
  /** Merchant description to remember, so future syncs categorise it directly. */
  remember?: string;
}

export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = (await request.json()) as Body;

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  if (!Number.isFinite(body.categoryId)) {
    return NextResponse.json({ error: "categoryId required" }, { status: 400 });
  }

  const ids = body.ids.filter((n) => Number.isFinite(n));
  const updated = bulkAssignCategory(workspaceId, ids, body.categoryId);

  if (body.remember) {
    const category = getAllCategories(workspaceId).find(
      (c) => c.id === body.categoryId
    );
    if (category && (category.kind === "expense" || category.kind === "income")) {
      recordMerchantCategory(
        workspaceId,
        body.remember,
        body.categoryId,
        category.kind,
        "user"
      );
    }
  }

  return NextResponse.json({ updated });
}
