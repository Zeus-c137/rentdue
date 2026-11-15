import { ChevronDown, Globe } from "lucide-react";
import {
  COUNTRY_FLAGS,
  countryForPhone,
  useCurrency,
} from "../currency";

/**
 * Flag + chevron currency switch.
 *
 * A Ugandan account sees the Uganda flag and a chevron; tapping flips between
 * UGX and USD. Everyone else sees only their own flag — they already get USD and
 * have nothing to switch between, so the control is not offered as interactive.
 *
 * The flag is the affordance for "this is about my country's money", which is
 * what makes the UGX/USD choice legible without spelling out both codes.
 */
export default function CurrencyFlagSelect({
  size = "sm",
}: {
  size?: "sm" | "md";
}) {
  const { currency, autoCurrency, preference, setPreference, phone } = useCurrency();

  // A Ugandan account chooses between two currencies, so it gets a chevron and
  // the flag matching whichever one is showing — tap and the pair swaps together.
  //
  // Everyone else is USD-only. They see their own country's flag with no chevron,
  // which reads as "your money, in your currency" rather than a control they
  // cannot use. Where the country is unknown the US flag stands in, since USD is
  // what is actually being shown.
  const country = countryForPhone(phone);
  const isUgandan = country === "UG";
  const flag = isUgandan
    ? currency === "USD"
      ? COUNTRY_FLAGS.US
      : COUNTRY_FLAGS.UG
    : country
      ? COUNTRY_FLAGS[country]
      : COUNTRY_FLAGS.US;

  const canToggle = isUgandan || autoCurrency === "UGX";
  const isPinned = preference !== "auto";
  const shown: "UGX" | "USD" = currency;

  const dims = size === "md" ? "h-4 w-6" : "h-3.5 w-5";

  const content = (
    <>
      {flag ? (
        <img
          src={flag}
          alt=""
          className={`${dims} rounded-[2px] object-cover`}
          draggable={false}
        />
      ) : (
        <Globe
          className={`${dims} text-[var(--theme-text-muted)]`}
          strokeWidth={2.2}
        />
      )}
      <span className="font-sans text-[11px] font-black uppercase tracking-wide">
        {shown}
      </span>
      {canToggle && (
        <ChevronDown
          className="h-3 w-3 opacity-70"
          strokeWidth={3}
          aria-hidden
        />
      )}
    </>
  );

  const shell =
    "inline-flex items-center gap-1.5 rounded-full border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/60 px-2 py-1";

  if (!canToggle) {
    // A plain, non-interactive chip. Rendered as a span rather than a disabled
    // button so it is not announced as a control the viewer cannot use.
    return (
      <span
        className={`${shell} text-[var(--theme-text-muted)]`}
        title={`Showing amounts in ${shown}, the currency for your account.`}
      >
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPreference(isPinned && shown === "USD" ? "UGX" : "USD")}
      aria-label={`Currency: ${shown}. Switch to ${shown === "UGX" ? "USD" : "UGX"}.`}
      title={
        isPinned
          ? `Pinned to ${shown}. Tap for ${shown === "UGX" ? "USD" : "UGX"}.`
          : `Following your account (${autoCurrency}). Tap to switch.`
      }
      className={`${shell} cursor-pointer text-[var(--theme-text)] transition-colors hover:border-[var(--theme-primary)]/50 active:scale-95`}
    >
      {content}
    </button>
  );
}