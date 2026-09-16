const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const ts=require('typescript');
const DB=require('better-sqlite3');
function load(file,aliases) {
  const m=new Module(file);
  m.require=id=>id==='server-only'?{}:Object.hasOwn(aliases,id)?aliases[id]:require(id);
  m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
  return m.exports;
}
const db=new DB(':memory:');db.pragma('foreign_keys=ON');
db.exec('CREATE TABLE workspaces(id INTEGER PRIMARY KEY); INSERT INTO workspaces VALUES(1),(2)');
for(const name of ['024_balances','025_balance_auth']) db.exec(fs.readFileSync('src/server/db/migrations/'+name+'.sql','utf8'));
db.prepare('INSERT INTO balance_connections(id,workspace_id,provider,name,owner) VALUES(1,1,?,?,?)').run('ibi','fixture','owner');
// Exercise the real bank encryption helper with an in-memory key file.
const files=new Map();
const encryption=load('src/server/lib/encryption.ts',{fs:{existsSync:p=>files.has(p),mkdirSync:()=>{},writeFileSync:(p,v)=>files.set(p,v),readFileSync:p=>files.get(p),statSync:()=>({mode:0o600})}});
const auth=load('src/server/balances/auth.ts',{
  '@/server/db':{getDb:()=>db},'@/server/lib/encryption':encryption,
  './store':{connection:(ws,id)=>db.prepare('SELECT id FROM balance_connections WHERE workspace_id=? AND id=?').get(ws,id)},
});
const fixture={credentials:{username:'synthetic-user',password:'synthetic-password'},token:'synthetic-token',cookies:[]};
auth.saveAuth(1,1,fixture);
const row=db.prepare('SELECT * FROM balance_auth').get();
assert.equal(row.encrypted.includes(Buffer.from('synthetic-password')),false);
assert.equal(row.encrypted.includes(Buffer.from('synthetic-token')),false);
assert.deepEqual(auth.readAuth(1,1),fixture);assert.deepEqual(auth.readAuth(2,1),{});
assert.throws(()=>auth.saveAuth(2,1,fixture));
auth.forgetAuth(2,1);assert.deepEqual(auth.readAuth(1,1),fixture);
auth.saveAuth(1,1,{credentials:{username:'replacement',password:'replacement'}});
assert.equal(auth.readAuth(1,1).token,undefined);
auth.forgetAuth(1,1);assert.deepEqual(auth.readAuth(1,1),{});
auth.saveAuth(1,1,fixture);
db.prepare('DELETE FROM balance_connections WHERE id=1').run();
assert.equal(db.prepare('SELECT count(*) n FROM balance_auth').get().n,0);
assert.equal(auth.validCredentials({password:'ok',unknown:'bad'}),false);
assert.equal(auth.validCredentials({password:123}),false);
db.close();console.log('PASS: real AES-GCM encryption, no plaintext secrets, scoped read/write/forget, credential replacement clears session, deletion cascade');
