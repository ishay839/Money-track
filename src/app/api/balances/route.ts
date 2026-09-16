import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { getDb } from "@/server/db";
import { ASSET_KINDS, isBalanceProvider } from "@/lib/balances";
import { getBalances, addConnection, connection } from "@/server/balances/store";
import { activeSync } from "@/server/balances/sync";
import { saveAuth, validCredentials, forgetAuth } from "@/server/balances/auth";

export function GET(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  return NextResponse.json({...getBalances(ws),active:activeSync(ws)},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request: Request) {
  const ws = getWorkspaceIdFromRequest(request), body = await request.json().catch(()=>null);
  if (!body || !isBalanceProvider(body.provider) || typeof body.name !== "string" || !body.name.trim() || body.name.length > 80 || typeof body.owner !== "string" || !body.owner.trim() || body.owner.length > 80) return NextResponse.json({error:"יש להזין גוף, שם חיבור ובעל חשבון"},{status:400});
  if (body.credentials !== undefined && !validCredentials(body.credentials)) return NextResponse.json({error:"פרטי התחברות לא תקינים"},{status:400});
  const id = getDb().transaction(()=>{
    const id = addConnection(ws,body.provider,body.name.trim(),body.owner.trim());
    if (body.credentials && Object.values(body.credentials).some(Boolean)) saveAuth(ws,id,{credentials:body.credentials});
    return id;
  })();
  return NextResponse.json({id});
}
export async function PATCH(request: Request) {
  const ws = getWorkspaceIdFromRequest(request), body = await request.json().catch(()=>null);
  if (body && ["credentials","forget"].includes(body.action)) {
    if (!Number.isInteger(body.id) || !connection(ws,body.id)) return NextResponse.json({error:"החיבור לא נמצא"},{status:404});
    if (activeSync(ws)?.connectionId === body.id) return NextResponse.json({error:"יש לסיים את הסנכרון לפני שינוי ההתחברות"},{status:409});
    if (body.action === "forget") forgetAuth(ws,body.id);
    else {
      if (!validCredentials(body.credentials) || !Object.values(body.credentials).some(Boolean)) return NextResponse.json({error:"פרטי התחברות לא תקינים"},{status:400});
      // Replacing credentials invalidates cookies from the previous identity.
      saveAuth(ws,body.id,{credentials:body.credentials});
    }
    return NextResponse.json({success:true});
  }
  if (!body || !Number.isInteger(body.id) || typeof body.key !== "string" || typeof body.kind !== "string" || !Object.hasOwn(ASSET_KINDS,body.kind) || !connection(ws,body.id)) return NextResponse.json({error:"סיווג לא תקין"},{status:400});
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM balance_snapshots WHERE connection_id=? AND account_key=?").get(body.id,body.key)) return NextResponse.json({error:"החשבון לא נמצא"},{status:404});
  db.prepare("INSERT INTO balance_account_kinds(connection_id,account_key,kind) VALUES(?,?,?) ON CONFLICT(connection_id,account_key) DO UPDATE SET kind=excluded.kind").run(body.id,body.key,body.kind);
  return NextResponse.json({success:true});
}
export async function DELETE(request: Request) {
  const ws = getWorkspaceIdFromRequest(request), body = await request.json().catch(()=>null);
  if (!body || !Number.isInteger(body.id)) return NextResponse.json({error:"חיבור לא תקין"},{status:400});
  if (activeSync(ws)?.connectionId === body.id) return NextResponse.json({error:"יש לבטל את הסנכרון לפני הסרת החיבור"},{status:409});
  const result = getDb().prepare("DELETE FROM balance_connections WHERE id=? AND workspace_id=?").run(body.id,ws);
  return NextResponse.json({success:result.changes===1});
}
