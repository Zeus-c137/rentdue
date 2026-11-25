/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Home balance card — the bottom edge of the header card, and nothing else.
 *
 * AppHeader owns the card material (frosted surface, top highlight) and is
 * shared by every tab. On Home it leaves its bottom edge open, and this
 * component closes it: withdrawable balance centred, the week read as a
 * percentage against last week, and the money actions.
 *
 * The actions hang off the card's bottom edge, centred. They are children of
 * this section (not a sibling below it), so the card's own bottom border is
 * what appears to pass behind them — the buttons' z-index and opaque black
 * fill hide the crossing. That only works because the card is `relative` and
 * the row is absolutely positioned against it; the card then reserves the
 * overhang as bottom padding so nothing below is covered.
 *
 * Four actions now (Deposit, Withdraw, Gift code, Invite), so the row is
 * `justify-between` inside a max-width rather than a fixed gap: a fixed gap
 * would push the outer two off a 320px screen.
 *
 * The weekly line chart that used to sit here is gone. An absolute week total
 * is not comparable across accounts; a share is, so the same number now reads
 * as a percentage.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Gift, Plus, Share2Icon } from "lucide-react";
import { UserProfile } from "../types";
import { buildInviteLink } from "../utils/referral";
import { useClipboard } from "../hooks/useClipboard";
import { useGatedInterval } from "../hooks/useGatedInterval";
import { POLL_INTERVAL_MS } from "../utils/motion";
import { useCountedMoney } from "./fx/useCountedMoney";
import GiftCodeSheet from "./GiftCodeSheet";
import CurrencyFlagSelect from "./CurrencyFlagSelect";

interface HomeBalanceCardProps {
  profile: UserProfile;
  formatCurrency: (amountUgx: number) => string;
  /** Lets the parent scroll this element into view after a credit lands. */
  balanceRef?: React.Ref<HTMLParagraphElement>;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onProfileUpdate?: (p: UserProfile) => void;
  welcomeBonusAmount?: number;
}

/**
 * A money action: black pill, theme-green glyph, label underneath.
 *
 * The label sits outside the pill (a second line), so the whole tap target is
 * the wrapper rather than the pill — that keeps the pill a clean circle while
 * the label stays legible against the card.
 */
function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="group flex cursor-pointer flex-col items-center gap-1 border-0 bg-transparent p-0 transition-transform active:scale-[0.94]"
    >
      <span className="flex h-[50px] w-[50px] items-center justify-center rounded-full bg-black text-[var(--theme-primary)] shadow-[0_10px_24px_rgba(0,0,0,0.35)] sm:h-[52px] sm:w-[52px]">
        {children}
      </span>
      <span className="text-center font-sans text-[11px] font-bold leading-none tracking-tight whitespace-nowrap text-[var(--theme-text)] sm:text-[11.5px]">
        {label}
      </span>
    </button>
  );
}

export default function HomeBalanceCard({
  profile,
  formatCurrency,
  balanceRef,
  onOpenDeposit,
  onOpenWithdraw,
  onProfileUpdate,
  welcomeBonusAmount = 0,
}: HomeBalanceCardProps) {
  const { copy } = useClipboard();
  const [showGiftCode, setShowGiftCode] = useState(false);
  const [giftAvailable, setGiftAvailable] = useState(false);
  const withdrawable = Math.max(0, Number(profile.points) || 0);
  // While a registration bonus is pending, the card shows the balance the user
  // had *before* it, so the welcome count-up has somewhere to come from.
  const mirrored = welcomeBonusAmount > 0 ? Math.max(0, withdrawable - welcomeBonusAmount) : withdrawable;
  const { display: displayBalance, countTo, begin, release } = useCountedMoney(mirrored);
  const inviteLink = useMemo(() => buildInviteLink(profile.inviteCode), [profile.inviteCode]);

  // A live, unredeemed code is worth a pulse on the Gift code action — the same
  // signal ProfileView shows on its own row.
  const fetchGiftAvailability = async () => {
    if (!profile.phone) return;
    try {
      const res = await fetch(`/api/user/gift_codes/available/${profile.phone}`);
      if (res.ok) {
        const data = await res.json();
        setGiftAvailable(!!data.available);
      }
    } catch {
      // Silent — the pulse just stays off.
    }
  };
  useEffect(() => {
    void fetchGiftAvailability();
  }, [profile.phone]);
  useEffect(() => {
    const handleBalanceCount = (event: Event) => {
      const { to } = (event as CustomEvent<{ from: number; to: number }>).detail || {};
      if (!Number.isFinite(to)) return;
      countTo(to);
    };
    // Armed before the optimistic profile write lands, so the balance does not
    // jump early and leave the coin-flight count with nothing to animate.
    const handleBalancePriming = (event: Event) => {
      const { from } = (event as CustomEvent<{ from: number | null }>).detail || {};
      if (from === null || from === undefined) release();
      else begin(from);
    };
    window.addEventListener("checkin:balance-count", handleBalanceCount);
    window.addEventListener("checkin:balance-priming", handleBalancePriming);
    return () => {
      window.removeEventListener("checkin:balance-count", handleBalanceCount);
      window.removeEventListener("checkin:balance-priming", handleBalancePriming);
    };
  }, [countTo, begin, release]);
  useGatedInterval(fetchGiftAvailability, POLL_INTERVAL_MS, {
    enabled: !!profile.phone,
    visibilityGate: true,
    runOnVisible: true,
  });

  const handleInvite = () => {
    if (!inviteLink) return;
    void copy(inviteLink, "Invite link copied");
  };

  return (
    // Full-bleed against the header card: the scroll container pads its
    // children, so the card pulls itself back out to keep the seam flush.
    // pb-[46px] keeps the balance badge clear of the circles, whose tops sit about
    // 34px above the card's bottom edge.
    <section className="relative -mx-1.5 -mt-3 shrink-0 rounded-b-[28px] border-b border-white/10 bg-[var(--theme-card-bg)]/45 px-4 pb-[46px] backdrop-blur-[20px] backdrop-saturate-[180%] sm:-mx-2">
      <div className="text-center">
        <p className="text-[11px] font-display font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
          Withdrawable balance
        </p>
        {/* Flag + chevron, directly under the label: tapping it switches between
            UGX and USD. A viewer whose account is already outside Uganda has
            nothing to switch, so they get a static flag and no chevron. */}
        <div className="mt-1.5 flex justify-center">
          <CurrencyFlagSelect />
        </div>
        <p
          ref={balanceRef}
          data-checkin-balance
          className="mt-1 truncate font-display text-[36px] font-black leading-none tracking-tight tabular-nums"
        >
          {formatCurrency(displayBalance)}
        </p>
      </div>

      {/* Centred on the card's bottom edge; the card border crosses behind.
          justify-between inside a max-width, not a fixed gap, so a fourth
          action still fits a 320px screen. */}
      <div className="absolute inset-x-0 bottom-0 z-10 mx-auto flex max-w-[300px] translate-y-1/2 items-start justify-between gap-1 px-3">
        <ActionButton label="Deposit" onClick={onOpenDeposit}>
          <Plus className="h-6 w-6" strokeWidth={3} />
        </ActionButton>
        <ActionButton label="Withdraw" onClick={onOpenWithdraw}>
          <ArrowUpRight className="h-6 w-6" strokeWidth={3} />
        </ActionButton>
        <ActionButton label="Gift code" onClick={() => setShowGiftCode(true)}>
          <span className="relative flex items-center justify-center">
            <Gift className="h-[22px] w-[22px]" strokeWidth={2.5} />
            {giftAvailable && (
              <span className="absolute -right-1.5 -top-1.5 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--theme-primary)] opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-black bg-[var(--theme-primary)]" />
              </span>
            )}
          </span>
        </ActionButton>
        <ActionButton label="Invite" onClick={handleInvite}>
          <Share2Icon className="h-[22px] w-[22px]" strokeWidth={2.5} />
        </ActionButton>
      </div>

      <GiftCodeSheet
        open={showGiftCode}
        phone={profile.phone}
        balance={withdrawable}
        onClose={() => setShowGiftCode(false)}
        onRedeemed={(amount) => {
          onProfileUpdate?.({ ...profile, points: withdrawable + amount });
          void fetchGiftAvailability();
        }}
      />
    </section>
  );
}
