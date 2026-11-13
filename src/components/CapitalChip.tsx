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
  onOpen: () => void;
}

/** Counts from 0 to `value` on mount, then snaps to any later change without
 *  re-running the sweep — a poll that updates the balance every minute should
 *  not replay the entrance. The mount sweep and the live sync share one effect
 *  so the two cannot race: a separate value effect would set the full amount
 *  on the first commit and the sweep's first frame would visibly snap back to 0. */
function useCountUp(value: number, animate: boolean): number {
  const [display, setDisplay] = useState(animate ? 0 : value);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      if (!animate) {
        setDisplay(value);
        return;
      }
      const duration = 620;
      const startedAt = performance.now();
      let frame = 0;
      const tick = (now: number) => {
        const t = Math.min(1, (now - startedAt) / duration);
        // ease-out: fast off the mark, settles gently
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplay(Math.round(value * eased));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frame);
    }
    setDisplay(value);
  }, [value, animate]);

  return display;
}

export default function CapitalChip({ amount, formatCurrency, onOpen }: CapitalChipProps) {
  const reduce = useReducedMotion();
  const pulse = useShimmerPulse();
  const value = Math.max(0, Number(amount) || 0);
  const display = useCountUp(value, !reduce);

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
          {formatCurrency(display)}
        </span>
      </span>
    </motion.button>
  );
}
