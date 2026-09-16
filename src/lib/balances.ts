export const BALANCE_PROVIDERS = {
  excellence: { name: "אקסלנס טרייד", family: "broker", adapter: "portal", credentialMode: "broker", url: "https://www.xnes.co.il/trading/" },
  excellence_spark: { name: "אקסלנס - ספארק (חשבון ותיק)", family: "broker", adapter: "spark", credentialMode: "broker", url: "https://sparknesua.ordernet.co.il" },
  meitav_trade: { name: "מיטב טרייד", family: "broker", adapter: "spark", credentialMode: "broker", url: "https://sparkmeitav.ordernet.co.il" },
  ibi: { name: "אי־בי־אי מסחר", family: "broker", adapter: "spark", credentialMode: "broker", url: "https://sparkibi.ordernet.co.il" },
  altshuler_trade: { name: "אלטשולר שחם טרייד", family: "broker", adapter: "portal", credentialMode: "broker", url: "https://trade.as-invest.co.il/login" },
  harel: { name: "הראל - פנסיה, גמל והשתלמות", family: "pension", adapter: "portal", credentialMode: "identity", url: "https://www.harel-group.co.il/Pages/login-page/Login.aspx/" },
  menora: { name: "מנורה מבטחים - פנסיה וגמל", family: "pension", adapter: "menora", credentialMode: "identity", url: "https://www.menoramivt.co.il/customer-login/" },
  clal: { name: "כלל - פנסיה, גמל והשתלמות", family: "pension", adapter: "portal", credentialMode: "identity", url: "https://www.clalbit.co.il/" },
  migdal: { name: "מגדל - פנסיה, גמל והשתלמות", family: "pension", adapter: "portal", credentialMode: "identity", url: "https://my.migdal.co.il/" },
  ayalon: { name: "איילון - פנסיה וגמל", family: "pension", adapter: "portal", credentialMode: "identity", url: "https://www.ayalon-ins.co.il/" },
  altshuler: { name: "אלטשולר שחם - גמל והשתלמות", family: "pension", adapter: "portal", credentialMode: "identity", url: "https://www.as-invest.co.il/" },
  analyst: { name: "אנליסט - גמל והשתלמות", family: "pension", adapter: "portal", credentialMode: "identity", url: "https://www.analyst.co.il/" },
  meitav: { name: "מיטב - פנסיה וגמל", family: "pension", adapter: "meitav", credentialMode: "identity", url: "https://customers.meitav.co.il/v2/login/loginAmit" },
  mor: { name: "מור - גמל והשתלמות", family: "pension", adapter: "portal", credentialMode: "identity", url: "https://www.moreinvest.co.il/" },
  phoenix: { name: "הפניקס - פנסיה, גמל והשתלמות", family: "pension", adapter: "portal", credentialMode: "identity", url: "https://my.fnx.co.il/" },
} as const;
export type BalanceProvider = keyof typeof BALANCE_PROVIDERS;

/**
 * Hebrew labels for bank-sync connections. Kept local rather than imported from
 * the (large, server-leaning) provider catalogue in types.ts, whose names are in
 * English. An unlisted bank falls back to its raw id, never to a crash.
 */
const BANK_NAMES: Record<string, string> = {
  hapoalim: "בנק הפועלים",
  leumi: "בנק לאומי",
  discount: "בנק דיסקונט",
  mercantile: "בנק מרכנתיל",
  mizrahi: "בנק מזרחי טפחות",
  beinleumi: "הבנק הבינלאומי",
  massad: "בנק מסד",
  otsarHahayal: "בנק אוצר החייל",
  union: "בנק איגוד",
  yahav: "בנק יהב",
  oneZero: "וואן זירו",
};
export const ASSET_KINDS = { checking: "עובר ושב", investment: "חשבון השקעות", pension: "פנסיה", provident: "גמל", study: "השתלמות", insurance: "ביטוח מנהלים", unknown: "ממתין לסיווג" } as const;
export type AssetKind = keyof typeof ASSET_KINDS;
export interface BalanceReading {
  key: string; label: string; kind: AssetKind; amount: number; currency: string;
}
export interface BalanceAccount extends BalanceReading {
  connectionId: number; connectionName: string; owner: string; observedAt: string;
}
export interface BalanceConnection {
  id: number; provider: BalanceProvider; name: string; owner: string;
  lastSuccess: string | null; lastError: string | null;
  hasSavedLogin?: boolean;
  /** Set when the row belongs to a bank sync rather than a portal the user added. */
  bankProvider?: string | null;
}

/** Hebrew name for a bank id, falling back to the id itself. */
export function bankDisplayName(bankProvider: string): string {
  return BANK_NAMES[bankProvider] ?? bankProvider;
}

/**
 * How a connection should be presented.
 *
 * Bank rows are created by the transaction sync (not from the balances screen),
 * so their provider is a bank id that is deliberately absent from
 * BALANCE_PROVIDERS. Everything that renders a connection must go through here
 * instead of indexing BALANCE_PROVIDERS directly - reading `.name` off a
 * missing entry is what used to take the whole page down.
 */
export function describeConnection(connection: Pick<BalanceConnection,"provider"|"bankProvider">) {
  const entry = BALANCE_PROVIDERS[connection.provider as BalanceProvider] as
    | (typeof BALANCE_PROVIDERS)[BalanceProvider]
    | undefined;
  if (entry) {
    return {
      name: entry.name,
      adapter: entry.adapter as string,
      isBank: false,
      /** Portal connections are managed here: credentials, manual sync, removal. */
      managedHere: true,
    };
  }
  return {
    name: BANK_NAMES[connection.bankProvider ?? connection.provider] ?? connection.provider,
    adapter: "bank",
    isBank: true,
    managedHere: false,
  };
}
export interface BalancePayload {
  connections: BalanceConnection[]; accounts: BalanceAccount[];
  history: Array<BalanceReading & { connectionId: number; observedAt: string }>;
  active: { connectionId: number; status: string } | null;
}
export function isBalanceProvider(value: unknown): value is BalanceProvider {
  return typeof value === "string" && Object.hasOwn(BALANCE_PROVIDERS, value);
}
