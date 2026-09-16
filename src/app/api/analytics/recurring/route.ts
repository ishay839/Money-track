import { NextResponse } from "next/server";
import { getRecurringCharges } from "@/server/db/queries/analytics";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since") ?? defaultSince();
  const minMonths = Number(searchParams.get("minMonths") ?? 4);

  return NextResponse.json({
    items: getRecurringCharges(workspaceId, since, minMonths),
  });
}

function defaultSince(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
