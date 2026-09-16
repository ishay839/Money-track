import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { syncBalanceConnection, cancelSync } from "@/server/balances/sync";
export const runtime = "nodejs";
export const maxDuration = 420;
export async function POST(request: Request) {
  const ws = getWorkspaceIdFromRequest(request), body = await request.json().catch(()=>null);
  if (!body || !Number.isInteger(body.id) || body.openBrowser !== true) return NextResponse.json({error:"נדרש אישור לפתיחת חלון הזדהות"},{status:400});
  try {return NextResponse.json(await syncBalanceConnection(ws,body.id));}
  catch (error) {return NextResponse.json({error:error instanceof Error ? error.message : "החיבור נכשל"},{status:409});}
}
export async function DELETE(request: Request) {
  const ws = getWorkspaceIdFromRequest(request), body = await request.json().catch(()=>null);
  if (!body || !Number.isInteger(body.id)) return NextResponse.json({error:"חיבור לא תקין"},{status:400});
  return NextResponse.json({success:cancelSync(ws,body.id)});
}
