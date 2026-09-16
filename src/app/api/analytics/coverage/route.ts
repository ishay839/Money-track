import { NextResponse } from "next/server";
import { getCoverageMatrix } from "@/server/db/queries/analytics";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const cells = getCoverageMatrix(workspaceId);

  const months = [...new Set(cells.map((c) => c.month))].sort().reverse();
  const providers = [...new Set(cells.map((c) => c.provider))].sort();

  return NextResponse.json({ cells, months, providers });
}
