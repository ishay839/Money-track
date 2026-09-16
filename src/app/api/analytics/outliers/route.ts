import { NextResponse } from "next/server";
import { getOutliers } from "@/server/db/queries/analytics";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since") ?? defaultSince();
  const multiple = Number(searchParams.get("multiple") ?? 3);

  return NextResponse.json({
    items: getOutliers(workspaceId, since, multiple),
  });
}

function defaultSince(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
