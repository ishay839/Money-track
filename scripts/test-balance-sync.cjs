const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
function load(file, aliases) {
  const m = new Module(file);
  m.require = id => {
    if(id === 'server-only') return {};
    if(Object.hasOwn(aliases,id)) return aliases[id];
    throw new Error('Unexpected dependency: '+id);
  };
  m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
  return m.exports;
}
const types = load('src/lib/balances.ts',{});
const parsers = load('src/server/balances/parsers.ts',{'@/lib/balances':types});
let saved=[], errors=[], called=[], closed=0, badBalance=false, releaseLaunch;
let holdLaunch=false;
let auth={}, persisted=[], restored=[], authCalls=0, emitLogin=true, expectHeadless=false, rejectLogin=false;
const origin='https://sparkibi.ordernet.co.il';
const puppeteer = {launch:async options=>{
  assert.equal(options.headless,expectHeadless);
  assert.equal(options.userDataDir,undefined);
  if(holdLaunch) await new Promise(resolve=>{releaseLaunch=resolve;});
  const listeners={};
  const page={
    on:(name,handler)=>{listeners[name]=handler;},
    goto:async()=>{
      if(emitLogin) listeners.response({url:()=>origin+'/api/DataProvider/GetStaticData',ok:()=>true,request:()=>({headers:()=>({authorization:'Bearer synthetic-token-for-testing'})})});
    },
    url:()=>origin+'/', isClosed:()=>false,
    evaluate:async(_callback,args)=>{
      if(args.username) {authCalls++;assert.equal(args.password,'synthetic-password');return rejectLogin?'':'synthetic-token-for-testing';}
      if(args.token==='expired') throw new Error('Expired fixture');
      called.push(args.path);
      assert.equal(args.origin,origin);assert.equal(args.method,'GET');
      assert.equal(args.token,'synthetic-token-for-testing');
      if(args.path==='/api/DataProvider/GetStaticData') return [{b:'ACC',a:[{_k:'ACC_TEST-123',a:{b:123}},{_k:'ACC_TEST-456',a:{b:456}}]}];
      if(args.path.startsWith('/api/Account/GetAccountSecurities?')) return {a:{o:badBalance?null:100}};
      throw new Error('Unexpected network call');
    },
  };
  return {newPage:async()=>page,close:async()=>{closed++;},setCookie:async(...cookies)=>{restored.push(...cookies);},cookies:async()=>[{name:'session',value:'fixture',domain:'sparkibi.ordernet.co.il',expires:-1},{name:'tracker',value:'discard',domain:'other.example',expires:-1}]};
}};
const sync=load('src/server/balances/sync.ts',{
  puppeteer:{default:puppeteer},
  '@/lib/balances':types,
  '@/server/scrapers':{resolveBrowserExecutable:()=>undefined},
  '@/server/db':{getDb:()=>({transaction:fn=>fn,prepare:sql=>({run:(...args)=>{if(sql.includes('last_error')) errors.push(args);}})})},
  './auth':{readAuth:()=>auth,saveAuth:(ws,id,value)=>persisted.push({ws,id,value})},
  './store':{connection:(ws,id)=>ws===1&&id===1?{provider:'ibi'}:undefined,saveReadings:(ws,id,data)=>saved.push({ws,id,data})},
  './parsers':parsers,
});
(async()=>{
  assert.deepEqual(await sync.syncBalanceConnection(1,1),{count:2});
  assert.equal(saved.length,1);assert.equal(called.length,3);assert.equal(closed,1);
  assert.equal(sync.activeSync(1),null);
  badBalance=true;
  await assert.rejects(()=>sync.syncBalanceConnection(1,1));
  assert.equal(saved.length,1);assert.equal(errors.length,1);assert.equal(closed,2);
  holdLaunch=true;
  const running=sync.syncBalanceConnection(1,1);
  assert.equal(sync.activeSync(1).connectionId,1);assert.equal(sync.activeSync(2),null);
  await assert.rejects(()=>sync.syncBalanceConnection(1,1));
  assert.equal(sync.cancelSync(2,1),false);assert.equal(sync.cancelSync(1,1),true);
  releaseLaunch();
  await assert.rejects(()=>running);
  assert.equal(sync.activeSync(1),null);assert.equal(closed,3);assert.equal(saved.length,1);
  holdLaunch=false;badBalance=false;emitLogin=false;
  auth={token:'synthetic-token-for-testing',cookies:[{name:'session',value:'saved',domain:'sparkibi.ordernet.co.il',expires:-1},{name:'wrong',value:'discard',domain:'sparkmeitav.ordernet.co.il',expires:-1}]};
  await sync.syncBalanceConnection(1,1);
  assert.equal(restored.length,1);assert.equal(restored[0].value,'saved');
  assert.equal(persisted.at(-1).value.cookies.length,1);assert.equal(persisted.at(-1).value.token,'synthetic-token-for-testing');
  auth={token:'expired',credentials:{username:'fixture',password:'synthetic-password'}};
  await sync.syncBalanceConnection(1,1);
  assert.equal(authCalls,1);
  rejectLogin=true;expectHeadless=true;
  const countBefore=saved.length;
  await assert.rejects(()=>sync.syncBalanceConnection(1,1,false),/נדרשת הזדהות/);
  assert.equal(authCalls,2);assert.equal(saved.length,countBefore);assert.equal(sync.activeSync(1),null);
  console.log('PASS: read-only endpoint allowlist, isolated browser, complete multi-account batch, invalid balance preserves previous data');
  console.log('PASS: browser cleanup, single-run lock, workspace-scoped status/cancel, cancellation during launch');
  console.log('PASS: encrypted-session handoff, cookie tenant isolation, token restoration, one-shot saved login, unattended MFA failure preserves balances');
})().catch(error=>{console.error(error);process.exitCode=1;});
