/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Header capital tile — a backgroundless cluster on the left of the ribbon.
 * No card, no border: the ribbon is deliberately backgroundless so the
 * dashboard art reads through, and the tile behaves the same way.
 *
 * It shows the account's recharge balance ("My capital") — the money that can
 * be deployed into bots. That is the number an operator checks most often, so
 * it earns the header slot ahead of tier progress, which lives on the VIP tab.
 *
 * Entrance matches the rest of the app: the tile fades/slides in on mount
 * while the amount counts up from zero.
 */
import React, { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useShimmerPulse } from "../hooks/useShimmerPulse";

interface CapitalChipProps {
  /** Recharge balance in UGX. */
  amount: number;
  /** Formatter from useCurrency(), so the tile matches every other surface. */
  formatCurrency: (amountUgx: number) => string;
  /** Current display currency, so the count-up animates in the shown unit. */
  currency: "UGX" | "USD";
  /** UGX per 1 USD, used to convert before counting. */
  exchangeRate: number;
  onOpen: () => void;
}

/**
 * Counts from 0 to `value` on mount, then snaps to any later change without
 * re-running the sweep — a poll that updates the balance every minute should
 * not replay the entrance. The mount sweep and the live sync share one effect
 * so the two cannot race: a separate value effect would set the full amount
 * on the first commit and the sweep's first frame would visibly snap back to 0.
 *
 * `decimals` is how many places the shown unit carries. Rounding to whole
 * numbers is wrong for USD: it turns $5.41 into $5, and any balance under one
 * dollar into a hard $0 — which reads as "my money is gone".
 */
function useCountUp(value: number, animate: boolean, decimals = 0): number {
  const factor = Math.pow(10, decimals);
  const quantise = (n: number) => Math.round(n * factor) / factor;

  const [display, setDisplay] = useState(() => (animate ? 0 : quantise(value)));
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      if (!animate) {
        setDisplay(quantise(value));
        return;
      }
      const duration = 620;
      const startedAt = performance.now();
      let frame = 0;
      const tick = (now: number) => {
        const t = Math.min(1, (now - startedAt) / duration);
        // ease-out: fast off the mark, settles gently
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplay(quantise(value * eased));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frame);
    }
    setDisplay(quantise(value));
  }, [value, animate, factor]);

  return display;
}

export default function CapitalChip({
  amount,
  formatCurrency,
  currency,
  exchangeRate,
  onOpen,
}: CapitalChipProps) {
  const reduce = useReducedMotion();
  const pulse = useShimmerPulse();
  const value = Math.max(0, Number(amount) || 0);

  // Count in the displayed unit. Counting in UGX and converting at the end
  // would animate 0 -> 20,000 and then jump to $5.41, which reads as a
  // glitch rather than a currency switch.
  const rate = exchangeRate > 0 ? exchangeRate : 1;
  const target = currency === "USD" ? value / rate : value;
  // Two decimals for USD so the count-up does not truncate $5.41 to $5.
  const display = useCountUp(target, !reduce, currency === "USD" ? 2 : 0);

  // `display` is already in the shown unit, so format it directly rather
  // than handing UGX to a formatter that would convert a second time.
  const shown =
    currency === "USD"
      ? "$" + display.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : formatCurrency(display);

  return (
    <motion.button
      type="button"
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: 10 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      onClick={onOpen}
      title="Trading capital - open deposit"
      aria-label={`Trading capital: ${formatCurrency(value)}. Open deposit.`}
      className="flex items-center gap-2 min-w-0 w-full bg-transparent border-0 p-0 text-left cursor-pointer active:scale-[0.96] transition-transform duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-primary)]"
    >
      <span className="min-w-0 leading-none">
        <span className="block font-sans font-bold text-[11px] text-[var(--theme-primary)] truncate max-w-full">
          Trading capital
        </span>
        <span
          className={`mt-2.5 block font-display font-black text-[15px] sm:text-[17px] tracking-tight truncate max-w-full tabular-nums ${
            pulse ? "animate-shimmer-slow" : ""
          }`}
        >
          {shown}
        </span>
      </span>
    </motion.button>
  );
}
