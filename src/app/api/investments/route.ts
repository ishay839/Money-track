import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { assignTransactionToDefaultInvestment, assignTransactionToInvestment, createInvestment, investmentSummary } from "@/server/db/queries/investments";
import { getDb } from "@/server/db";

export async function GET(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const year = Number(new URL(request.url).searchParams.get("year") ?? new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return NextResponse.json({error:"שנה לא תקינה"},{status:400});
  const from = `${year}-01-01`, to = `${year+1}-01-01`;
  const items = investmentSummary(ws, from, to);
  const transactions = getDb().prepare(`SELECT t.id,t.date,t.description,t.charged_amount amount,
    i.id investmentId,i.name investmentName,
    CASE t.category_id WHEN i.capital_category_id THEN 'capital' WHEN i.expense_category_id THEN 'expense' ELSE 'income' END role
    FROM transactions t JOIN investments i ON i.workspace_id=t.workspace_id
      AND t.category_id IN(i.capital_category_id,i.expense_category_id,i.income_category_id)
    WHERE t.workspace_id=? AND t.date>=? AND t.date<? ORDER BY t.date DESC,t.id DESC`).all(ws,from,to);
  return NextResponse.json({items,transactions});
}

export async function POST(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const body = await request.json().catch(()=>null);
  if (!body || typeof body.name!=="string" || !body.name.trim() || body.name.trim().length>80 || !["excluded","net_income"].includes(body.mode)) {
    return NextResponse.json({error:"יש להזין שם השקעה ואופן הצגה תקינים"},{status:400});
  }
  try { return NextResponse.json({id:createInvestment(ws,body.name.trim(),body.mode)}); }
  catch { return NextResponse.json({error:"לא ניתן ליצור השקעה. ייתכן שהשם כבר קיים."},{status:400}); }
}

export async function PATCH(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const body = await request.json().catch(()=>null);
  if (!body || !Number.isInteger(body.id) || !["excluded","net_income"].includes(body.mode)) return NextResponse.json({error:"הגדרה לא תקינה"},{status:400});
  const result = getDb().prepare("UPDATE investments SET mode=? WHERE workspace_id=? AND id=?").run(body.mode,ws,body.id);
  return NextResponse.json({success:result.changes===1});
}

export async function PUT(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const body = await request.json().catch(()=>null);
  if (!body || !Number.isInteger(body.transactionId) || !["capital","expense","income"].includes(body.role) || (body.useDefault !== true && !Number.isInteger(body.investmentId))) {
    return NextResponse.json({error:"שיוך ההשקעה אינו תקין"},{status:400});
  }
  const success = body.useDefault === true
    ? assignTransactionToDefaultInvestment(ws,body.transactionId,body.role)
    : assignTransactionToInvestment(ws,body.transactionId,body.investmentId,body.role);
  return success ? NextResponse.json({success:true}) : NextResponse.json({error:"התנועה או ההשקעה לא נמצאו"},{status:404});
}
