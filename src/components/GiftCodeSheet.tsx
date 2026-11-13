/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Gift-code redemption sheet.
 *
 * The form used to live inline in ProfileView. It sits here now because Home's
 * action row opens it too, and one redeem endpoint with one success animation
 * (confetti, then the balance updates) should not be copy-pasted per screen.
 *
 * Mounted through a portal on purpose. Home renders inside the tab's motion.div,
 * and Motion leaves a `transform` on that element for the length of the fade —
 * a transformed ancestor becomes the containing block for `position: fixed`, so
 * without the portal this dialog would be positioned against the scrollable tab
 * rather than the viewport, which is exactly the "badly positioned" bug: it slid
 * around with the page and lost to the header. z-[100] clears the header (z-40)
 * and the alerts sheet (z-50).
 *
 * The surface is pure black, not the theme card colour. A near-black translucent
 * panel over a dimmed page reads as muddy; solid black reads as a sheet that is
 * genuinely on top.
 *
 * Kept deliberately thin: this owns the code field, the request and the
 * celebration. Availability polling and the profile update stay with whoever
 * mounted it, because only they know how the balance is stored.
 */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Gift, X } from "lucide-react";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { useCurrency } from "../currency";
import { useReducedMotion } from "../hooks/useReducedMotion";
import giftArt from "@/src/assets/3d/3dicons-gift-box-iso-premium.png";

interface GiftCodeSheetProps {
  open: boolean;
  phone?: string;
  /** Balance before this redemption, so the toast can quote the new one. */
  balance: number;
  onClose: () => void;
  /** Called with the credited amount so the host can fold it into the balance. */
  onRedeemed: (amount: number) => void;
}

export default function GiftCodeSheet({ open, phone, balance, onClose, onRedeemed }: GiftCodeSheetProps) {
  const { formatCurrency } = useCurrency();
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fresh code every time it opens — a half-typed code from an earlier visit is
  // more likely to be wrong than remembered. Focus follows so the keyboard is
  // already up on a phone.
  useEffect(() => {
    if (!open) return;
    setValue("");
    setBusy(false);
    const id = window.setTimeout(() => inputRef.current?.focus(), reduceMotion ? 0 : 120);
    return () => window.clearTimeout(id);
  }, [open, reduceMotion]);

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = value.trim();
    if (!code || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/user/redeem_gift_code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to redeem gift code.");

      const credited = Number(data.amount) || 0;
      toast.success(`Redeemed ${formatCurrency(credited)}. New balance: ${formatCurrency(Math.max(0, balance) + credited)}`);
      if (!reduceMotion) {
        try {
          confetti({ particleCount: 150, spread: 85, origin: { y: 0.6 } });
        } catch {
          /* the celebration is optional */
        }
      }
      setValue("");
      onRedeemed(credited);
      setTimeout(onClose, reduceMotion ? 0 : 900);
    } catch (err: any) {
      toast.error(err?.message || "Could not redeem that code.");
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="absolute inset-0 bg-black/80"
            onClick={busy ? undefined : onClose}
          />
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { scale: 0.96, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { scale: 0.96, y: 12, opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", damping: 26, stiffness: 380 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gift-code-title"
            className="relative flex w-full max-w-[360px] flex-col overflow-hidden rounded-[26px] border border-white/10 bg-black text-white shadow-[0_24px_60px_rgba(0,0,0,0.7)]"
          >
            {/* Own close row rather than a corner X: the X floated over the art
                before, which is what made the sheet look thrown together. */}
            <div className="flex items-center justify-between px-4 pt-3.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                <Gift className="h-3.5 w-3.5" strokeWidth={2.5} />
                Bonus
              </span>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                aria-label="Close gift code"
                className="-mr-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white active:scale-95 cursor-pointer disabled:opacity-30"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col items-center px-5 pb-1 pt-2 text-center">
              <img
                src={giftArt}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="h-20 w-20 select-none object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.6)]"
              />
              <h3 id="gift-code-title" className="mt-3 font-display text-[19px] font-black leading-tight tracking-tight">
                Redeem a gift code
              </h3>
              <p className="mt-1.5 text-[12.5px] leading-snug text-white/55">
                Codes are shared in the community channels. The bonus lands in your withdrawable balance.
              </p>
            </div>

            <form onSubmit={handleRedeem} className="flex flex-col gap-2.5 p-5 pt-4">
              <input
                ref={inputRef}
                type="text"
                required
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={value}
                disabled={busy}
                onChange={(e) => setValue(e.target.value.toUpperCase())}
                placeholder="ENTER CODE"
                aria-label="Gift code"
                className="w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3.5 text-center font-display text-[15px] font-black uppercase tracking-[0.24em] text-white outline-none transition-colors placeholder:tracking-[0.18em] placeholder:text-white/25 focus:border-[var(--theme-primary)] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!value.trim() || busy}
                className="mt-0.5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--theme-primary)] px-4 py-3.5 font-sans text-[14px] font-black text-[var(--theme-on-primary)] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Redeeming
                  </>
                ) : (
                  <>
                    <Gift className="h-4 w-4" strokeWidth={2.5} />
                    Redeem gift
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}