import { NextResponse } from "next/server";
import { getLatestTransactionDate } from "@/server/db/queries/transactions";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json({
    latestDate: getLatestTransactionDate(workspaceId),
  });
}
