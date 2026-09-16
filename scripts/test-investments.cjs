const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
// All fixtures and migrations run in an in-memory copy, never on personal data.
const source = new Database('data/spent.db', { readonly: true });
const db = new Database(':memory:');
db.pragma('foreign_keys = OFF');
for (const name of ['workspaces','categories','transactions']) {
  db.exec(source.prepare('SELECT sql FROM sqlite_master WHERE type=? AND name=?').get('table',name).sql);
}
source.close();
if (!db.prepare("SELECT name FROM sqlite_master WHERE name='investments'").get()) {
  db.exec(fs.readFileSync('src/server/db/migrations/023_investments.sql','utf8'));
}
db.pragma('foreign_keys = OFF');
const ws=987654;
const cat=(name,kind)=>Number(db.prepare("INSERT INTO categories(workspace_id,name,color,kind) VALUES(?,?,'#000000',?)").run(ws,name,kind).lastInsertRowid);
const capital=cat('test-capital','expense'), expense=cat('test-payments','expense'), income=cat('test-receipts','income');
const investment=Number(db.prepare("INSERT INTO investments(workspace_id,name,mode,capital_category_id,expense_category_id,income_category_id) VALUES(?,'test','net_income',?,?,?)").run(ws,capital,expense,income).lastInsertRowid);
const template={workspace_id:ws,account_number:'test',date:'2026-01-10',processed_date:'2026-01-10',original_amount:0,original_currency:'ILS',charged_amount:0,charged_currency:'ILS',description:'test',memo:null,type:'normal',status:'completed',identifier:null,installment_number:null,installment_total:null,category_id:null,category_source:'user',provider:'test',sync_run_id:1,dedup_hash:'',dedup_sequence:0,kind:'expense',needs_review:0,created_at:'2026-01-10',updated_at:'2026-01-10',ai_confidence:null,review_reason:null};
const cols=Object.keys(template);
const insert=db.prepare(`INSERT INTO transactions(${cols.join(',')}) VALUES(${cols.map(c=>'@'+c).join(',')})`);
let sequence=0;
const txn=(amount,category,date='2026-01-10',kind=amount>0?'income':'expense')=>Number(insert.run({...template,workspace_id:ws,date,processed_date:date,original_amount:amount,charged_amount:amount,category_id:category,kind,status:'completed',dedup_hash:'test-'+sequence++,dedup_sequence:0}).lastInsertRowid);
txn(-70000,capital); txn(6000,income); txn(-4000,expense); txn(-500,null);
const rows=()=>db.prepare('SELECT * FROM operating_transactions WHERE workspace_id=?').all(ws);
assert.equal(rows().length,2);
assert.equal(rows().find(t=>t.provider==='investment-net').charged_amount,2000);
assert.equal(rows().filter(t=>t.kind==='expense').reduce((n,t)=>n+Math.abs(t.charged_amount),0),500);
txn(-8000,expense,'2026-02-10');
assert.equal(rows().filter(t=>t.kind==='income').reduce((n,t)=>n+t.charged_amount,0),-6000);
db.prepare("UPDATE investments SET mode='excluded' WHERE id=?").run(investment);
assert.equal(rows().length,1);
const course=txn(-10000,expense);
assert.equal(rows().length,1);
db.prepare('UPDATE transactions SET category_id=NULL WHERE id=?').run(course);
assert.equal(rows().length,2);
txn(-20000,null,'2026-01-10','transfer');
assert.equal(rows().length,2);
assert.equal(db.prepare('SELECT COUNT(*) n FROM transactions WHERE workspace_id=?').get(ws).n,7);
const compiled=ts.transpileModule(fs.readFileSync('src/server/db/queries/investments.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const queryModule=new Module('investment-query-test');
queryModule.require=(id)=>{
  if(id==='server-only')return {};
  if(id==='../index')return {getDb:()=>db};
  throw new Error('Unexpected dependency: '+id);
};
queryModule._compile(compiled,'investment-query-test.js');
const {createInvestment,investmentSummary,assignTransactionToInvestment,assignTransactionToDefaultInvestment,autoAssignLargeExpenses}=queryModule.exports;
const created=createInvestment(ws,'Rental fixture','net_income');
assert.ok(created>0);
const countBefore=db.prepare('SELECT COUNT(*) n FROM categories').get().n;
assert.throws(()=>createInvestment(ws,'Rental fixture','excluded'));
assert.equal(db.prepare('SELECT COUNT(*) n FROM categories').get().n,countBefore);
const summary=investmentSummary(ws,'2026-01-01','2027-01-01');
assert.equal(summary.find(i=>i.id===investment).capital,70000);
assert.equal(summary.find(i=>i.id===investment).expenses,12000);
assert.equal(investmentSummary(ws+1,'2026-01-01','2027-01-01').length,0);
const pendingInvestmentTxn=txn(-12345,null,'2026-03-12','transfer');
db.prepare("UPDATE transactions SET needs_review=1,review_reason='test' WHERE id=?").run(pendingInvestmentTxn);
assert.equal(assignTransactionToInvestment(ws,pendingInvestmentTxn,investment,'capital'),true);
assert.deepEqual(
  db.prepare('SELECT category_id,kind,category_source,needs_review,review_reason FROM transactions WHERE id=?').get(pendingInvestmentTxn),
  {category_id:capital,kind:'expense',category_source:'user',needs_review:0,review_reason:null}
);
const pendingIncomeTxn=txn(4321,null,'2026-03-13','transfer');
assert.equal(assignTransactionToInvestment(ws,pendingIncomeTxn,investment,'income'),true);
assert.deepEqual(
  db.prepare('SELECT category_id,kind FROM transactions WHERE id=?').get(pendingIncomeTxn),
  {category_id:income,kind:'income'}
);
assert.equal(assignTransactionToInvestment(ws+1,pendingIncomeTxn,investment,'expense'),false);
const automaticLarge=txn(-15001,null,'2026-04-01','expense');
const thresholdEdge=txn(-15000,null,'2026-04-02','expense');
const manualLarge=txn(-25000,expense,'2026-04-03','expense');
db.prepare("UPDATE transactions SET category_source=NULL WHERE id IN (?,?)").run(automaticLarge,thresholdEdge);
assert.equal(autoAssignLargeExpenses(ws),1);
const defaultInvestment=db.prepare("SELECT * FROM investments WHERE workspace_id=? AND name='השקעה כללית'").get(ws);
assert.ok(defaultInvestment);
assert.equal(db.prepare('SELECT category_id FROM transactions WHERE id=?').get(automaticLarge).category_id,defaultInvestment.capital_category_id);
assert.equal(db.prepare('SELECT category_id FROM transactions WHERE id=?').get(thresholdEdge).category_id,null);
assert.equal(db.prepare('SELECT category_id FROM transactions WHERE id=?').get(manualLarge).category_id,expense);
const directDefault=txn(-9000,null,'2026-04-04','expense');
assert.equal(assignTransactionToDefaultInvestment(ws,directDefault,'capital'),true);
assert.equal(db.prepare('SELECT category_id FROM transactions WHERE id=?').get(directDefault).category_id,defaultInvestment.capital_category_id);
console.log('PASS: capital exclusion, rental net, monthly loss, mode change, course exclusion, reversible assignment, transfer exclusion, originals retained');
console.log('PASS: investment creation, direct/default assignment, >15000 auto assignment, duplicate rollback, summary totals, workspace isolation');
db.close();
