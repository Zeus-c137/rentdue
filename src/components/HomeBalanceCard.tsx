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
import React, { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Gift, Plus, Share2Icon } from "lucide-react";
import { TransactionRow, UserProfile } from "../types";
import { fetchJsonWithSignal } from "../utils/abortableFetch";
import { buildInviteLink } from "../utils/referral";
import { useClipboard } from "../hooks/useClipboard";
import { useGatedInterval } from "../hooks/useGatedInterval";
import { POLL_INTERVAL_MS } from "../utils/motion";
import GiftCodeSheet from "./GiftCodeSheet";

/** Every ledger type that credits the withdrawable (Cash Out) balance. */
const CREDIT_TYPES = new Set([
  "daily_yield",
  "referral_signup_bonus",
  "referral_level_income",
  "daily_checkin_bonus",
  "gift_code",
  "vip_task",
  "registration_bonus",
]);

const CREDITED = new Set(["SUCCESSFUL", "COMPLETED"]);
const DAY_MS = 86_400_000;

type WeekComparison = { thisWeek: number; lastWeek: number };

interface HomeBalanceCardProps {
  profile: UserProfile;
  formatCurrency: (amountUgx: number) => string;
  /** Lets the parent scroll this element into view after a credit lands. */
  balanceRef?: React.Ref<HTMLParagraphElement>;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onProfileUpdate?: (p: UserProfile) => void;
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
}: HomeBalanceCardProps) {
  const { copy } = useClipboard();
  const [comparison, setComparison] = useState<WeekComparison | "loading">("loading");
  const [showGiftCode, setShowGiftCode] = useState(false);
  const [giftAvailable, setGiftAvailable] = useState(false);
  const withdrawable = Math.max(0, Number(profile.points) || 0);
  const inviteLink = useMemo(() => buildInviteLink(profile.inviteCode), [profile.inviteCode]);

  // Two 7-day windows of credits, so the week reads as a share rather than an
  // absolute. Re-runs with the profile because a check-in, a claim or a yield
  // credit all move `points`.
  useEffect(() => {
    const ctrl = new AbortController();
    const phone = profile.phone;
    if (!phone) {
      setComparison({ thisWeek: 0, lastWeek: 0 });
      return () => ctrl.abort();
    }
    fetchJsonWithSignal<TransactionRow[]>(`/api/profile/transactions/${phone}`, ctrl.signal)
      .then((rows) => {
        if (ctrl.signal.aborted || !Array.isArray(rows)) return;
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const startMs = startOfToday.getTime();
        // Index 13 is today; 6 is a week ago.
        const days = new Array<number>(14).fill(0);
        for (const tx of rows) {
          const type = String(tx.type || "").toLowerCase();
          if (!CREDIT_TYPES.has(type)) continue;
          if (!CREDITED.has(String(tx.status || "").toUpperCase())) continue;
          const at = new Date(tx.timestamp).getTime();
          if (!Number.isFinite(at) || at < startMs - 13 * DAY_MS) continue;
          const idx = 13 - Math.floor((startMs - at) / DAY_MS);
          if (idx >= 0 && idx < 14) days[idx] += Number(tx.amount) || 0;
        }
        const thisWeek = days.slice(7).reduce((a, b) => a + b, 0);
        const lastWeek = days.slice(0, 7).reduce((a, b) => a + b, 0);
        if (!ctrl.signal.aborted) setComparison({ thisWeek, lastWeek });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setComparison({ thisWeek: 0, lastWeek: 0 });
      });
    return () => ctrl.abort();
  }, [profile.phone, profile.points]);

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
  useGatedInterval(fetchGiftAvailability, POLL_INTERVAL_MS, {
    enabled: !!profile.phone,
    visibilityGate: true,
    runOnVisible: true,
  });

  const handleInvite = () => {
    if (!inviteLink) return;
    void copy(inviteLink, "Invite link copied");
  };

  const weekBadge = (() => {
    if (comparison === "loading") {
      return <span aria-hidden className="block h-5 w-28 animate-pulse rounded-full bg-[var(--theme-text)]/10" />;
    }
    if (comparison.thisWeek <= 0 && comparison.lastWeek <= 0) {
      return (
        <span className="text-[12px] font-sans font-bold text-[var(--theme-text-muted)]">
          No earnings this week
        </span>
      );
    }
    if (comparison.lastWeek <= 0) {
      return (
        <span className="inline-flex items-center rounded-full bg-[var(--theme-primary)]/10 px-2.5 py-1 font-sans text-[12px] font-black text-[var(--theme-primary)]">
          New this week
        </span>
      );
    }
    const pct = ((comparison.thisWeek - comparison.lastWeek) / comparison.lastWeek) * 100;
    const flat = Math.abs(pct) < 0.5;
    const up = pct > 0;
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-sans text-[12px] font-black tabular-nums ${
          flat
            ? "bg-[var(--theme-text)]/[0.06] text-[var(--theme-text-muted)]"
            : up
              ? "bg-[var(--theme-primary)]/10 text-[var(--theme-primary)]"
              : "bg-rose-500/10 text-rose-500"
        }`}
      >
        {flat ? "=" : up ? "\u2191" : "\u2193"} {Math.abs(pct).toFixed(0)}%
      </span>
    );
  })();

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
        <p
          ref={balanceRef}
          className="mt-1.5 truncate font-display text-[36px] font-black leading-none tracking-tight tabular-nums"
        >
          {formatCurrency(withdrawable)}
        </p>
        <p className="mt-2.5 flex min-h-[24px] items-center justify-center">{weekBadge}</p>
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