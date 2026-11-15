import { useCurrency, type CurrencyPreference } from "../currency";

/**
 * Currency toggle.
 *
 * Three positions, not two: "auto" is the default and means "follow my account"
 * (Ugandan number → UGX, everyone else USD). Pinning to UGX or USD overrides
 * that; tapping the pinned one again returns to auto.
 *
 * The default is automatic, so this control must make that state visible rather
 * than leaving a viewer unsure which of two currencies they are actually seeing.
 */

const OPTIONS: { value: CurrencyPreference; label: string; title: string }[] = [
  { value: "UGX", label: "UGX", title: "Show every amount in Ugandan shillings" },
  { value: "USD", label: "USD", title: "Show every amount in US dollars" },
];

export default function CurrencyToggle({
  className = "",
  size = "sm",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  const { currency, autoCurrency, isAuto, preference, setPreference } = useCurrency();

  const pad = size === "md" ? "px-3 py-1.5 text-[12px]" : "px-2.5 py-1 text-[11px]";

  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-full border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/60 p-0.5 ${className}`}
      role="group"
      aria-label="Display currency"
    >
      {OPTIONS.map((option) => {
        // In auto mode nothing is pinned, so no option reads as pressed; the
        // label below the track says which one the rule landed on.
        const active = !isAuto && preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setPreference(active ? "auto" : option.value)}
            aria-pressed={active}
            title={active ? "Following your account's currency — tap to pin it" : option.title}
            className={`rounded-full font-sans font-black uppercase tracking-wide transition-colors cursor-pointer ${pad} ${
              active
                ? "bg-[var(--theme-primary)] text-[var(--theme-on-primary)]"
                : "text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
      {/* Which currency is actually in force, and whether the rule or the viewer
          chose it. Without this, auto mode looks identical to a pinned one. */}
      <span className="sr-only" aria-live="polite">
        {`Showing ${currency}. ${
          isAuto
            ? `Automatic for this account (${autoCurrency}).`
            : "Pinned by you."
        }`}
      </span>
    </div>
  );
}

/**
 * The one-line caption that explains the current state under the toggle.
 *
 * Without this, auto mode is indistinguishable from a pinned one: the toggle
 * shows nothing pressed either way.
 */
export function CurrencyToggleCaption({ className = "" }: { className?: string }) {
  const { currency, autoCurrency, isAuto } = useCurrency();
  return (
    <p className={className}>
      {isAuto
        ? `Automatic · ${autoCurrency}`
        : `Pinned to ${currency} · tap to follow your account`}
    </p>
  );
}

export { useCurrency };
export type { CurrencyPreference };