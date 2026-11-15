import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Currency context.
 *
 * Single source of truth for "what currency does this viewer see". This is React
 * context rather than module-level mutable state so that a change — signing in,
 * an admin editing the USDT rate, or the viewer flipping the toggle — re-renders
 * every consumer instead of leaving a stale formatter behind.
 *
 * Everything in the database and every provider call is UGX. Conversion to USD is
 * a display-layer concern only: `formatCurrency` takes a UGX amount and renders
 * it in whichever currency this viewer should see.
 *
 * The default is automatic: a Ugandan number sees UGX, everyone else sees USD.
 * `preference` lets a viewer override that, and "auto" puts it back.
 */

export type Currency = "UGX" | "USD";

/** "auto" follows the phone/location rule; the other two pin it explicitly. */
export type CurrencyPreference = "auto" | Currency;

/** Fallback rate used until the admin-configured USDT rate is known. */
export const EXCHANGE_RATE = 3700;

export interface CurrencyContextValue {
  /** The currency this viewer should see, after applying their preference. */
  currency: Currency;
  /** What the automatic rule alone would have chosen, ignoring the preference. */
  autoCurrency: Currency;
  /** True when the viewer has not overridden the automatic choice. */
  isAuto: boolean;
  /** The account's phone number, for resolving a country flag. */
  phone: string | null;
  /** The viewer's choice: "auto", or a pinned currency. */
  preference: CurrencyPreference;
  /** Pins a currency, or "auto" to resume following the rule. Persisted by the caller. */
  setPreference: (preference: CurrencyPreference) => void;
  /** UGX per 1 USD. */
  exchangeRate: number;
  /** Formats a UGX amount into this viewer's currency. */
  formatCurrency: (amountUgx: number) => string;
  /** Formats a UGX amount as a bare number in this viewer's currency (no symbol). */
  formatAmount: (amountUgx: number) => string;
  /** The active currency's symbol, for labels that need it separately. */
  unitLabel: string;
}

export function formatIn(currency: Currency, amountUgx: number, exchangeRate: number): string {
  const value = Number.isFinite(amountUgx) ? amountUgx : 0;
  if (currency === "UGX") {
    return `UGX ${Math.round(value).toLocaleString("en-US")}`;
  }
  return `$${formatConverted(value, exchangeRate)}`;
}

/**
 * Renders a converted USD amount without ever showing a false zero.
 *
 * At 3,700 UGX/USD a 20,000 UGX balance is $5.41, but a 30 UGX one is $0.008 —
 * and rounding that to two decimals paints "$0.00" on a real balance, which
 * reads as "my money is gone". Below one cent we show the fraction instead.
 */
function formatConverted(amountUgx: number, exchangeRate: number): string {
  const rate = exchangeRate > 0 ? exchangeRate : EXCHANGE_RATE;
  const converted = Math.abs(amountUgx) / rate;
  const sign = amountUgx < 0 ? "-" : "";
  if (converted === 0) return "0.00";
  if (converted < 0.01) return `${sign}${converted.toFixed(4)}`;
  return `${sign}${converted.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatAmountIn(currency: Currency, amountUgx: number, exchangeRate: number): string {
  const value = Number.isFinite(amountUgx) ? amountUgx : 0;
  if (currency === "UGX") {
    return Math.round(value).toLocaleString("en-US");
  }
  return formatConverted(value, exchangeRate);
}

/**
 * Decides which currency a phone number implies.
 *
 * The safe answer is UGX, so USD requires positive evidence: the product settles
 * over MTN/Airtel Uganda, and a wrong "USD" shows someone a number that looks
 * ~3,700x too small. Verified against the live table — 32 accounts, all on MTN,
 * and exactly one (883905966) whose digits are neither a Ugandan mobile nor a
 * valid international format. That account keeps UGX rather than being silently
 * converted, because a malformed number is not proof of a foreign one.
 */
export function currencyForPhone(raw: string | null | undefined): Currency {
  const trimmed = String(raw || "").trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "UGX";

  // Explicit country code.
  if (/^\+?256/.test(trimmed)) return "UGX";
  // Standard Ugandan mobile: 7XXXXXXXX, or the same with a leading zero.
  if (/^0?7\d{8}$/.test(digits)) return "UGX";

  // Known non-Ugandan dial codes, with or without the leading plus.
  const FOREIGN_DIAL =
    /^(?:\+|00)?(?:254|255|250|257|234|233|231|27|20|212|213|216|218|249|251|91|971|972|966|974|965|968|973|994|995|998|880|92|93|94|95|62|63|60|65|66|84|86|81|82|852|853|886|1|44|33|49|39|34|31|32|41|43|45|46|47|48|30|351|353|358|370|371|372|380|40|359|381|385|386|421|420|36|90|7)\d{8,12}$/;
  if (FOREIGN_DIAL.test(digits) || /^\+\d{11,15}$/.test(trimmed)) return "USD";

  // Anything else is ambiguous. Default to UGX rather than converting a real
  // balance on a guess.
  return "UGX";
}

/**
 * Pre-login fallback: the browser's own region. Only used until a profile
 * exists, so a wrong guess corrects itself the moment the user signs in.
 */
function detectFromLocale(): Currency {
  if (typeof navigator === "undefined") return "UGX";
  const locale = (navigator.languages && navigator.languages[0]) || navigator.language || "";
  if (/-(UG|KE|TZ|RW|BI|SS)\b/i.test(locale)) return "UGX";
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (/Kampala|Nairobi|Dar_es|el_Monrovia|Kigali/i.test(tz)) return "UGX";
  } catch {
    // Intl unavailable — fall through to the UGX default below.
  }
  return "USD";
}

// ---------------------------------------------------------------------------
// Country resolution (for the flag affordance)
// ---------------------------------------------------------------------------

/**
 * Country codes we have a flag asset for. Flags live in /public/flags and are
 * served at /flags/* by Vite in dev and copied into dist/ for production.
 */
export const COUNTRY_FLAGS: Record<string, string> = {
  UG: "/flags/uganda.svg",
  RW: "/flags/rwanda.svg",
  TZ: "/flags/tanzania.svg",
  KE: "/flags/kenya.svg",
  ZA: "/flags/south-africa.svg",
  NG: "/flags/nigeria.png",
  US: "/flags/united-states.png",
};

/**
 * Dial code -> ISO country code. Only codes we can actually resolve to a flag
 * are listed; anything else is left unknown and the caller shows a globe.
 * Longest prefix wins, so "+1" must be checked after any longer code that
 * shares it.
 */
const DIAL_TO_COUNTRY: Record<string, string> = {
  "256": "UG",
  "250": "RW",
  "255": "TZ",
  "254": "KE",
  "27": "ZA",
  "234": "NG",
  "1": "US",
};

/**
 * Resolves a phone number to a country code we hold a flag for, or null.
 *
 * Numbers are stored as bare local digits server-side, so a Ugandan number has
 * no dial code to read and is detected by its shape; everyone else carries the
 * country code that was dialled. Deliberately returns null for anything it
 * cannot place — a wrong flag is worse than a neutral globe.
 */
export function countryForPhone(raw: string | null | undefined): string | null {
  const trimmed = String(raw || "").trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  // A local Ugandan mobile number carries no country code.
  if (/^0?7\d{8}$/.test(digits)) return "UG";

  // Longest matching dial prefix. "+256..." is checked before "+25..." would
  // be, because the keys are tested in descending length order.
  const codes = Object.keys(DIAL_TO_COUNTRY).sort((a, b) => b.length - a.length);
  for (const code of codes) {
    if (digits.startsWith(code)) return DIAL_TO_COUNTRY[code];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Preference persistence
// ---------------------------------------------------------------------------

const PREFERENCE_KEY = "rentdue_currency_preference";
// Written by the previous (self-disabling) currency module. Cleared once so a
// stale "USD" left over from that version cannot silently pin the currency.
const LEGACY_KEYS = ["user_currency", "user_currency_preference"];

export function loadCurrencyPreference(): CurrencyPreference {
  try {
    if (typeof window === "undefined") return "auto";
    for (const key of LEGACY_KEYS) window.localStorage.removeItem(key);
    const stored = window.localStorage.getItem(PREFERENCE_KEY);
    if (stored === "UGX" || stored === "USD" || stored === "auto") return stored;
  } catch {
    // Private mode / storage disabled — the automatic rule still applies.
  }
  return "auto";
}

export function saveCurrencyPreference(preference: CurrencyPreference): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PREFERENCE_KEY, preference);
  } catch {
    // Not being able to persist the choice is not worth failing a render over.
  }
}

/**
 * Applies the viewer's preference on top of the automatic choice.
 *
 * `auto` is the account's own answer: UGX for Uganda, USD for everyone else.
 * A preference may only move *away* from UGX — USD is always allowed, because
 * a Ugandan holding dollars is ordinary. It may never move a non-Ugandan into
 * UGX, which is the currency their account does not hold and their provider does
 * not settle in.
 *
 * This is the single choke point: every caller resolves through here, so no path
 * can bypass the rule.
 */
export function resolveCurrency(
  preference: CurrencyPreference,
  auto: Currency
): Currency {
  if (auto === "UGX") {
    return preference === "USD" ? "USD" : "UGX";
  }
  // Non-Ugandan account: UGX is not available to them.
  return "USD";
}

export function buildCurrencyValue(
  currency: Currency,
  exchangeRate: number,
  options?: {
    autoCurrency?: Currency;
    phone?: string | null;
    preference?: CurrencyPreference;
    setPreference?: (preference: CurrencyPreference) => void;
  }
): CurrencyContextValue {
  const rate = exchangeRate > 0 ? exchangeRate : EXCHANGE_RATE;
  const preference = options?.preference ?? "auto";
  return {
    currency,
    autoCurrency: options?.autoCurrency ?? currency,
    phone: options?.phone ?? null,
    isAuto: preference === "auto",
    preference,
    setPreference: options?.setPreference ?? (() => {}),
    exchangeRate: rate,
    formatCurrency: (amountUgx: number) => formatIn(currency, amountUgx, rate),
    formatAmount: (amountUgx: number) => formatAmountIn(currency, amountUgx, rate),
    unitLabel: currency === "UGX" ? "UGX" : "$",
  };
}

/**
 * Resolves which currency this viewer should see, and the rate to convert at.
 *
 * Resolution order:
 *   1. An explicit phone argument — used by App.tsx, which owns the decision.
 *   2. The surrounding provider — how every nested component gets its answer.
 *   3. The browser locale — only reachable outside the provider (admin route),
 *      where UGX is correct anyway.
 *
 * Nested components must not each re-derive the currency from the phone: they
 * would all agree today, and silently disagree the moment the rule changes.
 *
 * `options.forceUgx` opts a subtree out of the ambient decision entirely. The
 * admin console needs this: it edits amounts that are stored and settled in UGX,
 * so its labels must not follow whoever happens to be signed in.
 */
export function useCurrency(
  phone?: string | null,
  exchangeRate?: number | null,
  options?: {
    forceUgx?: boolean;
    preference?: CurrencyPreference;
    setPreference?: (preference: CurrencyPreference) => void;
  }
): CurrencyContextValue {
  const inherited = useContext(CurrencyContext);
  const [localeCurrency] = useState<Currency>(detectFromLocale);

  // A nested consumer with no opinion of its own inherits the provider's answer
  // wholesale, including the preference and the setter — otherwise a toggle deep
  // in the tree would read a preference it could not change.
  if (phone === undefined && options?.preference === undefined && !options?.forceUgx) {
    if (exchangeRate === undefined || exchangeRate === null) return inherited;
    return {
      ...inherited,
      ...buildCurrencyValue(inherited.currency, Number(exchangeRate), {
        autoCurrency: inherited.autoCurrency,
        // Must be carried through: dropping it would leave the flag selector with
        // no account country to resolve a flag from.
        phone: inherited.phone,
        preference: inherited.preference,
        setPreference: inherited.setPreference,
      }),
    };
  }

  // Reaching here without a phone means either App.tsx (which owns the decision
  // and has no account yet) or an explicit `null` from the pre-login views. The
  // ambient provider is deliberately not consulted: at App level it is still the
  // module default, so deferring to it would pin everyone to UGX before login and
  // the browser-locale fallback could never run.
  const auto: Currency = options?.forceUgx
    ? "UGX"
    : phone
      ? currencyForPhone(phone)
      : localeCurrency;

  // A preference only ever means something on a UGX account, where USD is a real
  // option. Elsewhere there is nothing to choose, so report "auto" rather than
  // claiming a pinned state the currency rule would override anyway.
  const preference: CurrencyPreference = options?.forceUgx
    ? "UGX"
    : auto === "UGX"
      ? (options?.preference ?? "auto")
      : "auto";

  const currency = resolveCurrency(preference, auto);

  const rate =
    Number(exchangeRate) ||
    (options?.forceUgx ? EXCHANGE_RATE : inherited?.exchangeRate) ||
    EXCHANGE_RATE;

  return useMemo(
    () =>
      buildCurrencyValue(currency, rate, {
        autoCurrency: auto,
        phone: phone ?? null,
        preference,
        setPreference: options?.setPreference ?? inherited?.setPreference,
      }),
    [currency, auto, rate, phone, preference, options?.setPreference, inherited?.setPreference]
  );
}

const CurrencyContext = createContext<CurrencyContextValue | null>(
  buildCurrencyValue("UGX", EXCHANGE_RATE)
);

export function CurrencyProvider({
  value,
  children,
}: {
  value: CurrencyContextValue;
  children: ReactNode;
}) {
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}