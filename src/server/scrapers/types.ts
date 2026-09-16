import "server-only";

export interface ScrapedTransaction {
  type: "normal" | "installments";
  identifier?: string | number;
  date: string;
  processedDate: string;
  originalAmount: number;
  originalCurrency: string;
  chargedAmount: number;
  chargedCurrency?: string;
  description: string;
  memo?: string;
  installments?: { number: number; total: number };
  status: "completed" | "pending";
}

export interface ScrapedAccount {
  accountNumber: string;
  transactions: ScrapedTransaction[];
  /**
   * Current account balance, when the bank exposes one. Hapoalim reads it from
   * a dedicated endpoint and Beinleumi scrapes it off the account page; card
   * issuers return nothing, so this stays undefined for them.
   */
  balance?: number;
  /** ISO date the balance was accurate at, when the bank reports it. */
  balanceDate?: string;
  /** Account currency - a foreign-currency account arrives as its own account. */
  currency?: string;
}

export interface ScrapeResult {
  success: boolean;
  accounts: ScrapedAccount[];
  errorMessage?: string;
}
