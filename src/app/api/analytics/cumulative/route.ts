import { NextResponse } from "next/server";
import { getCumulativeByDay } from "@/server/db/queries/analytics";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const month =
    searchParams.get("month") ??
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  // The two preceding months give the current one something to be read against.
  const [y, m] = month.split("-").map(Number);
  const prev = (back: number) => {
    const d = new Date(y, m - 1 - back, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  return NextResponse.json({
    month,
    current: getCumulativeByDay(workspaceId, month),
    previous: getCumulativeByDay(workspaceId, prev(1)),
    previousLabel: prev(1),
    earlier: getCumulativeByDay(workspaceId, prev(2)),
    earlierLabel: prev(2),
  });
}
