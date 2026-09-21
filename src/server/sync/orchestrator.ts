import "server-only";

import {
  getAccountFilter,
  getBankCredentials,
  getRequiresManualTwoFactor,
  listBankCredentials,
  updateCredentialField,
} from "@/server/db/queries/bank-credentials";
import { getAppSettings } from "@/server/db/queries/settings";
import {
  createSyncRun,
  completeSyncRun,
  failSyncRun,
} from "@/server/db/queries/sync-runs";
import {
  insertTransactions,
  getUncategorizedIdsByKind,
  getTransactionsForCategorization,
  batchUpdateCategories,
  batchSetNeedsReview,
} from "@/server/db/queries/transactions";
import { saveBankBalances } from "../balances/store";
import { bankDisplayName } from "@/lib/balances";
import {
  listRules,
  matchRule,
  incrementRuleHits,
} from "../db/queries/category-rules";
import {
  lookupMerchantCategoriesBulk,
  normalizeMerchant,
  incrementMerchantHits,
} from "@/server/lib/merchant-memory";
import { getAllCategories } from "@/server/db/queries/categories";
import { getRecentCorrections } from "@/server/db/queries/category-corrections";
import { scrapeBank } from "@/server/scrapers";
import {
  scrapeOneZeroFirstTime,
  scrapeOneZeroWithToken,
} from "@/server/scrapers/one-zero";
import { createAIProvider } from "@/server/ai/factory";
import { ensureOllamaRunning } from "@/server/ai/ollama-manager";
import { toLocalISODate } from "@/server/lib/date-utils";
import { listAllWorkspaceIds } from "@/server/lib/workspace-context";
import { getWorkspace } from "@/server/db/queries/workspaces";
import {
  decideReview,
  isPersonToPersonTransfer,
} from "@/server/lib/review-policy";
import { BANK_PROVIDERS, getBaseBankProvider, type BankProvider, type SyncKind } from "@/lib/types";
import {
  cancelOtpRequest,
  registerOtpRequest,
} from "@/server/sync/otp-bridge";
import {
  markSyncEnd,
  markSyncHeartbeat,
  markSyncStart,
} from "@/server/sync/activity";
import type { ScrapeResult } from "@/server/scrapers/types";
import { autoAssignLargeExpenses } from "@/server/db/queries/investments";

export type SyncEventSender = (
  event: string,
  data: Record<string, unknown>
) => void;

export interface ProviderResult {
  provider: string;
  ok: boolean;
  added: number;
  updated: number;
  errorMessage?: string;
  /**
   * Set of sync-run IDs that registered an OTP bridge during this sync.
   * Surfaces so the SSE route can cancel any leftover bridges on stream abort.
   */
  syncRunId?: number;
}

export interface WorkspaceSummary {
  workspaceId: number;
  workspaceName: string;
  providers: ProviderResult[];
  added: number;
  updated: number;
  categorized: number;
  aiWarning: string | null;
}

export function friendlyAIError(err: unknown, modelName: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/model.*not found|pull.*model|404/i.test(msg)) {
    return `Ollama model "${modelName}" is not installed. Run: ollama pull ${modelName}`;
  }
  if (/ECONNREFUSED|fetch failed/i.test(msg)) {
    return "Ollama is not reachable. Make sure it's installed and that no firewall is blocking port 11434.";
  }
  if (/Anthropic|api[_-]?key|401|403/i.test(msg)) {
    return "Claude API request was rejected. Check your API key in settings.";
  }
  return `AI categorization failed: ${msg}`;
}

function supportsProgrammaticTwoFactor(provider: BankProvider): boolean {
  return Boolean(
    BANK_PROVIDERS.find((b) => b.id === provider)?.supportsProgrammaticTwoFactor
  );
}

interface RunScrapeArgs {
  workspaceId: number;
  workspaceName: string;
  provider: BankProvider;
  providerKey: string;
  credentials: Record<string, string>;
  startDate: Date;
  syncRunId: number;
  manualTwoFactor: boolean;
  send: SyncEventSender;
}

async function runScrapeForProvider(args: RunScrapeArgs): Promise<ScrapeResult> {
  const {
    workspaceId,
    workspaceName,
    provider,
    providerKey,
    credentials,
    startDate,
    syncRunId,
    manualTwoFactor,
    send,
  } = args;

  if (supportsProgrammaticTwoFactor(provider)) {
    const existingToken = credentials.otpLongTermToken;
    if (existingToken) {
      return scrapeOneZeroWithToken({
        email: credentials.email,
        password: credentials.password,
        otpLongTermToken: existingToken,
        startDate,
      });
    }

    if (!credentials.email || !credentials.password) {
      return {
        success: false,
        accounts: [],
        errorMessage: "Email and password are required for One Zero.",
      };
    }
    if (!credentials.phoneNumber) {
      return {
        success: false,
        accounts: [],
        errorMessage:
          "Phone number is required to receive the One Zero 2FA code.",
      };
    }

    const bridge = registerOtpRequest(syncRunId, workspaceId, providerKey);

    const result = await scrapeOneZeroFirstTime({
      email: credentials.email,
      password: credentials.password,
      phoneNumber: credentials.phoneNumber,
      startDate,
      awaitOtp: async () => {
        send("provider-2fa-needed", {
          workspaceId,
          workspaceName,
          provider: providerKey,
          syncRunId,
        });
        return bridge.wait();
      },
      onOtpSubmitted: () => {
        send("provider-2fa-submitted", {
          workspaceId,
          workspaceName,
          provider: providerKey,
          syncRunId,
        });
      },
    });

    if (result.otpLongTermToken) {
      updateCredentialField(
        workspaceId,
        providerKey,
        "otpLongTermToken",
        result.otpLongTermToken
      );
    }

    return result;
  }

  if (manualTwoFactor) {
    send("provider-2fa-manual", {
      workspaceId,
      workspaceName,
      provider: providerKey,
    });
  }

  return scrapeBank(workspaceId, provider, credentials, startDate, {
    manualTwoFactor,
  });
}

async function syncOneProvider(
  workspaceId: number,
  workspaceName: string,
  providerKey: string,
  credentials: Record<string, string>,
  startDate: Date,
  send: SyncEventSender
): Promise<ProviderResult> {
  const provider = getBaseBankProvider(providerKey);
  const syncRunId = createSyncRun(workspaceId, providerKey, toLocalISODate(startDate));
  const manualTwoFactor = getRequiresManualTwoFactor(workspaceId, providerKey);

  let result: ScrapeResult;
  try {
    result = await runScrapeForProvider({
      workspaceId,
      workspaceName,
      provider,
      providerKey,
      credentials,
      startDate,
      syncRunId,
      manualTwoFactor,
      send,
    });
  } finally {
    // Defensive: ensure no bridge entry leaks if the scraper threw before
    // wait() was awaited or after it returned.
    cancelOtpRequest(syncRunId, "Scrape completed");
  }

  if (!result.success) {
    failSyncRun(syncRunId, result.errorMessage ?? "Scraping failed");
    return {
      provider: providerKey,
      ok: false,
      added: 0,
      updated: 0,
      errorMessage: result.errorMessage ?? "Scraping failed",
      syncRunId,
    };
  }

  // One login can expose several accounts - a personal and a business current
  // account under the same credentials, say. When this workspace has been told
  // which ones it owns, the rest are ignored so two workspaces sharing a login
  // do not each end up with both halves.
  const accountFilter = getAccountFilter(workspaceId, providerKey);
  const wanted = accountFilter
    ? result.accounts.filter((account) =>
        accountFilter.some(
          (allowed) =>
            allowed === account.accountNumber ||
            // Banks pad and format account numbers inconsistently between
            // screens, so a suffix match keeps "612729" working against
            // "12-677-612729" without matching an unrelated account.
            (allowed.length >= 4 && account.accountNumber.endsWith(allowed))
        )
      )
    : result.accounts;

  if (accountFilter && wanted.length === 0) {
    console.warn(
      `[sync] ${providerKey}: account filter matched none of ` +
        `${result.accounts.map((a) => a.accountNumber).join(", ")} - importing nothing`
    );
  }

  const allTransactions = wanted.flatMap((account) =>
    account.transactions.map((txn) => ({
      accountNumber: account.accountNumber,
      ...txn,
      installmentNumber: txn.installments?.number,
      installmentTotal: txn.installments?.total,
    }))
  );

  // Capture whatever balance the bank reported. Card issuers report none, so
  // this is a no-op for them. A foreign-currency account arrives as its own
  // account with its own currency, so it lands as a separate reading.
  const balanceReadings = wanted
    .filter((account) => typeof account.balance === "number")
    .map((account) => ({
      key: account.accountNumber,
      label: account.currency && account.currency !== "ILS"
        ? `עו"ש ${account.currency} ${account.accountNumber.slice(-4)}`
        : `עו"ש ${account.accountNumber.slice(-4)}`,
      kind: "checking" as const,
      amount: account.balance as number,
      currency: (account.currency ?? "ILS").toUpperCase(),
    }));
  if (balanceReadings.length > 0) {
    // Hebrew, to match the rest of the UI - the catalogue name is English.
    saveBankBalances(
      workspaceId,
      provider,
      bankDisplayName(provider),
      balanceReadings
    );
  }

  const { added, updated } = insertTransactions(
    workspaceId,
    allTransactions,
    providerKey,
    syncRunId
  );
  autoAssignLargeExpenses(workspaceId);
  completeSyncRun(syncRunId, added, updated);

  return { provider: providerKey, ok: true, added, updated, syncRunId };
}

export async function syncWorkspace(
  workspaceId: number,
  filterProvider: string | undefined,
  send: SyncEventSender
): Promise<WorkspaceSummary> {
  const workspace = getWorkspace(workspaceId);
  const workspaceName = workspace?.name ?? `Workspace ${workspaceId}`;

  const providersToSync: string[] =
    filterProvider && filterProvider !== "all"
      ? [filterProvider]
      : listBankCredentials(workspaceId).map((c) => c.provider);

  if (providersToSync.length === 0) {
    send("plan", {
      workspaceId,
      workspaceName,
      providers: [],
      total: 0,
    });
    return {
      workspaceId,
      workspaceName,
      providers: [],
      added: 0,
      updated: 0,
      categorized: 0,
      aiWarning: null,
    };
  }

  const settings = getAppSettings(workspaceId);
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - settings.monthsToSync);

  send("plan", {
    workspaceId,
    workspaceName,
    providers: providersToSync,
    total: providersToSync.length,
  });

  const results: ProviderResult[] = [];

  for (let i = 0; i < providersToSync.length; i++) {
    const provider = providersToSync[i];

    send("provider-start", {
      workspaceId,
      workspaceName,
      provider,
      index: i,
      total: providersToSync.length,
    });
    markSyncHeartbeat();

    const credentials = getBankCredentials(workspaceId, provider);
    if (!credentials) {
      send("provider-done", {
        workspaceId,
        workspaceName,
        provider,
        ok: false,
        added: 0,
        updated: 0,
        errorMessage: `No credentials configured for ${provider}`,
      });
      results.push({
        provider,
        ok: false,
        added: 0,
        updated: 0,
        errorMessage: "No credentials",
      });
      continue;
    }

    try {
      const result = await syncOneProvider(
        workspaceId,
        workspaceName,
        provider,
        credentials,
        startDate,
        send
      );
      results.push(result);
      send("provider-done", {
        workspaceId,
        workspaceName,
        provider,
        ok: result.ok,
        added: result.added,
        updated: result.updated,
        errorMessage: result.errorMessage,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message.replace(/\b\d{5,}\b/g, "[REDACTED]")
          : "Unknown scrape error";
      results.push({
        provider,
        ok: false,
        added: 0,
        updated: 0,
        errorMessage: message,
      });
      send("provider-done", {
        workspaceId,
        workspaceName,
        provider,
        ok: false,
        added: 0,
        updated: 0,
        errorMessage: message,
      });
    }
  }

  const totalAdded = results.reduce((s, r) => s + r.added, 0);
  const totalUpdated = results.reduce((s, r) => s + r.updated, 0);

  let categorized = 0;
  let aiWarning: string | null = null;

  const aiProvider = createAIProvider();
  if (!aiProvider) {
    aiWarning =
      "AI provider not connected — new transactions weren't auto-categorized.";
  }
  if (aiProvider && settings.aiProvider === "ollama") {
      send("stage", {
        workspaceId,
        workspaceName,
        stage: "ollama-start",
      });
      const ollamaResult = await ensureOllamaRunning(settings.ollamaUrl);
      if (!ollamaResult.ok) {
        aiWarning = ollamaResult.error ?? "Ollama is not reachable";
        console.error("[sync]", aiWarning);
      }
  }

  send("stage", {
    workspaceId,
    workspaceName,
    stage: "categorizing",
  });

  const KINDS: Array<"expense" | "income"> = ["expense", "income"];
  const BATCH_SIZE = 50;

  for (const kind of KINDS) {
    const uncategorizedIds = getUncategorizedIdsByKind(workspaceId, kind);
    if (uncategorizedIds.length === 0) continue;

    const categories = getAllCategories(workspaceId, kind);
    if (categories.length === 0) continue;
    const actualParentIds = new Set(
      categories
        .map((c) => c.parentId)
        .filter((id): id is number => id != null)
    );
    const parentNameById = new Map(
      categories
        .filter((c) => actualParentIds.has(c.id))
        .map((c) => [c.id, c.name])
    );
    const categoryInput = categories
      .filter((c) => !actualParentIds.has(c.id))
      .map((c) => ({
        name: c.name,
        description: c.description,
        parentName:
          c.parentId != null ? parentNameById.get(c.parentId) ?? null : null,
      }));
    const pastCorrections = getRecentCorrections(workspaceId, kind);

    const allTxns = getTransactionsForCategorization(
      workspaceId,
      uncategorizedIds
    );
    const personToPerson = allTxns.filter((t) =>
      isPersonToPersonTransfer(t.description)
    );
    batchSetNeedsReview(
      workspaceId,
      personToPerson.map((t) => {
        const decision = decideReview({
          description: t.description,
          amount: t.chargedAmount,
          confidence: null,
        });
        return { id: t.id, ...decision };
      })
    );

    const eligibleTxns = allTxns.filter(
      (t) => !isPersonToPersonTransfer(t.description)
    );
    // User-written rules come first. They are explicit instructions, so they
    // outrank both the learned merchant cache and anything the AI proposes -
    // and they work identically when no AI provider is configured at all.
    const activeRules = listRules(workspaceId).filter(
      (r) => r.enabled && r.categoryKind === kind
    );
    const ruleUpdates: { id: number; categoryId: number; aiConfidence: null }[] = [];
    const ruleHits: number[] = [];
    const afterRules: typeof eligibleTxns = [];
    for (const t of eligibleTxns) {
      const rule = activeRules.length
        ? matchRule(activeRules, {
            id: t.id,
            description: t.description,
            chargedAmount: t.chargedAmount,
            date: t.date,
            // Without memo a counterparty rule could never match during sync.
            memo: t.memo,
          })
        : null;
      if (rule) {
        ruleUpdates.push({ id: t.id, categoryId: rule.categoryId, aiConfidence: null });
        ruleHits.push(rule.id);
      } else {
        afterRules.push(t);
      }
    }
    if (ruleUpdates.length > 0) {
      batchUpdateCategories(workspaceId, ruleUpdates);
      batchSetNeedsReview(
        workspaceId,
        ruleUpdates.map((u) => ({ id: u.id, needsReview: false, reason: null }))
      );
      incrementRuleHits(ruleHits);
      categorized += ruleUpdates.length;
      send("stage", {
        workspaceId,
        workspaceName,
        stage: "rule-hit",
        count: ruleUpdates.length,
        kind,
      });
    }

    const memoryMap = lookupMerchantCategoriesBulk(
      workspaceId,
      afterRules.map((t) => t.description)
    );

    const memoryUpdates: {
      id: number;
      categoryId: number;
      aiConfidence: number | null;
    }[] = [];
    const memoryReviewFlags: {
      id: number;
      needsReview: boolean;
      reason: string | null;
    }[] = [];
    const memoryKeysHit: string[] = [];
    const remainingTxns: typeof allTxns = [];
    for (const t of afterRules) {
      const m = memoryMap.get(t.description);
      if (m && m.kind === kind) {
        memoryUpdates.push({
          id: t.id,
          categoryId: m.categoryId,
          aiConfidence: m.confidence,
        });
        memoryReviewFlags.push({
          id: t.id,
          ...decideReview({
            description: t.description,
            amount: t.chargedAmount,
            confidence: m.confidence,
            learnedReview: Boolean(m.needsReview),
            learnedReason: m.rationale,
          }),
        });
        memoryKeysHit.push(normalizeMerchant(t.description));
      } else {
        remainingTxns.push(t);
      }
    }
    if (memoryUpdates.length > 0) {
      batchUpdateCategories(workspaceId, memoryUpdates);
      batchSetNeedsReview(workspaceId, memoryReviewFlags);
      incrementMerchantHits(workspaceId, memoryKeysHit);
      categorized += memoryUpdates.length;
      send("stage", {
        workspaceId,
        workspaceName,
        stage: "memory-hit",
        count: memoryUpdates.length,
        kind,
      });
    }

    if (!aiProvider || aiWarning) continue;

    for (let i = 0; i < remainingTxns.length; i += BATCH_SIZE) {
      const batch = remainingTxns.slice(i, i + BATCH_SIZE);
      try {
        const mappings = await aiProvider.categorize(
          batch.map((t) => ({
            description: t.description,
            amount: t.chargedAmount,
            currency: t.originalCurrency,
            memo: t.memo,
          })),
          categoryInput,
          { pastCorrections }
        );

        const updates: {
          id: number;
          categoryId: number;
          aiConfidence: number | null;
        }[] = [];
        const reviewFlags: {
          id: number;
          needsReview: boolean;
          reason: string | null;
        }[] = [];

        for (const m of mappings) {
          const category = categories.find((c) => c.name === m.categoryName);
          const txn = batch[m.index];
          if (!category || !txn) continue;
          const confidence = m.confidence ?? null;
          updates.push({
            id: txn.id,
            categoryId: category.id,
            aiConfidence: confidence,
          });
          reviewFlags.push({
            id: txn.id,
            ...decideReview({
              description: txn.description,
              amount: txn.chargedAmount,
              confidence,
            }),
          });
        }

        batchUpdateCategories(workspaceId, updates);
        batchSetNeedsReview(workspaceId, reviewFlags);
        categorized += updates.length;
      } catch (err) {
        console.error(`[sync] AI categorization batch failed (${kind}):`, err);
        if (!aiWarning) {
          aiWarning = friendlyAIError(err, settings.ollamaModel);
        }
      }
    }
  }

  return {
    workspaceId,
    workspaceName,
    providers: results,
    added: totalAdded,
    updated: totalUpdated,
    categorized,
    aiWarning,
  };
}

const NOOP_SEND: SyncEventSender = () => {};

export async function runAllWorkspaces(
  filterProvider?: string,
  onEvent?: SyncEventSender,
  kind: SyncKind = "manual"
): Promise<WorkspaceSummary[]> {
  const send = onEvent ?? NOOP_SEND;
  markSyncStart(kind);
  try {
    const workspaceIds = listAllWorkspaceIds();
    const summaries: WorkspaceSummary[] = [];
    for (const workspaceId of workspaceIds) {
      const summary = await syncWorkspace(workspaceId, filterProvider, send);
      summaries.push(summary);
    }
    return summaries;
  } finally {
    markSyncEnd();
  }
}
