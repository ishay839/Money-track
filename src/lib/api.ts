import type {
  SetupStatus,
  AppSettings,
  TransactionWithCategory,
  DashboardSummary,
  Category,
  SyncRun,
  Budget,
  BudgetMode,
  Integration,
  Workspace,
  HomePayload,
  ActivitySnapshot,
} from "./types";
import { getActiveWorkspaceIdSync } from "./workspace-store";

const BASE = "";

export function getBalanceAccounts() {
  return fetchJSON<import("./balances").BalancePayload>("/api/balances");
}
export async function balanceAction(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>, sync = false) {
  const response = await fetch(`/api/balances${sync ? "/sync" : ""}`,withWorkspaceHeader({method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}));
  const result = await response.json().catch(()=>({error:"השרת לא זמין"}));
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "הפעולה נכשלה");
  return result as {id?:number; count?:number; success?:boolean};
}

export interface Investment {
  id: number; name: string; mode: "excluded" | "net_income";
  capital_category_id: number; expense_category_id: number; income_category_id: number;
  capital: number; expenses: number; income: number; transactionCount: number;
}
export interface InvestmentTransaction {
  id: number; date: string; description: string; amount: number;
  investmentId: number; investmentName: string; role: "capital" | "expense" | "income";
}
export function getInvestments(year = new Date().getFullYear()) {
  return fetchJSON<{items: Investment[]; transactions: InvestmentTransaction[]}>(`/api/investments?year=${year}`);
}
export function addInvestment(name: string, mode: Investment["mode"]) {
  return fetchJSON<{id:number}>("/api/investments", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,mode})});
}
export function changeInvestmentMode(id: number, mode: Investment["mode"]) {
  return fetchJSON<{success:boolean}>("/api/investments", {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,mode})});
}
export function assignTransactionToInvestment(transactionId: number, investmentId: number, role: "capital"|"expense"|"income") {
  return fetchJSON<{success:boolean}>("/api/investments", {method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({transactionId,investmentId,role})});
}
export function assignTransactionToDefaultInvestment(transactionId: number, role: "capital"|"expense"|"income" = "capital") {
  return fetchJSON<{success:boolean}>("/api/investments", {method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({transactionId,role,useDefault:true})});
}

export type TrackMode = "excluded" | "net_income" | "included";
export interface Track {
  id: number; name: string; color: string; icon: string | null; mode: TrackMode;
  categoryIds: number[];
  income: number; expenses: number; net: number; transactionCount: number;
}
export interface TrackMonth { month: string; income: number; expenses: number; net: number }
export interface TrackBreakdownRow {
  categoryId: number; name: string; color: string; kind: string; total: number; count: number;
}
export interface TrackTransaction {
  id: number; date: string; description: string; amount: number;
  categoryName: string; categoryColor: string; kind: string;
}
export function getTracks(year = new Date().getFullYear()) {
  return fetchJSON<{ tracks: Track[]; year: number }>(`/api/tracks?year=${year}`);
}
export function getTrack(id: number, year = new Date().getFullYear()) {
  return fetchJSON<{
    track: Track; history: TrackMonth[];
    breakdown: TrackBreakdownRow[]; transactions: TrackTransaction[];
  }>(`/api/tracks?id=${id}&year=${year}`);
}
const jsonInit = (method: string, body: unknown): RequestInit => ({
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
export function createTrack(input: {
  name: string; mode: TrackMode; color?: string; categoryIds: number[];
}) {
  return fetchJSON<{ id: number }>("/api/tracks", jsonInit("POST", input));
}
export function updateTrack(input: {
  id: number; name?: string; mode?: TrackMode; color?: string; categoryIds?: number[];
}) {
  return fetchJSON<{ success: boolean }>("/api/tracks", jsonInit("PATCH", input));
}
export function deleteTrack(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/tracks?id=${id}`, { method: "DELETE" });
}

/** Soft-delete many transactions in one request. */
export function bulkDeleteTransactions(ids: number[]) {
  return fetchJSON<{ deleted: number }>(
    "/api/transactions/bulk-delete",
    jsonInit("POST", { ids })
  );
}

export interface SmartAssignProposal {
  categoryId: number;
  categoryName: string;
  categoryColor: string;
  currentParentId: number | null;
  currentParentName: string | null;
  proposedParentId: number;
  proposedParentName: string;
}

/** Ask the AI where each category belongs. Returns proposals only. */
export function smartAssignCategories(input: {
  kind: CategoryKindFilter;
  scope: "unassigned" | "all";
}) {
  return fetchJSON<{
    proposals: SmartAssignProposal[];
    considered: number;
    groups?: string[];
  }>("/api/categories/smart-assign", jsonInit("POST", input));
}

/** Apply the subset of proposals the user approved. */
export function applySmartAssign(
  assignments: Array<{ categoryId: number; parentId: number }>
) {
  return fetchJSON<{
    applied: number;
    failed: Array<{ categoryId: number; reason: string }>;
  }>("/api/categories/smart-assign", jsonInit("PUT", { assignments }));
}

export interface GroupSpendRow {
  categoryId: number;
  name: string;
  color: string;
  total: number;
  transactionCount: number;
  previous: number;
  children: Array<{ categoryId: number; name: string; total: number }>;
}

/** Spend rolled up per top-level group, with the preceding period alongside. */
export function getGroupSpend(params: {
  from: string;
  to: string;
  months?: 1 | 12;
}) {
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
    months: String(params.months ?? 1),
  });
  return fetchJSON<{
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
    groups: GroupSpendRow[];
  }>(`/api/analytics/group-spend?${qs.toString()}`);
}

export type RuleMatchType = "contains" | "equals" | "starts";
/** Whether a rule reads the description or the transfer counterparty. */
export type RuleMatchField = "description" | "counterparty";

export interface CategoryRule {
  id: number;
  categoryId: number;
  categoryName: string;
  categoryColor: string;
  categoryKind: CategoryKindFilter;
  matchType: RuleMatchType;
  matchField: RuleMatchField;
  merchantValue: string | null;
  amountMin: number | null;
  amountMax: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  priority: number;
  enabled: boolean;
  hitCount: number;
  note: string | null;
}

export interface RuleDraft {
  categoryId: number;
  matchType?: RuleMatchType;
  matchField?: RuleMatchField;
  merchantValue?: string | null;
  amountMin?: number | null;
  amountMax?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  priority?: number;
  enabled?: boolean;
  note?: string | null;
}

/** All categorisation rules, or just one category's. */
export function getCategoryRules(categoryId?: number) {
  const qs = categoryId ? `?categoryId=${categoryId}` : "";
  return fetchJSON<{ rules: CategoryRule[] }>(`/api/categories/rules${qs}`);
}

export function createCategoryRule(input: RuleDraft) {
  return fetchJSON<{ id: number }>(
    "/api/categories/rules",
    jsonInit("POST", input)
  );
}

export function updateCategoryRule(input: Partial<RuleDraft> & { id: number }) {
  return fetchJSON<{ success: boolean }>(
    "/api/categories/rules",
    jsonInit("PATCH", input)
  );
}

export function deleteCategoryRule(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/categories/rules?id=${id}`, {
    method: "DELETE",
  });
}

/**
 * Run rules against existing transactions. Defaults to a dry run so the count
 * can be shown before anything is written.
 */
export function applyCategoryRules(input: {
  ruleId?: number;
  onlyUncategorised?: boolean;
  dryRun?: boolean;
}) {
  return fetchJSON<{
    matched: number;
    changed: number;
    samples: Array<{ description: string; categoryName: string }>;
  }>("/api/categories/rules", jsonInit("PUT", input));
}

export type HoldingSide = "asset" | "liability";

export interface ManualHolding {
  id: number;
  name: string;
  side: HoldingSide;
  category: string | null;
  amount: number;
  currency: string;
  note: string | null;
  asOf: string;
  updatedAt: string;
}

export interface NetWorth {
  trackedAssets: number;
  manualAssets: number;
  liabilities: number;
  net: number;
  trackedByKind: Array<{ kind: string; amount: number }>;
  holdings: ManualHolding[];
  otherCurrencies: Array<{ currency: string; assets: number; liabilities: number }>;
}

export interface HoldingDraft {
  name: string;
  side: HoldingSide;
  category?: string | null;
  amount: number;
  currency?: string;
  note?: string | null;
  asOf?: string;
}

/** The balance sheet: scraped balances plus manually tracked assets and debts. */
export function getNetWorth() {
  return fetchJSON<NetWorth>("/api/holdings");
}

export function getHoldingHistory(id: number) {
  return fetchJSON<{ history: Array<{ amount: number; asOf: string; recordedAt: string }> }>(
    `/api/holdings?historyFor=${id}`
  );
}

export function createHolding(input: HoldingDraft) {
  return fetchJSON<{ id: number }>("/api/holdings", jsonInit("POST", input));
}

export function updateHolding(input: Partial<HoldingDraft> & { id: number }) {
  return fetchJSON<{ success: boolean }>("/api/holdings", jsonInit("PATCH", input));
}

export function deleteHolding(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/holdings?id=${id}`, {
    method: "DELETE",
  });
}

function withWorkspaceHeader(init?: RequestInit): RequestInit {
  const wsId = getActiveWorkspaceIdSync();
  const headers = new Headers(init?.headers);
  if (wsId != null && !headers.has("x-workspace-id")) {
    headers.set("x-workspace-id", String(wsId));
  }
  return { ...init, headers };
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, withWorkspaceHeader(init));
  if (!res.ok) {
    const text = await res.text().catch(() => "Request failed");
    throw new Error(text);
  }
  return res.json() as Promise<T>;
}

export function listWorkspaces() {
  return fetchJSON<Workspace[]>("/api/workspaces");
}

export function createWorkspace(name: string) {
  return fetchJSON<Workspace>("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function renameWorkspace(id: number, name: string) {
  return fetchJSON<Workspace>(`/api/workspaces/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function deleteWorkspace(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/workspaces/${id}`, {
    method: "DELETE",
  });
}

export function getSetupStatus() {
  return fetchJSON<SetupStatus>("/api/setup/status");
}

export function saveBankCredentials(
  provider: string,
  credentials: Record<string, string>,
  options?: {
    requiresManualTwoFactor?: boolean;
    connectionKey?: string;
    createNew?: boolean;
  }
) {
  return fetchJSON<{ success: boolean; provider: string }>("/api/setup/bank", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      credentials,
      ...(options?.connectionKey ? { connectionKey: options.connectionKey } : {}),
      ...(options?.createNew ? { createNew: true } : {}),
      ...(options?.requiresManualTwoFactor !== undefined
        ? { requiresManualTwoFactor: options.requiresManualTwoFactor }
        : {}),
    }),
  });
}

export function updateIntegrationSettings(
  provider: string,
  updates: { requiresManualTwoFactor?: boolean; resetTwoFactorToken?: boolean }
) {
  return fetchJSON<{ success: boolean }>(`/api/integrations/${provider}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export function submitSyncOtp(syncRunId: number, code: string) {
  return fetchJSON<{ success: boolean }>("/api/sync/otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ syncRunId, code }),
  });
}

export function testBankConnection(provider: string) {
  return fetchJSON<{
    success: boolean;
    message: string;
    accountsFound?: number;
  }>("/api/setup/bank/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider }),
  });
}

export function saveAIConfig(config: {
  provider: "openai" | "claude" | "ollama" | "none";
  apiKey?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
}) {
  return fetchJSON<{ success: boolean }>("/api/setup/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
}

export function getSettings() {
  return fetchJSON<AppSettings>("/api/settings");
}

export function updateSettings(settings: Partial<AppSettings>) {
  return fetchJSON<AppSettings>("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
}

export type TransactionKindFilter = "expense" | "income" | "all";
export type TransactionKind = "expense" | "income" | "transfer";
export type CategoryKindFilter = "expense" | "income";

export interface TransactionsSummary {
  income: {
    total: number;
    count: number;
    largest: TransactionWithCategory | null;
  };
  expense: {
    total: number;
    count: number;
    largest: TransactionWithCategory | null;
  };
  net: number;
  topMerchants: { description: string; total: number; count: number }[];
  pendingReviewCount: number;
}

export function getTransactionsSummary(params: { from: string; to: string }) {
  const sp = new URLSearchParams({ from: params.from, to: params.to });
  return fetchJSON<TransactionsSummary>(`/api/transactions/summary?${sp}`);
}

export function getTransactions(params: {
  from?: string;
  to?: string;
  search?: string;
  category?: number;
  categoryIds?: number[];
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
  kind?: TransactionKindFilter;
  provider?: string;
  needsReview?: boolean;
  includeTransfers?: boolean;
  minAmount?: number;
  maxAmount?: number;
}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) return;
    if (key === "categoryIds" && Array.isArray(value)) {
      for (const id of value) searchParams.append("categoryIds", String(id));
      return;
    }
    searchParams.set(key, String(value));
  });
  return fetchJSON<{ transactions: TransactionWithCategory[]; total: number }>(
    `/api/transactions?${searchParams}`
  );
}

export function getLatestTransactionDate() {
  return fetchJSON<{ latestDate: string | null }>("/api/transactions/latest");
}

export function setTransactionKind(id: number, kind: TransactionKind) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind }),
  });
}

export function approveTransactionCategory(id: number, remember = false) {
  return fetchJSON<{ success: boolean; remembered: boolean }>(`/api/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approve: true, remember }),
  });
}

export function getSummary(params: {
  from: string;
  to: string;
  months?: number;
}) {
  const searchParams = new URLSearchParams({
    from: params.from,
    to: params.to,
  });
  if (params.months) searchParams.set("months", String(params.months));
  return fetchJSON<DashboardSummary>(`/api/summary?${searchParams}`);
}

export function getHome(mode: "month" | "year" = "month", anchor?: string) {
  const params = new URLSearchParams({ mode });
  if (anchor) params.set("anchor", anchor);
  return fetchJSON<HomePayload>(`/api/home?${params}`);
}

export function updateTransactionNote(id: number, note: string | null) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
}

export function updateTransactionAmount(id: number, amount: number) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
}

export function deleteTransaction(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}`, {
    method: "DELETE",
  });
}

export function getActivity() {
  return fetchJSON<ActivitySnapshot>(`/api/activity`);
}

export function getCategories(kind?: CategoryKindFilter) {
  const qs = kind ? `?kind=${kind}` : "";
  return fetchJSON<Category[]>(`/api/categories${qs}`);
}

export function updateTransactionCategory(
  id: number,
  categoryId: number,
  remember = false
) {
  return fetchJSON<{ success: boolean; remembered: boolean }>(`/api/transactions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId, remember }),
  });
}

export interface CategoryChildBreakdown {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  spent: number;
  budget: number;
  budgetMode: BudgetMode;
  isAutoBudget: boolean;
  percentSpent: number;
}

export interface CategoryDetail {
  category: {
    id: number;
    parentId: number | null;
    name: string;
    color: string;
    icon: string | null;
    kind: "expense" | "income";
    budgetMode: BudgetMode;
    isParent: boolean;
  };
  spent: number;
  budget: number;
  isAutoBudget: boolean;
  budgetSource: "own" | "rollup" | "leaf";
  vsTypical: { typical: number; percentDiff: number } | null;
  remaining: number;
  percentSpent: number;
  transactionCount: number;
  avgPerTransaction: number;
  vsLastMonth: number | null;
  prevSpent: number;
  prevPeriodLabel: string;
  dailySpend: Array<{ date: string; amount: number }>;
  topMerchants: Array<{ merchant: string; amount: number; count: number }>;
  transactions: TransactionWithCategory[];
  needsReviewTransactions: TransactionWithCategory[];
  needsReviewCount: number;
  period: { from: string; to: string };
  children: CategoryChildBreakdown[] | null;
}

export function getCategoryDetail(
  id: number,
  params: { from: string; to: string }
) {
  const sp = new URLSearchParams({ from: params.from, to: params.to });
  return fetchJSON<CategoryDetail>(`/api/categories/${id}/detail?${sp}`);
}

export function getBudgets() {
  return fetchJSON<Budget[]>("/api/budgets");
}

export function updateBudget(categoryId: number, amount: number | null) {
  return fetchJSON<{ success: boolean }>("/api/budgets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId, amount }),
  });
}

export function updateCategoryBudgetMode(
  categoryId: number,
  mode: BudgetMode
) {
  return fetchJSON<{ success: boolean }>(`/api/categories/${categoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ budgetMode: mode }),
  });
}

export function updateCategoryDescription(
  categoryId: number,
  description: string | null
) {
  return fetchJSON<{ success: boolean }>(`/api/categories/${categoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
}

export function setCategoryParent(
  categoryId: number,
  parentId: number | null
) {
  return fetchJSON<{ success: boolean }>(`/api/categories/${categoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentId }),
  });
}

export function createCategory(input: {
  name: string;
  kind: CategoryKindFilter;
  isParent?: boolean;
  icon?: string;
  description?: string | null;
}) {
  return fetchJSON<Category>("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function setBudgetModesBulk(budgetedIds: number[]) {
  return fetchJSON<{ success: boolean }>("/api/categories/budget-modes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ budgetedIds }),
  });
}

export function listIntegrations() {
  return fetchJSON<Integration[]>("/api/integrations");
}

export interface DeleteTransactionsResult {
  success: boolean;
  deleted: { txCount: number; syncCount: number; memoryCount: number };
}

export function deleteAllTransactions() {
  return fetchJSON<DeleteTransactionsResult>("/api/data/transactions", {
    method: "DELETE",
  });
}

export function deleteIntegration(provider: string) {
  return fetchJSON<{ success: boolean }>(`/api/integrations/${provider}`, {
    method: "DELETE",
  });
}

export interface ConnectionAccount {
  accountNumber: string;
  transactionCount: number;
  firstSeen: string;
  lastSeen: string;
}

/** Accounts this connection has delivered, and which of them are imported. */
export function getConnectionAccounts(provider: string) {
  return fetchJSON<{ accounts: ConnectionAccount[]; filter: string[] | null }>(
    `/api/integrations/accounts?provider=${encodeURIComponent(provider)}`
  );
}

/** `accounts: null` clears the filter and imports every account again. */
export function setConnectionAccounts(
  provider: string,
  accounts: string[] | null
) {
  return fetchJSON<{ success: boolean; filter: string[] | null }>(
    "/api/integrations/accounts",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, accounts }),
    }
  );
}

export function getIntegrationCredentials(provider: string) {
  return fetchJSON<{
    credentials: Record<string, string> | null;
    requiresManualTwoFactor: boolean;
    hasTwoFactorToken: boolean;
  }>(`/api/integrations/${provider}`);
}

export interface CategorizeAssignment {
  transactionId: number;
  description: string;
  categoryName: string;
  isNew: boolean;
  kind: CategoryKindFilter;
}

export interface CategorizeProposal {
  name: string;
  kind: CategoryKindFilter;
  transactionIds: number[];
  samples: string[];
}

export interface CategorizePreview {
  uncategorizedCount: number;
  assignments: CategorizeAssignment[];
  proposedCategories: CategorizeProposal[];
  existingCategoryUsage: Record<string, number>;
  errors?: string[];
}

export function previewCategorize() {
  return fetchJSON<CategorizePreview>("/api/categorize/preview", {
    method: "POST",
  });
}

export function applyCategorize(payload: {
  assignments: Array<{
    transactionId: number;
    categoryName: string;
    isNew: boolean;
    kind?: CategoryKindFilter;
  }>;
  approvedNewCategoryNames: string[];
  rejectionFallbacks?: Record<string, string>;
}) {
  return fetchJSON<{
    appliedCount: number;
    createdCategoriesCount: number;
    skippedCount: number;
  }>("/api/categorize/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export type SyncEventType =
  | "plan"
  | "provider-start"
  | "provider-done"
  | "provider-2fa-needed"
  | "provider-2fa-submitted"
  | "provider-2fa-manual"
  | "stage"
  | "complete"
  | "error";

export interface SyncProgressEvent {
  type: SyncEventType;
  data: Record<string, unknown>;
}

export function startSync(
  provider: string | undefined,
  onEvent: (event: SyncProgressEvent) => void
): { cancel: () => void } {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(
        "/api/sync",
        withWorkspaceHeader({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(provider ? { provider } : {}),
          signal: controller.signal,
        })
      );

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              onEvent({ type: currentEvent as SyncProgressEvent["type"], data });
            } catch {
              // skip malformed JSON
            }
            currentEvent = "";
          }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      onEvent({
        type: "error",
        data: { message: "Connection to sync service lost" },
      });
    }
  })();

  return { cancel: () => controller.abort() };
}

// Placeholder for last sync info
export function getLastSync() {
  return fetchJSON<SyncRun | null>("/api/sync/last").catch(() => null);
}

export interface PullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  speed?: number;
  etaSeconds?: number | null;
}

export interface PullEvent {
  type: "progress" | "complete" | "error";
  data: PullProgress & { message?: string };
}

export function listOllamaModels(url?: string) {
  const qs = url ? `?url=${encodeURIComponent(url)}` : "";
  return fetchJSON<{ models: string[]; error?: string }>(
    `/api/ai/ollama/models${qs}`
  );
}

export function pullOllamaModel(
  model: string,
  url: string | undefined,
  onEvent: (event: PullEvent) => void
): { cancel: () => void } {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(
        "/api/ai/ollama/pull",
        withWorkspaceHeader({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, url }),
          signal: controller.signal,
        })
      );

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              onEvent({ type: currentEvent as PullEvent["type"], data });
            } catch {
              // skip
            }
            currentEvent = "";
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      onEvent({
        type: "error",
        data: { status: "error", message: "Connection to pull endpoint lost" },
      });
    }
  })();

  return { cancel: () => controller.abort() };
}

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

export interface MonthPoint {
  month: string;
  amount: number;
  count: number;
}

export function getCategoryHistory(categoryId: number, months = 24) {
  return fetchJSON<{ history: MonthPoint[] }>(
    `/api/analytics/category-history?categoryId=${categoryId}&months=${months}`
  );
}

export interface CoverageCell {
  month: string;
  provider: string;
  count: number;
  expense: number;
}

export function getCoverage() {
  return fetchJSON<{
    cells: CoverageCell[];
    months: string[];
    providers: string[];
  }>("/api/analytics/coverage");
}

export interface RecurringCharge {
  description: string;
  months: number;
  count: number;
  avgAmount: number;
  minAmount: number;
  maxAmount: number;
  lastDate: string;
  lastAmount: number;
  spreadPercent: number;
  isFixed: boolean;
  daysSinceLast: number;
  isStale: boolean;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  driftPercent: number | null;
}

export function getRecurring(minMonths = 4) {
  return fetchJSON<{ items: RecurringCharge[] }>(
    `/api/analytics/recurring?minMonths=${minMonths}`
  );
}

export interface YearCategoryRow {
  categoryId: number;
  name: string;
  color: string;
  current: number;
  previous: number;
}

export function getYearCompare(year: number) {
  return fetchJSON<{
    year: number;
    current: MonthPoint[];
    previous: MonthPoint[];
    currentIncome: MonthPoint[];
    previousIncome: MonthPoint[];
    categories: YearCategoryRow[];
  }>(`/api/analytics/year-compare?year=${year}`);
}

export interface CumulativePoint {
  day: number;
  amount: number;
}

export function getCumulative(month: string) {
  return fetchJSON<{
    month: string;
    current: CumulativePoint[];
    previous: CumulativePoint[];
    previousLabel: string;
    earlier: CumulativePoint[];
    earlierLabel: string;
  }>(`/api/analytics/cumulative?month=${month}`);
}

export interface Outlier {
  id: number;
  date: string;
  description: string;
  amount: number;
  categoryName: string | null;
  typicalAmount: number;
  timesTypical: number;
}

export function getOutliers(multiple = 3) {
  return fetchJSON<{ items: Outlier[] }>(
    `/api/analytics/outliers?multiple=${multiple}`
  );
}

/** Assign one category to many transactions at once (a deliberate user action). */
export function bulkAssignCategory(
  ids: number[],
  categoryId: number,
  remember?: string
) {
  return fetchJSON<{ updated: number }>("/api/transactions/bulk-category", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, categoryId, remember }),
  });
}

/**
 * Rename a category. "retro" renames in place so every past transaction shows
 * the new name; "forward" keeps history under the old name and files future
 * transactions under a newly created category.
 */
export function renameCategory(
  id: number,
  name: string,
  renameMode: "retro" | "forward"
) {
  return fetchJSON<{ success: boolean; newCategoryId?: number }>(
    `/api/categories/${id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, renameMode }),
    }
  );
}

export interface IncomeCategoryRow {
  categoryId: number;
  name: string;
  color: string;
  icon: string | null;
  parentId: number | null;
  received: number;
  count: number;
  previous: number;
  topSource: string | null;
  activeMonths: number;
  lastDate: string | null;
}

export interface IncomeSource {
  description: string;
  total: number;
  count: number;
  categoryName: string | null;
  categoryColor: string | null;
  lastDate: string;
}

export interface IncomeSummary {
  period: { from: string; to: string };
  total: number;
  previousTotal: number;
  transactionCount: number;
  categories: IncomeCategoryRow[];
  sources: IncomeSource[];
  history: MonthPoint[];
  stability: Array<{ month: string; recurring: number; oneOff: number }>;
}

export function getIncomeSummary(params: { from: string; to: string }) {
  const sp = new URLSearchParams({ from: params.from, to: params.to });
  return fetchJSON<IncomeSummary>(`/api/analytics/income?${sp}`);
}

/** Monthly history for one income category (used by the drill-down sheet). */
export function getIncomeCategoryHistory(
  categoryId: number,
  params: { from: string; to: string }
) {
  const sp = new URLSearchParams({
    from: params.from,
    to: params.to,
    categoryId: String(categoryId),
  });
  return fetchJSON<{ history: MonthPoint[] }>(`/api/analytics/income?${sp}`);
}

/* ---------------------------- merchants ---------------------------- */

export interface MerchantMonthPoint {
  month: string;
  expense: number;
  income: number;
  count: number;
}

export interface MerchantCategorySlice {
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  amount: number;
  count: number;
}

export interface MerchantListRow {
  merchant: string;
  isCounterparty: boolean;
  expense: number;
  income: number;
  count: number;
  lastSeen: string;
}

export interface MerchantDetail {
  merchant: string;
  isCounterparty: boolean;
  year: number;
  expenseTotal: number;
  incomeTotal: number;
  net: number;
  count: number;
  firstSeen: string | null;
  lastSeen: string | null;
  monthlyAverage: number;
  activeMonths: number;
  lifetimeExpense: number;
  lifetimeIncome: number;
  lifetimeCount: number;
  months: MerchantMonthPoint[];
  categories: MerchantCategorySlice[];
  transactions: TransactionWithCategory[];
  availableYears: number[];
}

export function listMerchants(params: {
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
} = {}) {
  const sp = new URLSearchParams();
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  if (params.search) sp.set("search", params.search);
  if (params.limit) sp.set("limit", String(params.limit));
  const qs = sp.toString();
  return fetchJSON<{ items: MerchantListRow[] }>(
    `/api/merchants${qs ? `?${qs}` : ""}`
  );
}

/** Omitting the year lets the server open on the merchant's latest active year. */
export function getMerchantDetail(name: string, year?: number | null) {
  const sp = new URLSearchParams({ name });
  if (year != null) sp.set("year", String(year));
  return fetchJSON<MerchantDetail>(`/api/merchants?${sp}`);
}

/* --------------------- manual transaction entry -------------------- */

export interface ManualTransactionDraft {
  date: string;
  description: string;
  /** Magnitude; `kind` decides the stored sign. */
  amount: number;
  kind: "expense" | "income" | "transfer";
  categoryId?: number | null;
  note?: string | null;
}

export function createManualTransaction(draft: ManualTransactionDraft) {
  return fetchJSON<{ id: number; success: boolean }>("/api/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
}

/** What removing a category would affect, for the confirmation copy. */
export interface CategoryDeleteImpact {
  transactions: number;
  children: number;
  rules: number;
  isInvestment: boolean;
}

export function getCategoryDeleteImpact(id: number) {
  return fetchJSON<CategoryDeleteImpact>(`/api/categories/${id}`);
}

export function deleteCategory(id: number) {
  return fetchJSON<{ success: boolean; orphaned: number }>(
    `/api/categories/${id}`,
    { method: "DELETE" }
  );
}

/* ------------- applying a merchant rule to past transactions ------------- */

export interface RetroBucket {
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  count: number;
  total: number;
}

export interface RetroPreview {
  merchantKey: string;
  uncategorised: number;
  categorisedElsewhere: number;
  alreadyCorrect: number;
  buckets: RetroBucket[];
  oldest: string | null;
  newest: string | null;
}

export function previewRetroRule(input: {
  description: string;
  categoryId: number;
  excludeId?: number;
}) {
  return fetchJSON<RetroPreview>("/api/transactions/retro", jsonInit("POST", input));
}

export function applyRetroRule(input: {
  description: string;
  categoryId: number;
  excludeId?: number;
  scope: "uncategorised" | "all";
}) {
  return fetchJSON<{ updated: number }>(
    "/api/transactions/retro",
    jsonInit("PUT", input)
  );
}
