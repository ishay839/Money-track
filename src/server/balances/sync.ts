import "server-only";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { BALANCE_PROVIDERS, type BalanceProvider, type BalanceReading } from "@/lib/balances";
import { resolveBrowserExecutable } from "@/server/scrapers";
import { getDb } from "@/server/db";
import { connection, saveReadings } from "./store";
import { amount, object, rows, parseGenericPortalText, parseMeitav, parseMenora, validateReadings } from "./parsers";
import { readAuth, saveAuth, type BalanceAuth } from "./auth";

type Active = {workspaceId:number; connectionId:number; status:string; controller:AbortController};
declare global { var _balanceSync: Active | undefined; }
export function activeSync(workspaceId: number) {
  const run = globalThis._balanceSync;
  return run?.workspaceId === workspaceId ? {connectionId:run.connectionId,status:run.status} : null;
}
export function cancelSync(workspaceId: number, id: number) {
  const run = globalThis._balanceSync;
  if (run?.workspaceId !== workspaceId || run.connectionId !== id) return false;
  run.controller.abort();
  return true;
}

async function portalJSON(page: Page, origin: string, path: string, token?: string, method = "GET"): Promise<unknown> {
  if (new URL(page.url()).origin !== origin) throw new Error("ממתין לכניסה לאזור האישי");
  return page.evaluate(async (args) => {
    if (location.origin !== args.origin) throw new Error("הדפדפן אינו באתר הגוף");
    const response = await fetch(args.origin + args.path, {
      method:args.method, credentials:"include", redirect:"error", signal:AbortSignal.timeout(12000),
      headers: args.token ? {Authorization:`Bearer ${args.token}`} : {},
    });
    if (!response.ok) throw new Error("המידע אינו זמין");
    return response.json();
  }, {origin,path,token,method});
}

async function readBroker(page: Page, origin: string, token: string): Promise<BalanceReading[]> {
  const data = rows(await portalJSON(page,origin,"/api/DataProvider/GetStaticData",token));
  const group = data.map(object).find(r=>r.b === "ACC");
  if (!group) throw new Error("לא התקבלו חשבונות מסחר");
  const readings: BalanceReading[] = [];
  for (const value of rows(group.a)) {
    const row = object(value), account = object(row.a);
    if (typeof row._k !== "string" || !row._k.startsWith("ACC_")) throw new Error("מזהה חשבון לא תקין");
    const detail = object(await portalJSON(page,origin,`/api/Account/GetAccountSecurities?accountKey=${encodeURIComponent(row._k)}`,token));
    readings.push({key:row._k,label:`חשבון מסחר ${String(account.b ?? row._k).slice(-6)}`,kind:"investment",amount:amount(object(detail.a).o),currency:"ILS"});
  }
  return validateReadings(readings);
}

async function readPortal(provider: BalanceProvider, page: Page, token: string) {
  const config = BALANCE_PROVIDERS[provider], origin = new URL(config.url).origin;
  if (config.adapter === "spark") {
    if (!token) throw new Error("ממתין להזדהות בספארק");
    return readBroker(page,origin,token);
  }
  if (config.adapter === "meitav") return parseMeitav(await portalJSON(page,origin,"/v2/api/AllAccounts/GetAllAmitAccounts"));
  if (config.adapter === "menora") return parseMenora(await portalJSON(page,origin,"/personal/dashboard/api/v1/customer-summary/active?counter=1",undefined,"POST"));
  const texts = await Promise.all(page.frames().map(frame=>frame.evaluate(()=>document.body?.innerText ?? "").catch(()=>"")));
  return parseGenericPortalText(texts.join("\n"),config.name);
}

async function savedLogin(page: Page, provider: BalanceProvider, auth: BalanceAuth): Promise<string> {
  const config = BALANCE_PROVIDERS[provider], origin = new URL(config.url).origin;
  if (new URL(page.url()).origin !== origin) return "";
  const credentials = auth.credentials;
  if (!credentials) return "";
  if (config.adapter === "spark" && credentials.username && credentials.password) {
    // This is the site's own login request, executed inside its browser session.
    // Attempt only once per sync; MFA or a rejected login is left to the user.
    return page.evaluate(async ({origin,username,password})=>{
      if (location.origin !== origin) return "";
      const response = await fetch(origin+"/api/Auth/Authenticate",{method:"POST",redirect:"error",credentials:"include",signal:AbortSignal.timeout(12000),headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});
      if (!response.ok) return "";
      const data = await response.json();
      return typeof data.l === "string" && data.l.length > 20 ? data.l : "";
    },{origin,username:credentials.username,password:credentials.password}).catch(()=>"");
  }
  if (config.adapter === "portal") return "";
  const fields = provider === "meitav"
    ? [["#id-identity-input",credentials.id],["[name=phoneNumber]",credentials.phone?.slice(-7)]]
    : [["#id-num",credentials.id],["#email-phone-num",credentials.phone]];
  for (const [selector,value] of fields) {
    if (!selector || !value) continue;
    const input = await page.$(selector);
    if (input) {
      await input.evaluate((element,args)=>{
        if (location.origin !== args.origin) return;
        const field = element as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
        setter?.call(field,args.value);
        field.dispatchEvent(new Event("input",{bubbles:true}));
        field.dispatchEvent(new Event("change",{bubbles:true}));
      },{value,origin});
      await input.dispose();
    }
  }
  if (provider === "meitav" && credentials.phone && new URL(page.url()).origin === origin) await page.select("select[name=prefixPhone]",credentials.phone.slice(0,3)).catch(()=>{});
  return "";
}

export async function syncBalanceConnection(workspaceId: number, id: number, interactive = true) {
  if (globalThis._balanceSync) throw new Error("כבר מתבצע חיבור. יש לסיים או לבטל אותו תחילה");
  const entry = connection(workspaceId,id);
  if (!entry) throw new Error("החיבור לא נמצא");
  const run: Active = {workspaceId,connectionId:id,status:"פותח חלון הזדהות",controller:new AbortController()};
  globalThis._balanceSync = run;
  let browser: Browser | undefined;
  let token = "";
  let loginAttempted = false;
  let failure = "הכניסה לא הושלמה או שלא התקבלו יתרות מזוהות. היתרות הקודמות נשמרו";
  const timer = setTimeout(()=>run.controller.abort(),interactive ? 6*60_000 : 90_000);
  const close = () => { void browser?.close().catch(()=>{}); };
  run.controller.signal.addEventListener("abort",close);
  try {
    const auth = readAuth(workspaceId,id);
    token = auth.token ?? "";
    getDb().prepare("UPDATE balance_connections SET last_attempt=? WHERE workspace_id=? AND id=?").run(new Date().toISOString(),workspaceId,id);
    // Browser profiles remain temporary; only scoped session data is persisted,
    // encrypted with the same local AES-GCM helper used by bank credentials.
    browser = await puppeteer.launch({headless:!interactive,executablePath:resolveBrowserExecutable(),defaultViewport:null,args:["--lang=he-IL","--window-size=1200,850"],timeout:30000});
    if (run.controller.signal.aborted) throw new Error("החיבור בוטל");
    const page = await browser.newPage();
    const config = BALANCE_PROVIDERS[entry.provider], origin = new URL(config.url).origin;
    const cookieHost = new URL(origin).hostname;
    const allowedCookie = (domain: string) => {
      const host = domain.replace(/^\./,"");
      // Broker sessions must never cross between tenants on ordernet.co.il.
      return config.adapter === "spark" ? host === cookieHost : host === cookieHost || host === cookieHost.replace(/^(www|customers)\./,"");
    };
    const cookies = (auth.cookies ?? []).filter(c=>allowedCookie(c.domain) && (c.expires < 0 || c.expires > Date.now()/1000));
    if (cookies.length) await browser.setCookie(...cookies);
    if (config.adapter === "spark") {
      page.on("response", response => {
        const url = new URL(response.url());
        if (url.origin !== origin) return;
        if (url.pathname === "/api/Auth/Authenticate" && response.ok()) {
          void response.json().then(value=>{
            const candidate = object(value).l;
            if (typeof candidate === "string" && candidate.length > 20) token = candidate;
          }).catch(()=>{});
        }
        if (url.pathname === "/api/DataProvider/GetStaticData") {
          const auth = response.request().headers().authorization;
          if (auth?.startsWith("Bearer ")) token = auth.slice(7);
        }
      });
    }
    await page.goto(config.url,{waitUntil:"domcontentloaded",timeout:60000});
    run.status = config.adapter === "portal" ? "יש להשלים כניסה בחלון שנפתח ולהגיע למסך היתרות" : "משחזר התחברות שמורה וקורא יתרות";
    while (!run.controller.signal.aborted && !page.isClosed()) {
      try {
        const readings = await readPortal(entry.provider,page,token);
        if (run.controller.signal.aborted) break;
        const cookies = (await browser.cookies()).filter(c=>allowedCookie(c.domain));
        getDb().transaction(()=>{
          saveReadings(workspaceId,id,readings);
          saveAuth(workspaceId,id,{credentials:auth.credentials,cookies,token});
        })();
        return {count:readings.length};
      } catch (error) {
        // Only our own parser errors are eligible for display, never remote
        // response bodies, browser URLs, or authentication error payloads.
        if (error instanceof Error && /תקופות לאותו חשבון|חשבונות כפולים|יתרה מספרית/.test(error.message)) {
          failure = error.message;
          break;
        }
        if (!loginAttempted) {
          loginAttempted = true;
          const renewed = await savedLogin(page,entry.provider,auth).catch(()=>"");
          if (renewed) { token = renewed; continue; }
        }
        if (!interactive) {
          failure = "נדרשת הזדהות נוספת. יש לפתוח סנכרון ידני ולהשלים את האימות";
          break;
        }
        run.status = config.adapter === "portal" ? "ממתין למסך שבו מוצגות היתרות" : "נדרשת הזדהות נוספת בחלון שנפתח";
      }
      await new Promise<void>(resolve=>{
        const done = () => {clearTimeout(wait);run.controller.signal.removeEventListener("abort",done);resolve();};
        const wait = setTimeout(done,4000);
        run.controller.signal.addEventListener("abort",done,{once:true});
        if (run.controller.signal.aborted) done();
      });
    }
    throw new Error(failure);
  } catch {
    if (run.controller.signal.aborted) failure = "החיבור בוטל או שפג זמן ההזדהות. היתרות הקודמות נשמרו";
    getDb().prepare("UPDATE balance_connections SET last_error=? WHERE workspace_id=? AND id=?").run(failure,workspaceId,id);
    throw new Error(failure);
  } finally {
    clearTimeout(timer);
    run.controller.signal.removeEventListener("abort",close);
    token = "";
    await browser?.close().catch(()=>{});
    if (globalThis._balanceSync === run) globalThis._balanceSync = undefined;
  }
}

export async function syncDueBalances() {
  const due = getDb().prepare(`SELECT c.id,c.workspace_id workspaceId FROM balance_connections c
    JOIN balance_auth a ON a.connection_id=c.id
    WHERE c.last_attempt IS NULL OR julianday('now')-julianday(c.last_attempt)>=14 ORDER BY c.id`).all() as {id:number;workspaceId:number}[];
  for (const entry of due) {
    if (globalThis._balanceSync) break;
    try { await syncBalanceConnection(entry.workspaceId,entry.id,false); }
    catch { /* The scoped connection status records the required user action. */ }
  }
}
