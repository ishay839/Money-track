import "server-only";
import type { Cookie } from "puppeteer";
import { getDb } from "@/server/db";
import { encrypt, decrypt } from "@/server/lib/encryption";
import { connection } from "./store";

export interface BalanceAuth {
  credentials?: {username?:string; password?:string; id?:string; phone?:string};
  cookies?: Cookie[];
  token?: string;
}
export function readAuth(workspaceId: number, id: number): BalanceAuth {
  const row = getDb().prepare(`SELECT a.encrypted,a.iv,a.auth_tag authTag FROM balance_auth a
    JOIN balance_connections c ON c.id=a.connection_id WHERE c.workspace_id=? AND c.id=?`).get(workspaceId,id) as {encrypted:Buffer;iv:Buffer;authTag:Buffer}|undefined;
  return row ? JSON.parse(decrypt(row)) : {};
}
export function saveAuth(workspaceId: number, id: number, auth: BalanceAuth) {
  if (!connection(workspaceId,id)) throw new Error("החיבור לא נמצא");
  const data = encrypt(JSON.stringify(auth));
  getDb().prepare(`INSERT INTO balance_auth(connection_id,encrypted,iv,auth_tag) VALUES(?,?,?,?)
    ON CONFLICT(connection_id) DO UPDATE SET encrypted=excluded.encrypted,iv=excluded.iv,auth_tag=excluded.auth_tag`).run(id,data.encrypted,data.iv,data.authTag);
}
export function validCredentials(value: unknown): value is NonNullable<BalanceAuth["credentials"]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([key,v])=>["username","password","id","phone"].includes(key) && typeof v === "string" && v.length <= 300);
}
export function forgetAuth(workspaceId: number, id: number) {
  getDb().prepare(`DELETE FROM balance_auth WHERE connection_id IN
    (SELECT id FROM balance_connections WHERE workspace_id=? AND id=?)`).run(workspaceId,id);
}
