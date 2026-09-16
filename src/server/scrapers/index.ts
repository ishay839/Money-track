import "server-only";

import fs from "fs";
import { CompanyTypes, createScraper } from "israeli-bank-scrapers";
import type { ScrapeResult, ScrapedTransaction } from "./types";
import type { BankProvider } from "@/lib/types";
import { getWorkspaceSetting } from "../db/queries/settings";

export const PROVIDER_MAP: Record<string, CompanyTypes> = {
  isracard: CompanyTypes.isracard,
  cal: CompanyTypes.visaCal,
  max: CompanyTypes.max,
  amex: CompanyTypes.amex,
  hapoalim: CompanyTypes.hapoalim,
  leumi: CompanyTypes.leumi,
  mizrahi: CompanyTypes.mizrahi,
  discount: CompanyTypes.discount,
  mercantile: CompanyTypes.mercantile,
  beinleumi: CompanyTypes.beinleumi,
  otsarHahayal: CompanyTypes.otsarHahayal,
  union: CompanyTypes.union,
  pagi: CompanyTypes.pagi,
  yahav: CompanyTypes.yahav,
  massad: CompanyTypes.massad,
  beyahadBishvilha: CompanyTypes.beyahadBishvilha,
  behatsdaa: CompanyTypes.behatsdaa,
  oneZero: CompanyTypes.oneZero,
};

export function resolveBrowserExecutable(): string | undefined {
  const configured =
    process.env.SPENT_BROWSER_EXECUTABLE ??
    process.env.PUPPETEER_EXECUTABLE_PATH;
  if (configured && fs.existsSync(configured)) return configured;

  const candidates =
    process.platform === "win32"
      ? [
          process.env.PROGRAMFILES &&
            `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
          process.env["PROGRAMFILES(X86)"] &&
            `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
          process.env.LOCALAPPDATA &&
            `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
          process.env.PROGRAMFILES &&
            `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
          ]
        : [
            "/usr/bin/google-chrome-stable",
            "/usr/bin/google-chrome",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
          ];

  return candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && fs.existsSync(candidate)
  );
}

function sanitizeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "An unknown error occurred during scraping";
  }
  let msg = error.message;
  // Strip 5+ digit numbers (likely ID numbers, card digits, etc.)
  msg = msg.replace(/\b\d{5,}\b/g, "[REDACTED]");
  // Strip password and id values from JSON-like blobs.
  // Match a key followed by quoted string OR unquoted value, non-greedy.
  msg = msg.replace(
    /"(password|id|card6Digits|cardSuffix)"\s*:\s*"[^"]*"/gi,
    '"$1":"[REDACTED]"'
  );
  msg = msg.replace(
    /\b(password|id|card6Digits|cardSuffix)\s*=\s*\S+/gi,
    "$1=[REDACTED]"
  );
  return msg;
}

/**
 * Detect transient errors we should retry, or surface with friendlier copy.
 */
function classifyError(error: unknown): {
  retryable: boolean;
  friendly: string | null;
} {
  if (!(error instanceof Error)) {
    return { retryable: false, friendly: null };
  }
  const msg = error.message;

  // Bot-protection block from the bank. The Isracard variant returns
  // "result: Block Automation" out of the ValidateIdData endpoint, so this
  // must match BEFORE the ValidateIdData credential check below.
  if (/Block Automation|Cloudflare|captcha|recaptcha/i.test(msg)) {
    return {
      retryable: false,
      friendly:
        "The bank's bot protection blocked this sync. It usually clears after a few hours (often overnight). Wait and try again. You can also enable 'Show browser during sync' in settings - headful browsers are harder to detect.",
    };
  }

  // Isracard ValidateIdData returns an empty body when the ID/card-suffix
  // combination doesn't match a real card. This is almost always a credential
  // typo (most commonly entering the full ID into the "Last 6 Digits" field).
  if (/reqName=ValidateIdData/.test(msg)) {
    return {
      retryable: false,
      friendly:
        "Isracard rejected your ID and card combination. Double-check the 'Last 6 Digits of Your Card' field - it should be the last 6 digits of your credit card number, NOT your Israeli ID. Re-run setup from the settings drawer to fix it.",
    };
  }

  // Empty JSON response from bank - usually transient (rate limit, bot block, flaky endpoint).
  if (
    /Unexpected end of JSON input/.test(msg) ||
    /fetchPostWithinPage parse error/.test(msg)
  ) {
    return {
      retryable: true,
      friendly:
        "The bank returned an empty response. This usually means temporary rate limiting or a flaky endpoint on their side. We'll retry automatically; if it keeps failing, wait a few minutes and try again.",
    };
  }

  if (/net::ERR_/i.test(msg) || /ECONNRESET|ECONNREFUSED|ETIMEDOUT/i.test(msg)) {
    return {
      retryable: true,
      friendly:
        "Network error reaching the bank. Check your connection and try again.",
    };
  }

  if (/Navigation timeout|TimeoutError/i.test(msg)) {
    return {
      retryable: true,
      friendly:
        "The bank's site took too long to respond. Often temporary - try again in a minute.",
    };
  }

  if (/Could not find Chrome/i.test(msg)) {
    return {
      retryable: false,
      friendly:
        "Chrome is not available to the sync engine. Install Chrome or set SPENT_BROWSER_EXECUTABLE to its full path.",
    };
  }

  return { retryable: false, friendly: null };
}

const FRIENDLY_ERRORS: Record<string, string> = {
  INVALID_PASSWORD:
    "The credentials were rejected by the bank. Double-check ID, card last 6 digits, and password.",
  CHANGE_PASSWORD:
    "The bank is asking you to change your password. Log in via the bank's website first.",
  ACCOUNT_BLOCKED:
    "The account is blocked by the bank. Resolve this on the bank's website.",
  TIMEOUT:
    "The scrape timed out. The bank's site may be slow or down. Try again.",
  TWO_FACTOR_RETRIEVER_MISSING:
    "This account is asking for 2FA. For most banks, turn on 'This account requires 2FA' in the bank's settings so Spent shows the browser and you can solve it manually. For One Zero, make sure the phone number is set on the account.",
  GENERIC:
    "The scraper failed unexpectedly. Run with 'Show browser during sync' enabled to see what's happening.",
  GENERAL_ERROR:
    "The scraper failed unexpectedly. Run with 'Show browser during sync' enabled to see what's happening.",
};

interface BrowserLoginPage {
  evaluate<T>(pageFunction: () => T): Promise<T>;
}

interface BrowserScraperInternals {
  page?: BrowserLoginPage;
  getLoginOptions?: (credentials: unknown) => {
    postAction?: () => Promise<void>;
    [key: string]: unknown;
  };
}

async function waitForManualLoginRedirect(
  page: BrowserLoginPage,
  timeoutMs = 5 * 60 * 1000
): Promise<void> {
  const initialUrl = await page.evaluate(() => window.location.href);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const currentUrl = await page.evaluate(() => window.location.href);
    if (currentUrl !== initialUrl) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`waiting for redirect from ${initialUrl}`);
}

async function runScrape(
  provider: BankProvider,
  credentials: Record<string, string>,
  startDate: Date,
  showBrowser: boolean
): Promise<ScrapeResult> {
  const companyId = PROVIDER_MAP[provider];
  if (!companyId) {
    return {
      success: false,
      accounts: [],
      errorMessage: `Unsupported provider: ${provider}`,
    };
  }

  const chromiumArgs = [
    "--disable-blink-features=AutomationControlled",
    "--disable-features=IsolateOrigins,site-per-process",
  ];
  // Chromium's renderer sandbox is on by default on macOS, Windows, and
  // most Linux installs. Self-hosters running as root or in unprivileged
  // Docker need to opt out (the sandbox fails to start there).
  if (process.env.SPENT_DISABLE_CHROMIUM_SANDBOX === "1") {
    chromiumArgs.push("--no-sandbox");
  }
  const executablePath = resolveBrowserExecutable();
  if (executablePath) {
    console.log(`[scraper] using browser executable: ${executablePath}`);
  }

  const scraper = createScraper({
    companyId,
    startDate,
    combineInstallments: false,
    showBrowser,
    // Verbose logs include URLs and posted payloads (incl. credentials).
    // Only enable when the user is also showing the browser (= they're debugging).
    verbose: showBrowser,
    timeout: 60000,
    args: chromiumArgs,
    executablePath,
  });

  // Hapoalim can pause on its login page for an SMS challenge. The upstream
  // scraper waits only 20 seconds for a redirect, so extend that window when
  // the user explicitly enabled manual 2FA and is completing it in Chrome.
  if (provider === "hapoalim" && showBrowser) {
    const browserScraper = scraper as typeof scraper & BrowserScraperInternals;
    const originalGetLoginOptions =
      browserScraper.getLoginOptions?.bind(browserScraper);

    if (originalGetLoginOptions) {
      browserScraper.getLoginOptions = (loginCredentials: unknown) => {
        const loginOptions = originalGetLoginOptions(loginCredentials);
        return {
          ...loginOptions,
          postAction: async () => {
            if (!browserScraper.page) {
              throw new Error("Hapoalim login page is unavailable");
            }
            await waitForManualLoginRedirect(browserScraper.page);
          },
        };
      };
    }
  }

  // credentials shape varies by provider; the library accepts different types per bank
  const result = await scraper.scrape(
    credentials as Parameters<typeof scraper.scrape>[0]
  );

  if (!result.success) {
    const errorType = result.errorType ?? "GENERIC";
    console.error(`[scraper] failed (${errorType}):`, result.errorMessage);
    const friendly = FRIENDLY_ERRORS[errorType];
    const detail = result.errorMessage
      ? sanitizeError(new Error(result.errorMessage))
      : errorType;
    return {
      success: false,
      accounts: [],
      errorMessage: friendly
        ? `${friendly} (${detail})`
        : `Scraping failed: ${detail}`,
    };
  }

  const txnCount = (result.accounts ?? []).reduce(
    (sum, a) => sum + a.txns.length,
    0
  );
  console.log(
    `[scraper] success: ${result.accounts?.length ?? 0} account(s), ${txnCount} transaction(s)`
  );

  const accounts = (result.accounts ?? []).map((account) => ({
    accountNumber: account.accountNumber,
    // The library already fetches these; carrying them through is what lets
    // the current-account balance reach the balances screen.
    balance: typeof account.balance === "number" ? account.balance : undefined,
    balanceDate: account.balanceDate ?? undefined,
    currency: account.currency ?? undefined,
    transactions: account.txns.map(
      (txn): ScrapedTransaction => ({
        type: txn.type === "installments" ? "installments" : "normal",
        identifier: txn.identifier ?? undefined,
        date: txn.date,
        processedDate: txn.processedDate,
        originalAmount: txn.originalAmount,
        originalCurrency: txn.originalCurrency,
        chargedAmount: txn.chargedAmount,
        chargedCurrency: txn.chargedCurrency ?? undefined,
        description: txn.description,
        memo: txn.memo ?? undefined,
        installments: txn.installments
          ? { number: txn.installments.number, total: txn.installments.total }
          : undefined,
        status: txn.status === "completed" ? "completed" : "pending",
      })
    ),
  }));

  return { success: true, accounts };
}

interface ScrapeBankOptions {
  /**
   * When true, force showBrowser regardless of the workspace setting. Used for
   * the per-bank manual-2FA flag so the user can solve a 2FA challenge in the
   * popup for just that one provider.
   */
  manualTwoFactor?: boolean;
}

export async function scrapeBank(
  workspaceId: number,
  provider: BankProvider,
  credentials: Record<string, string>,
  startDate: Date,
  options: ScrapeBankOptions = {}
): Promise<ScrapeResult> {
  const workspaceShowBrowser =
    getWorkspaceSetting(workspaceId, "scraper_show_browser") === "true";
  const showBrowser = options.manualTwoFactor === true || workspaceShowBrowser;
  const MAX_ATTEMPTS = 2;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(
        `[scraper] starting scrape for ${provider} from ${startDate.toISOString()} (attempt ${attempt}/${MAX_ATTEMPTS}, showBrowser=${showBrowser})`
      );
      return await runScrape(provider, credentials, startDate, showBrowser);
    } catch (error) {
      lastError = error;
      console.error(
        `[scraper] unexpected error on attempt ${attempt}:`,
        sanitizeError(error)
      );
      const { retryable } = classifyError(error);
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      const backoffMs = 2000 * attempt;
      console.log(`[scraper] retryable error, waiting ${backoffMs}ms`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  const { friendly } = classifyError(lastError);
  const detail = sanitizeError(lastError);
  return {
    success: false,
    accounts: [],
    errorMessage: friendly ? `${friendly} (${detail})` : detail,
  };
}
