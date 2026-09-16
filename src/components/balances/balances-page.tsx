"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X, RefreshCw, AlertTriangle, KeyRound } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getBalanceAccounts, balanceAction } from "@/lib/api";
import { BALANCE_PROVIDERS, ASSET_KINDS, describeConnection, type BalanceProvider, type AssetKind } from "@/lib/balances";
import { useActiveWorkspaceId } from "@/lib/workspace-store";
import { BalanceSheet } from "./balance-sheet";

// Whole shekels only, matching the rest of the app - no agorot anywhere.
const money = (value: number, currency = "ILS") => new Intl.NumberFormat("he-IL",{style:"currency",currency,minimumFractionDigits:0,maximumFractionDigits:0}).format(Math.round(value));
const date = (value: string) => new Date(value).toLocaleString("he-IL",{dateStyle:"short",timeStyle:"short"});
const selectClass = "h-10 min-w-0 max-w-full rounded-md border bg-background px-3 text-sm";

function LoginFields({provider,value,onChange}:{provider:BalanceProvider;value:Record<string,string>;onChange:(value:Record<string,string>)=>void}) {
  const config = BALANCE_PROVIDERS[provider];
  if (config.adapter === "portal") return <div className="sm:col-span-2 lg:col-span-3 border-y py-3 text-sm text-muted-foreground">ההזדהות נעשית בחלון המאובטח של הגוף. אין צורך לשמור כאן סיסמה.</div>;
  const fields = BALANCE_PROVIDERS[provider].family === "broker"
    ? [["username","שם משתמש"],["password","סיסמה"]]
    : [["id","תעודת זהות"],["phone","טלפון נייד"]];
  return <fieldset className="grid gap-3 sm:col-span-2 lg:col-span-3 sm:grid-cols-2"><legend className="mb-3 text-sm font-medium">פרטי התחברות · שמירה מוצפנת במחשב</legend>{fields.map(([key,label])=><label key={key} className="grid gap-2 text-sm">{label}<Input maxLength={300} type={key==="password"?"password":"text"} autoComplete={key==="password"?"current-password":key==="username"?"username":"off"} value={value[key]??""} onChange={e=>onChange({...value,[key]:e.target.value})}/></label>)}</fieldset>;
}

export function BalancesPage() {
  const workspace = useActiveWorkspaceId();
  return <BalancesContent key={workspace} workspace={workspace}/>;
}
function BalancesContent({workspace}:{workspace:number|null}) {
  const [adding,setAdding] = useState(false), [name,setName] = useState(""), [owner,setOwner] = useState("");
  const [provider,setProvider] = useState<BalanceProvider>("excellence");
  const [credentials,setCredentials] = useState<Record<string,string>>({});
  const [editing,setEditing] = useState<number|null>(null);
  const [busy,setBusy] = useState(false), [starting,setStarting] = useState<number|null>(null);
  const [filter,setFilter] = useState<AssetKind|"all">("all");
  const [selected,setSelected] = useState("");
  const qc = useQueryClient(), queryKey = ["balances",workspace];
  const query = useQuery({queryKey,queryFn:getBalanceAccounts,refetchInterval:q=>q.state.data?.active || starting !== null ? 1500 : 30000});
  const data = query.data, active = data?.active;
  const accounts = data?.accounts ?? [], connections = data?.connections ?? [];
  const refresh = () => qc.invalidateQueries({queryKey});
  const act = async (method: "POST"|"PATCH"|"DELETE", body:Record<string,unknown>, sync = false) => {
    try {const result = await balanceAction(method,body,sync);await refresh();return result;}
    catch(error) {toast.error(error instanceof Error?error.message:"הפעולה נכשלה");await refresh();return null;}
  };
  const add = async () => {
    setBusy(true);
    try {if(await act("POST",{provider,name,owner,credentials})){setAdding(false);setName("");setCredentials({});}}
    finally {setBusy(false);}
  };
  const updateLogin = async () => {
    setBusy(true);
    try {if(await act("PATCH",{id:editing,action:"credentials",credentials})){setEditing(null);setCredentials({});}}
    finally {setBusy(false);}
  };
  const sync = async (id:number) => {
    setStarting(id);
    try {const result=await act("POST",{id,openBrowser:true},true);if(result) toast.success(`נמשכו ${result.count} יתרות`);}
    finally {setStarting(null);}
  };
  const shown = accounts.filter(a=>filter === "all" || a.kind === filter);
  const totals = new Map<string,number>();
  for (const account of shown) totals.set(account.currency,(totals.get(account.currency)??0)+account.amount);
  const selectedAccount = accounts.find(a=>`${a.connectionId}:${a.key}` === selected);
  const history = selectedAccount ? (data?.history??[]).filter(h=>h.connectionId===selectedAccount.connectionId && h.key===selectedAccount.key && h.currency===selectedAccount.currency).slice().reverse() : [];
  return <>
    <PageHeader title="יתרות וחסכונות" actions={<Button onClick={()=>{setEditing(null);setCredentials({});setAdding(v=>!v);}}><Plus className="h-4 w-4"/>הוספת חיבור</Button>}/>
    <main className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center gap-2 border-b pb-4 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4 shrink-0"/><span>קריאת יתרות בלבד · ללא פעולות מסחר. בחיבור דרך אזור אישי יש להשלים כניסה ולהמתין עד שמסך היתרות מוצג.</span></div>
      {adding && <form onSubmit={e=>{e.preventDefault();void add();}} className="grid gap-4 border-b pb-6 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-2 text-sm">הגוף המנהל<select className={selectClass} value={provider} onChange={e=>{setProvider(e.target.value as BalanceProvider);setCredentials({});}}><optgroup label="בתי השקעות ומסחר">{Object.entries(BALANCE_PROVIDERS).filter(([,p])=>p.family==="broker").map(([key,p])=><option key={key} value={key}>{p.name}</option>)}</optgroup><optgroup label="פנסיה, גמל והשתלמות">{Object.entries(BALANCE_PROVIDERS).filter(([,p])=>p.family==="pension").map(([key,p])=><option key={key} value={key}>{p.name}</option>)}</optgroup></select></label>
        <label className="grid gap-2 text-sm">בעל החשבון<Input required maxLength={80} value={owner} onChange={e=>setOwner(e.target.value)}/></label>
        <label className="grid gap-2 text-sm">שם החיבור<Input required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>
        <LoginFields provider={provider} value={credentials} onChange={setCredentials}/>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-3"><Button type="submit" disabled={busy||!name.trim()||!owner.trim()}>{busy?"שומר...":"שמירת חיבור"}</Button><Button variant="ghost" type="button" onClick={()=>{setAdding(false);setCredentials({});}}>ביטול</Button></div>
      </form>}
      {editing!==null&&<form onSubmit={e=>{e.preventDefault();void updateLogin();}} className="grid gap-4 border-b pb-6 sm:grid-cols-2 lg:grid-cols-3"><h2 className="font-semibold sm:col-span-2 lg:col-span-3">עדכון התחברות: {connections.find(c=>c.id===editing)?.name}</h2><LoginFields provider={provider} value={credentials} onChange={setCredentials}/><div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3"><Button type="submit" disabled={busy||!!active||!Object.values(credentials).some(Boolean)}>שמירת פרטי התחברות</Button><Button type="button" variant="outline" disabled={busy||!!active} onClick={async()=>{if(window.confirm("למחוק את פרטי ההתחברות וההזדהות השמורים? היתרות יישמרו.")){if(await act("PATCH",{id:editing,action:"forget"})){setEditing(null);setCredentials({});}}}}>מחיקת ההתחברות השמורה</Button><Button type="button" variant="ghost" onClick={()=>{setEditing(null);setCredentials({});}}>ביטול</Button></div></form>}
      {query.isLoading && <p role="status">טוען יתרות...</p>}
      {query.isError && <div role="alert" className="flex items-center gap-3">לא ניתן לטעון את היתרות<Button variant="outline" onClick={()=>query.refetch()}><RefreshCw className="h-4 w-4"/>ניסיון נוסף</Button></div>}
      <section className="space-y-4" aria-label="יתרות נוכחיות">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold tracking-tight">היתרות שנמשכו</h2><select aria-label="סוג חיסכון" className={selectClass} value={filter} onChange={e=>setFilter(e.target.value as AssetKind|"all")}><option value="all">כל סוגי החיסכון</option>{Object.entries(ASSET_KINDS).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></div>
        <div className="surface flex flex-wrap gap-8 p-6">{totals.size?[...totals].map(([currency,total])=><div key={currency}><div className="card-label">סך היתרות המוצגות</div><div className="metric-xl mt-2 break-words">{money(total,currency)}</div></div>):<span className="text-base text-muted-foreground">אין יתרות להצגה</span>}</div>
        {!!accounts.length&&<p className="text-sm text-muted-foreground">תאריך המשיכה מוצג לכל יתרה. תאריך הערכת השווי אצל הגוף לא נמסר.</p>}
        <div className="surface overflow-x-auto"><table className="w-full text-[15px]"><thead><tr className="border-b border-border">{["חשבון / קבוצת מוצרים","בעלים","סוג חיסכון","יתרה","נמשכה בתאריך"].map(h=><th key={h} className="px-4 py-3.5 text-start text-sm font-semibold text-muted-foreground">{h}</th>)}</tr></thead><tbody>{shown.map(a=><tr className="border-b border-border last:border-0 transition-colors hover:bg-accent/40" key={`${a.connectionId}:${a.key}`}>
          <td className="max-w-64 break-words px-4 py-3.5"><button className="text-start text-base font-semibold text-primary underline decoration-dotted underline-offset-4" onClick={()=>setSelected(`${a.connectionId}:${a.key}`)}>{a.label}</button><div className="mt-1 text-sm text-muted-foreground">{a.connectionName}</div></td><td className="p-3">{a.owner}</td>
          <td className="px-4 py-3.5"><select aria-label={`סוג החיסכון ${a.label}`} className={selectClass} value={a.kind} onChange={e=>void act("PATCH",{id:a.connectionId,key:a.key,kind:e.target.value})}>{Object.entries(ASSET_KINDS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></td>
          <td className="metric-sm whitespace-nowrap px-4 py-3.5">{money(a.amount,a.currency)}</td><td className="whitespace-nowrap px-4 py-3.5 text-sm text-muted-foreground">{date(a.observedAt)}</td>
        </tr>)}</tbody></table></div>
      </section>
      <BalanceSheet />
      <section className="space-y-4" aria-label="היסטוריית יתרות"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold tracking-tight">היסטוריית יתרות</h2><select aria-label="חשבון להיסטוריה" className={selectClass} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">בחירת חשבון</option>{accounts.map(a=><option key={`${a.connectionId}:${a.key}`} value={`${a.connectionId}:${a.key}`}>{a.owner} · {a.connectionName} · {a.label}</option>)}</select></div>
        {history.length>1&&selectedAccount&&<div className="surface h-72 min-w-0 w-full p-4" dir="ltr"><ResponsiveContainer width="100%" height="100%"><LineChart data={history} margin={{left:20,right:20,top:10,bottom:10}}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="observedAt" tickFormatter={v=>new Date(v).toLocaleDateString("he-IL")} minTickGap={40}/><YAxis width={85} tickFormatter={v=>new Intl.NumberFormat("he-IL",{notation:"compact"}).format(v)}/><Tooltip labelFormatter={v=>date(String(v))} formatter={v=>[money(Number(v),selectedAccount.currency),"יתרה"]}/><Line dataKey="amount" name="יתרה" stroke="var(--chart-1)" strokeWidth={2} dot isAnimationActive={false}/></LineChart></ResponsiveContainer></div>}
        {selectedAccount&&<div className="surface overflow-x-auto"><table className="w-full text-[15px]"><thead><tr className="border-b border-border"><th className="px-4 py-3.5 text-start text-sm font-semibold text-muted-foreground">תאריך משיכה</th><th className="px-4 py-3.5 text-start text-sm font-semibold text-muted-foreground">יתרה</th></tr></thead><tbody>{history.slice().reverse().map((h,i)=><tr className="border-b border-border last:border-0" key={`${h.observedAt}:${i}`}><td className="px-4 py-3.5">{date(h.observedAt)}</td><td className="metric-sm px-4 py-3.5">{money(h.amount,h.currency)}</td></tr>)}</tbody></table></div>}
      </section>
      <section className="space-y-3" aria-label="חיבורים">
        <h2 className="text-xl font-bold tracking-tight">החשבונות המחוברים</h2>
        {!query.isLoading && !query.isError && !connections.length && <p className="py-4 text-muted-foreground">טרם נוספו חיבורים לבתי השקעות ולחסכונות.</p>}
        {connections.map(c=>{const info=describeConnection(c);return <div key={c.id} className="surface flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0 flex-1 break-words"><h3 className="text-base font-bold">{c.owner && c.owner!==c.name?`${c.name} · ${c.owner}`:c.name}</h3><div className="mt-1 text-sm text-muted-foreground">{info.name} · {info.isBank?"נמשך יחד עם התנועות":info.adapter==="portal"?"כניסה באזור האישי":"חיבור ישיר"}</div><div className="mt-1 text-sm">{c.lastSuccess?`משיכה מוצלחת: ${date(c.lastSuccess)}`:"טרם נמשכו יתרות"}</div>
          <div className="mt-1 text-sm text-muted-foreground">{info.isBank?"יתרת העו\"ש מתעדכנת בכל סנכרון תנועות מהבנק":info.adapter==="portal"?(c.lastSuccess?"הזדהות מאובטחת נשמרה כאשר האתר מאפשר זאת":"ההזדהות תתבצע בחלון האתר"):(c.hasSavedLogin?"התחברות שמורה ומוצפנת במחשב":"טרם נשמרה התחברות")}</div>
          {c.lastError&&<p role="alert" className="mt-2 text-sm text-destructive">{c.lastError}</p>}
          {c.lastSuccess&&query.dataUpdatedAt-Date.parse(c.lastSuccess)>14*86400000&&<p className="mt-2 text-sm text-amber-700">היתרות לא רועננו יותר משבועיים</p>}
          {active?.connectionId===c.id&&<p role="status" className="mt-2 text-sm font-medium">{active.status}</p>}</div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {/* Bank rows are driven by the transaction sync, so they expose no
                sync or credential controls here - only removal. */}
            {!info.managedHere?null:active?.connectionId===c.id?<Button variant="outline" onClick={()=>void act("DELETE",{id:c.id},true)}><X className="h-4 w-4"/>ביטול החיבור</Button>:<Button variant="outline" title="סנכרון יתרות; חלון אימות ייפתח במחשב" disabled={!!active||starting!==null} onClick={()=>void sync(c.id)}><RefreshCw className="h-4 w-4"/>{starting===c.id?"מסנכרן...":"סנכרון יתרות"}</Button>}
            {info.managedHere&&info.adapter!=="portal"&&<Button variant="ghost" size="icon" title="עדכון פרטי התחברות" aria-label={`עדכון התחברות ${c.name}`} disabled={!!active||starting!==null} onClick={()=>{setAdding(false);setProvider(c.provider);setCredentials({});setEditing(c.id);}}><KeyRound className="h-4 w-4"/></Button>}
            <Button variant="ghost" size="icon" title="הסרת החיבור והיסטוריית היתרות" aria-label={`הסרת ${c.name}`} disabled={!!active||starting!==null} onClick={()=>{if(window.confirm(`להסיר את ${c.name} ואת היסטוריית היתרות שלו? תנועות ההוצאות לא יימחקו.`)) void act("DELETE",{id:c.id});}}><Trash2 className="h-4 w-4"/></Button>
          </div>
        </div>;})}
      </section>
    </main>
  </>;
}
