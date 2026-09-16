"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ChevronRight, ChevronLeft, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { getInvestments, addInvestment, changeInvestmentMode, type Investment } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InvestmentsPage() {
  const [year,setYear]=useState(new Date().getFullYear());
  const [selected,setSelected]=useState<number|null>(null);
  const [adding,setAdding]=useState(false);
  const [name,setName]=useState("");
  const [mode,setMode]=useState<Investment["mode"]>("excluded");
  const [busy,setBusy]=useState(false);
  const qc=useQueryClient();
  const query=useQuery({queryKey:["investments",year],queryFn:()=>getInvestments(year)});
  const refresh=()=>qc.invalidateQueries();
  const save=async()=>{
    setBusy(true);
    try {await addInvestment(name,mode);setName("");setAdding(false);await refresh();}
    catch {toast.error("לא ניתן לשמור. ודאו שהשם אינו קיים כבר.");}
    finally {setBusy(false);}
  };
  const items=query.data?.items??[];
  const rows=(query.data?.transactions??[]).filter(t=>selected===null||t.investmentId===selected);
  const visible=items.filter(i=>selected===null||i.id===selected);
  const sum=(key:"capital"|"income"|"expenses")=>visible.reduce((n,i)=>n+i[key],0);
  return <>
    <PageHeader title="השקעות" actions={<Button onClick={()=>setAdding(v=>!v)}><Plus className="h-4 w-4"/>הוספת השקעה</Button>}/>
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select aria-label="סינון השקעה" className="h-11 max-w-full rounded-xl border border-border bg-card px-3 text-base font-semibold" value={selected??""} onChange={e=>setSelected(e.target.value?Number(e.target.value):null)}>
          <option value="">כל ההשקעות</option>{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <div className="inline-flex h-11 items-center gap-1 rounded-xl border border-border bg-card px-1"><Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" aria-label="שנה קודמת" onClick={()=>setYear(y=>y-1)}><ChevronRight/></Button><span className="min-w-16 text-center text-base font-bold tabular-nums">{year}</span><Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" aria-label="שנה הבאה" onClick={()=>setYear(y=>y+1)}><ChevronLeft/></Button></div>
      </div>
      {adding&&<form className="flex flex-wrap items-end gap-3 border-y py-4" onSubmit={e=>{e.preventDefault();void save();}}>
        <label className="grid gap-2 text-sm">שם ההשקעה<Input required maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="למשל דירה בחיפה או קורס השקעות"/></label>
        <label className="grid gap-2 text-sm">השפעה על השוטף<select value={mode} onChange={e=>setMode(e.target.value as Investment["mode"])} className="h-9 rounded-md border bg-background px-3"><option value="excluded">ללא השפעה על השוטף</option><option value="net_income">הצגת תזרים נטו כהכנסה</option></select></label>
        <Button disabled={busy||!name.trim()} type="submit">{busy?"שומר…":"שמירה"}</Button><Button type="button" variant="ghost" onClick={()=>setAdding(false)}>ביטול</Button>
      </form>}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[["הון שהועבר",sum("capital")],["תקבולים",sum("income")],["תשלומים",sum("expenses")],["תזרים נטו",sum("income")-sum("expenses")]].map(([label,value])=><div key={label} className="surface p-5"><div className="card-label">{label}</div><div className="metric-lg mt-2 break-words">{formatCurrency(Number(value))}</div></div>)}
      </div>
      {query.isLoading?<p>טוען השקעות…</p>:query.isError?<p role="alert">טעינת ההשקעות נכשלה. <button onClick={()=>query.refetch()}>ניסיון נוסף</button></p>:items.length===0?<p className="surface py-12 text-center text-base text-muted-foreground">עדיין לא הוגדרו השקעות.</p>:<div className="surface overflow-x-auto">
        <table className="w-full text-start text-[15px]"><thead><tr className="border-b border-border">{["השקעה","הון שהועבר","תזרים נטו","הצגה בשוטף"].map(h=><th key={h} className="px-4 py-3.5 text-start text-sm font-semibold text-muted-foreground">{h}</th>)}</tr></thead><tbody>
          {visible.map(i=><tr className="border-b border-border last:border-0 transition-colors hover:bg-accent/40" key={i.id}><td className="px-4 py-3.5"><button className="text-base font-semibold text-primary underline-offset-4 hover:underline" onClick={()=>setSelected(i.id)}>{i.name}</button><div className="mt-1 text-sm text-muted-foreground">{i.transactionCount} תנועות</div></td><td className="metric-sm whitespace-nowrap px-4 py-3.5">{formatCurrency(i.capital)}</td><td className="metric-sm whitespace-nowrap px-4 py-3.5">{formatCurrency(i.income-i.expenses)}</td><td className="px-4 py-3.5"><select aria-label={`הצגת ${i.name} בשוטף`} value={i.mode} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" onChange={async e=>{try {await changeInvestmentMode(i.id,e.target.value as Investment["mode"]);await refresh();}catch{toast.error("שמירת ההגדרה נכשלה");}}}><option value="excluded">מוחרג מהשוטף</option><option value="net_income">נטו כהכנסה</option></select></td></tr>)}
        </tbody></table>
      </div>}
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold tracking-tight">תנועות משויכות</h2><Link href="/transactions" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"><ArrowLeftRight className="h-4 w-4"/>שיוך תנועות</Link></div>
      <div className="surface overflow-x-auto"><table className="w-full text-[15px]"><thead><tr className="border-b border-border">{["תאריך","תיאור","השקעה","סוג","סכום"].map(h=><th key={h} className="px-4 py-3.5 text-start text-sm font-semibold text-muted-foreground">{h}</th>)}</tr></thead><tbody>{rows.map(t=><tr key={t.id} className="border-b border-border last:border-0 transition-colors hover:bg-accent/40"><td className="whitespace-nowrap px-4 py-3.5 text-sm text-muted-foreground">{formatDate(t.date)}</td><td className="px-4 py-3.5 font-medium">{t.description}</td><td className="px-4 py-3.5">{t.investmentName}</td><td className="px-4 py-3.5 text-sm text-muted-foreground">{{capital:"הון",expense:"תשלום",income:"תקבול"}[t.role]}</td><td className="metric-sm whitespace-nowrap px-4 py-3.5">{formatCurrency(t.amount)}</td></tr>)}</tbody></table>{rows.length===0&&<p className="py-8 text-center text-base text-muted-foreground">אין תנועות משויכות בתקופה זו.</p>}</div>
    </div>
  </>;
}
