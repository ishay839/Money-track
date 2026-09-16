import { NextResponse } from "next/server";
import { getTransactionsSummary } from "@/server/db/queries/transactions";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json(
      { error: "חובה לבחור תאריך התחלה ותאריך סיום" },
      { status: 400 }
    );
  }

  return NextResponse.json(getTransactionsSummary(workspaceId, from, to));
}
