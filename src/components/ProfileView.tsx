/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { useGatedInterval } from "../hooks/useGatedInterval";
import { UserProfile, SubscribedNode } from "../types";
import { canonicalTypeOf, getTransactionDisplayMeta, isPositiveTransaction, getWithdrawalDisplayAmounts } from "../utils/transactionMeta";
import { usePwaInstall } from "../hooks/usePwaInstall";
import {
  Phone,
  CreditCard,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  History,
  Users,
  Gift,
  CalendarCheck,
  Calendar,
  Lock,
  Download,
  Settings,
  LogOut,
  X,
  ExternalLink,
  Loader2,
  CheckCircle2,
  Crown,
  Flame,
  Check,
  Info,
  Plus,
  Coins,
  Cpu,
  Trophy,
  Award,
  ChevronRight,
  Share2Icon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { POLL_INTERVAL_MS } from "../utils/motion";
import { getTodayKey } from "../utils/runs";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import gift3d2 from "@/src/assets/3d/3dicons-gift-box-iso-premium.png";
import { Button } from "./ui/button";
import confetti from "canvas-confetti";
import NewsCarousel from "./NewsCarousel";
import VisaMetricCard from "./VisaMetricCard";

interface ProfileViewProps {
  userProfile: UserProfile;
  siteConfig?: any;
  activeNodes?: SubscribedNode[];
  notifications?: any[];
  onProfileUpdate: (newProfile: UserProfile) => void;
  onNavigateToDeposit: () => void;
  onNavigateToWithdraw?: () => void;
  onNavigateToTeamRevenue?: () => void;
  onNavigate: (tab: "dashboard" | "catalog" | "income" | "collection" | "history" | "referral" | "chat" | "profile" | "account" | "guide" | "deposit" | "withdraw" | "alerts" | "vip" | "streaks", chatRoom?: "shared" | "admin") => void;
  onLogout: () => void;
  autoOpenWithdraw?: boolean;
  onCloseAutoWithdraw?: () => void;
}

/**
 * A profile action: black pill, theme-green glyph, label underneath.
 *
 * Same shape as the dashboard home money actions. The label sits outside the
 * pill (a second line), so the whole tap target is the wrapper rather than the
 * pill — that keeps the pill a clean circle while the label stays legible
 * against the card.
 */
function ProfileAction({
  label,
  onClick,
  href,
  children,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  children: React.ReactNode;
}) {
  const className =
    "group flex cursor-pointer flex-col items-center gap-1 border-0 bg-transparent p-0 transition-transform active:scale-[0.94]";
  const body = (
    <>
      <span className="flex h-[50px] w-[50px] items-center justify-center rounded-full bg-black text-[var(--theme-primary)] shadow-[0_10px_24px_rgba(0,0,0,0.35)] sm:h-[52px] sm:w-[52px]">
        {children}
      </span>
      <span className="text-center font-sans text-[11px] font-bold leading-none tracking-tight whitespace-nowrap text-[var(--theme-text)] sm:text-[11.5px]">
        {label}
      </span>
    </>
  );

  // Community links are anchors, everything else is a button. Sharing one body
  // keeps the pill and the label identical for both.
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" title={label} aria-label={label} className={className}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={className}>
      {body}
    </button>
  );
}

export default function ProfileView({
  userProfile,
  siteConfig,
  activeNodes = [],
  notifications = [],
  onProfileUpdate,
  onNavigateToDeposit,
  onNavigateToWithdraw,
  onNavigateToTeamRevenue,
  onNavigate,
  onLogout,
  autoOpenWithdraw,
  onCloseAutoWithdraw
}: ProfileViewProps) {

  const { formatCurrency, currency } = useCurrency();

  const [showGiftCodeSheet, setShowGiftCodeSheet] = useState(false);
  const [giftCodeValue, setGiftCodeValue] = useState("");
  const [isRedeemingGiftCode, setIsRedeemingGiftCode] = useState(false);

  useEffect(() => {
    if (autoOpenWithdraw) {
      setShowWithdrawSheet(true);
      onCloseAutoWithdraw?.();
    }
  }, [autoOpenWithdraw]);

  const {
    isInstalled,
    canInstall,
    isInstallSupported,
    platform,
    install,
  } = usePwaInstall();

  useEffect(() => {
    // Just handle simple initialization if needed
  }, [platform]);

  const getDayIndex = () => {
    const day = new Date().getDay(); // 0 is Sun, 1 is Mon, ... 6 is Sat
    return day === 0 ? 6 : day - 1; // Map 0 (Sun) to 6, 1 to 0, 2 to 1, etc.
  };

  const todayStr = getTodayKey();
  const checkedInToday = userProfile.lastCheckinDate === todayStr;
  const currentStreak = userProfile.checkinStreak || 0;

  // Canonical check-in economics — mirrors the server fallbacks in
  // dailyCheckin (0 until the admin sets them). One pair everywhere so sheet
  // previews and actual payouts can never disagree.
  const baseBonus = (siteConfig?.checkinBaseBonus !== undefined && siteConfig?.checkinBaseBonus !== null) ? siteConfig.checkinBaseBonus : 0;
  const increment = (siteConfig?.checkinIncrement !== undefined && siteConfig?.checkinIncrement !== null) ? siteConfig.checkinIncrement : 0;
  const withdrawalMode: "automatic" | "manual" = siteConfig?.allowAutoWithdraw === false ? "manual" : "automatic";
  const minimumWithdrawal = Number(siteConfig?.minimumWithdrawal) > 0 ? Math.floor(Number(siteConfig.minimumWithdrawal)) : 0;
  const maximumWithdrawal = siteConfig?.maximumWithdrawal === undefined || siteConfig?.maximumWithdrawal === null
    ? 5_000_000
    : (Number(siteConfig.maximumWithdrawal) > 0 ? Math.floor(Number(siteConfig.maximumWithdrawal)) : 0);

  // Month-run math. The server keeps streaks consecutive (a missed day
  // restarts at 1), so the current run is exactly: streak days ending today
  // (claimed) or yesterday (claimable). The shared sheet derives tiles.
  const calTodayDay = new Date().getDate();
  const calTodayStreak = checkedInToday ? currentStreak : currentStreak + 1;
  const calTodayAmount = baseBonus + (calTodayStreak - 1) * increment;
  const compactUgx = (n: number) => n >= 1000 ? `${parseFloat((n / 1000).toFixed(1))}k` : `${n}`;

  const handleRedeemGiftCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!giftCodeValue) return;
    setIsRedeemingGiftCode(true);
    try {
      const res = await fetch("/api/user/redeem_gift_code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: userProfile.phone, code: giftCodeValue })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to redeem gift code.");

      const formattedAmount = formatCurrency(data.amount);
      const formattedNewBalance = formatCurrency(userProfile.points + data.amount);

      toast.success(`Redeemed gift code of ${formattedAmount}! New balance: ${formattedNewBalance}`);

      // Trigger Confetti!
      try {
        confetti({
          particleCount: 150,
          spread: 85,
          origin: { y: 0.6 }
        });
      } catch (confettiErr) {
        console.error("Confetti failed", confettiErr);
      }

      setGiftCodeValue("");
      setTimeout(() => setShowGiftCodeSheet(false), 1500);

      // Update profile locally
      onProfileUpdate({
        ...userProfile,
        points: userProfile.points + data.amount
      });
      // Re-check — more codes may still be claimable.
      void fetchGiftAvailability();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsRedeemingGiftCode(false);
    }
  };

  // States to trigger minimal sheets
  const [showWithdrawSheet, setShowWithdrawSheet] = useState(false);

  const [showHistorySheet, setShowHistorySheet] = useState(false);

  // Withdraw form fields (bind-account settings moved to BindAccountView page)
  const [usdtAddress, setUsdtAddress] = useState(userProfile.usdtAddress || "");
  const [withdrawalPhone, setWithdrawalPhone] = useState(userProfile.phone || "");

  // Cashout request form fields
  const [pointsToWithdraw, setPointsToWithdraw] = useState<number>(0);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawOperator, setWithdrawOperator] = useState<"MTN" | "Airtel" | "USDT">((userProfile.operator as "MTN" | "Airtel" | "USDT") || "MTN");

  // Transactions list
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<string>("all");

  // Sync profile details when userProfile changes
  useEffect(() => {
    if (userProfile) {
      setUsdtAddress(userProfile.usdtAddress || "");
      setWithdrawalPhone(userProfile.phone || "");
      setWithdrawOperator((userProfile.operator as "MTN" | "Airtel" | "USDT") || "MTN");
    }
  }, [userProfile, showWithdrawSheet]);

  // Gift-code pulse — true while the admin has a live code this user can
  // still redeem (active, unexpired, redemptions left, not yet claimed).
  const [giftAvailable, setGiftAvailable] = useState(false);
  const fetchGiftAvailability = async () => {
    try {
      const res = await fetch(`/api/user/gift_codes/available/${userProfile.phone}`);
      if (res.ok) {
        const data = await res.json();
        setGiftAvailable(!!data.available);
      }
    } catch {
      // Silent — the dot just stays off.
    }
  };
  useEffect(() => { void fetchGiftAvailability(); }, [userProfile.phone]);
  useGatedInterval(fetchGiftAvailability, POLL_INTERVAL_MS, { enabled: !!userProfile.phone, visibilityGate: true, runOnVisible: true });

  // Fetch non-simulated user transaction logs
  const fetchTxHistory = async () => {
    setTxLoading(true);
    try {
      const res = await fetch(`/api/profile/transactions/${userProfile.phone}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data);
      }
    } catch (err) {
      console.error("Failed to fetch transaction histories:", err);
    } finally {
      setTxLoading(false);
    }
  };

  // Cash Out
  const handleWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!activeNodes || activeNodes.length === 0) {
      toast.error("You must have rented at least one product to qualify for withdrawals.");
      return;
    }

    if (!Number.isInteger(pointsToWithdraw) || pointsToWithdraw < minimumWithdrawal) {
      toast.error(`Minimum withdrawal is ${formatCurrency(minimumWithdrawal)}.`);
      return;
    }

    if (maximumWithdrawal > 0 && pointsToWithdraw > maximumWithdrawal) {
      toast.error(`Maximum withdrawal is ${formatCurrency(maximumWithdrawal)}.`);
      return;
    }

    if (pointsToWithdraw > userProfile.points) {
      toast.error(`Insufficient withdrawable balance. Available: ${formatCurrency(userProfile.points || 0)}.`);
      return;
    }

    if (withdrawOperator === "USDT") {
      if (usdtAddress.length < 10) {
        toast.error("Please enter a valid USDT Wallet address.");
        return;
      }
    } else {
      if (!/^\d{9,10}$/.test(withdrawalPhone)) {
        toast.error("Withdrawal phone number must be 9 or 10 digits.");
        return;
      }
    }

    setIsWithdrawing(true);

    try {
      const res = await fetch("/api/payment/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: userProfile.phone,
          amount: pointsToWithdraw,
          operator: withdrawOperator,
          withdrawPhone: withdrawOperator === "USDT" ? usdtAddress : withdrawalPhone
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Cashout disbursement rejected.");
      }

      onProfileUpdate(data.profile);
      await fetchTxHistory();
      toast.success(
        data.mode === "manual"
          ? "Withdrawal submitted and is pending admin approval."
          : "Withdrawal submitted and is awaiting payment-provider confirmation."
      );
      setPointsToWithdraw(0);
      setTimeout(() => {
        setShowWithdrawSheet(false);
      }, 1500);
    } catch (err: any) {
      toast.error(err.message || "Something went wrong during payment processing.");
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <div className="space-y-6 select-none bg-transparent text-slate-100 p-1 rounded-2xl relative">
      {/* News Grid */}
      <NewsCarousel phone={userProfile.phone} dynamicNews={notifications.filter((n:any)=> n.category==="news")} fullWidth />

      {/* 1. Balance — Visa card (recharge + withdrawable) */}
      <VisaMetricCard
        inviteCode={userProfile.inviteCode}
        leftLabel="Trading capital"
        leftValue={`${currency === 'USD' ? '$' : 'UGX'} ${currency === 'USD' ? ((userProfile.rechargeBalance || 0) / 3700).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (userProfile.rechargeBalance || 0).toLocaleString()}`}
        rightLabel="Withdrawable balance"
        rightValue={`${currency === 'USD' ? '$' : 'UGX'} ${currency === 'USD' ? ((userProfile.points || 0) / 3700).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (userProfile.points || 0).toLocaleString()}`}
      />
      {/* Money actions. Two equal columns, tight under the balance card, so
          the pair reads as the card's own action row rather than two loose
          pills floating on the page. */}
      <div className="flex gap-2.5">
        <button
          onClick={onNavigateToDeposit}
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-3 rounded-[10px] bg-[var(--theme-primary)] text-[var(--theme-on-primary)] text-[13px] font-sans font-extrabold transition-all active:scale-[0.98] cursor-pointer shadow-[0_4px_0_0_var(--theme-primary-shadow)] active:shadow-none active:translate-y-[2px]"
        >
          <Plus className="w-4 h-4" strokeWidth={3} /> Deposit
        </button>
        <button
          onClick={() => (onNavigateToWithdraw ? onNavigateToWithdraw() : setShowWithdrawSheet(true))}
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-3 rounded-[10px] border border-[var(--theme-primary)]/40 bg-transparent text-[var(--theme-primary)] text-[13px] font-sans font-extrabold transition-colors hover:bg-[var(--theme-primary)]/10 cursor-pointer"
        >
          <ArrowUpRight className="w-4 h-4" strokeWidth={3} /> Withdraw
        </button>
      </div>

      {/* Everything else as one labelled grid. No card around it: the label and
          the spacing do the grouping, which keeps the page reading as
          balance -> money actions -> the rest, instead of nesting a card inside
          the page. */}
      <div>
        <p className="mt-6 mb-3 px-1 text-[11px] font-sans font-black uppercase tracking-[0.14em] text-[var(--theme-text)] opacity-45">
          More
        </p>
        <div className="grid grid-cols-4 gap-x-1 gap-y-5 px-1">
          <ProfileAction label="Transactions" onClick={() => onNavigate("history")}>
            <Calendar className="h-[22px] w-[22px]" strokeWidth={2.5} />
          </ProfileAction>
          <ProfileAction label="Invite" onClick={() => onNavigate("referral")}>
            <Share2Icon className="h-[22px] w-[22px]" strokeWidth={2.5} />
          </ProfileAction>
          <ProfileAction label="Daily tasks" onClick={() => onNavigate("vip")}>
            <Trophy className="h-[22px] w-[22px]" strokeWidth={2.5} />
          </ProfileAction>
          <ProfileAction label="Collection" onClick={() => onNavigate("collection")}>
            <Award className="h-[22px] w-[22px]" strokeWidth={2.5} />
          </ProfileAction>
          <ProfileAction label="Check-in" onClick={() => onNavigate("streaks")}>
            <span className="relative flex items-center justify-center">
              <CalendarCheck className="h-[22px] w-[22px]" strokeWidth={2.5} />
              {!checkedInToday && (
                <span className="absolute -right-1.5 -top-1.5 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--theme-primary)] opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-black bg-[var(--theme-primary)]" />
                </span>
              )}
            </span>
          </ProfileAction>
          <ProfileAction label="Gift code" onClick={() => setShowGiftCodeSheet(true)}>
            <span className="relative flex items-center justify-center">
              <Gift className="h-[22px] w-[22px]" strokeWidth={2.5} />
              {giftAvailable && (
                <span className="absolute -right-1.5 -top-1.5 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--theme-primary)] opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-black bg-[var(--theme-primary)]" />
                </span>
              )}
            </span>
          </ProfileAction>
          <ProfileAction label="Wallet" onClick={() => onNavigate("account")}>
            <CreditCard className="h-[22px] w-[22px]" strokeWidth={2.5} />
          </ProfileAction>
          <ProfileAction label="Guide" onClick={() => onNavigate("guide")}>
            <Info className="h-[22px] w-[22px]" strokeWidth={2.5} />
          </ProfileAction>

          {/* Conditional extras join the same grid rather than crowding a header. */}
          {!isInstalled ? (
            <ProfileAction
              label="Install app"
              onClick={async () => {
                if (canInstall) {
                  const accepted = await install();
                  if (!accepted) toast.info("Installation was cancelled.");
                  return;
                }
                // No deferred prompt available. iOS has no install API at all,
                // so "use the browser menu" is the only honest answer there;
                // elsewhere the event usually just has not fired yet.
                if (platform === "Safari iOS") {
                  toast.info("Tap Share, then Add to Home Screen.", { duration: 6000 });
                } else {
                  toast.info("Use your browser's Install app / Add to Home screen option.");
                }
              }}
            >
              <Download className="h-[22px] w-[22px]" strokeWidth={2.5} />
            </ProfileAction>
          ) : null}
          {siteConfig?.telegramLink ? (
            <ProfileAction label="Telegram" href={siteConfig.telegramLink}>
              <img src="/telegram.svg" alt="" aria-hidden="true" className="h-[22px] w-[22px] object-contain" />
            </ProfileAction>
          ) : null}
          {siteConfig?.whatsappLink ? (
            <ProfileAction label="WhatsApp" href={siteConfig.whatsappLink}>
              <img src="/whatsapp.svg" alt="" aria-hidden="true" className="h-[22px] w-[22px] object-contain" />
            </ProfileAction>
          ) : null}
        </div>
      </div>

                {/* Defined Logout Button */}
        <div className="pt-2 flex items-center justify-between">
          <button
            onClick={onLogout}
            className="w-full py-3 px-4 rounded-[var(--theme-radius)] bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 flex items-center justify-center gap-2 text-xs font-sans font-extrabold transition-all cursor-pointer active:scale-98 shadow-xs"
          >
            <LogOut className="w-4.5 h-4.5" />
            <span>Logout</span>
          </button>
        </div>

            {/* Gift Code Modal */}
            <AnimatePresence>
              {showGiftCodeSheet && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={() => setShowGiftCodeSheet(false)} />
                  <motion.div initial={{ scale: 0.94, y: 15, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.94, y: 15, opacity: 0 }} transition={{ type: "spring", damping: 25, stiffness: 350 }} className="relative w-full max-w-[345px] theme-card card-playful-3d bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)] rounded-[var(--theme-radius)] p-6 shadow-2xl">
                    <button onClick={() => setShowGiftCodeSheet(false)} aria-label="Close gift code" className="absolute right-4 top-4 text-[var(--theme-text)] opacity-60 hover:opacity-100 p-1.5 rounded-full bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] transition-all active:scale-95 cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                    <div className="flex flex-col items-center justify-center mb-5 mt-1">
                      <span className="w-20 h-20 rounded-[22px]   flex items-center justify-center mb-3">
                        <img src={gift3d2} alt="" className="w-12 h-12 object-contain drop-shadow-sm" loading="lazy" decoding="async" />
                      </span>
                      <h3 className="text-lg font-display font-black text-[var(--theme-text)] tracking-tight">Gift code</h3>
                      <p className="text-[12px] text-[var(--theme-text)] opacity-70 mt-1 text-center font-sans leading-relaxed">Enter the code shared with you, the bonus lands in your withdrawable balance. </p>
                    </div>
                    <form onSubmit={handleRedeemGiftCode} className="space-y-4">
                      <div>

                        <input
                          id="gift-code-input"
                          type="text"
                          required
                          autoComplete="off"
                          autoCapitalize="characters"
                          spellCheck={false}
                          value={giftCodeValue}
                          onChange={e => setGiftCodeValue(e.target.value.toUpperCase())}
                          placeholder="ENTER CODE"
                          className="w-full px-4 py-3.5 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] text-sm font-display font-black text-center tracking-[0.2em] text-[var(--theme-text)] outline-none focus:border-[var(--theme-primary)] uppercase transition-all shadow-inner placeholder-[var(--theme-text)]/40"
                        />
                      </div>
                      <Button
                        variant="primary"
                        size="md"
                        type="submit"
                        loading={isRedeemingGiftCode}
                        disabled={!giftCodeValue.trim()}
                        className="w-full"
                      >
                        <Gift className="w-4 h-4" /> Redeem gift
                      </Button>
                    </form>

                  </motion.div>
                </div>
              )}
            </AnimatePresence>



            {/* Daily Check-in lives on the Streaks page now */}





{/* ================= SHEETS & DRAWERS OVERLAYS ================= */}

      {/* 3. Transaction History Sheet */}
      <AnimatePresence>
        {showHistorySheet && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            />
            {/* Sheet - 92vh height */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 220 }}
              className="relative w-full max-w-md h-[92vh] max-h-[92vh] bg-[var(--theme-card-bg)] border-t border-[var(--theme-card-border)] text-[var(--theme-text)] rounded-t-[32px] p-6 pb-8 flex flex-col z-10 overflow-hidden shadow-2xl"
            >
              {/* Header */}
              <div className="flex justify-between items-center pb-3 border-b border-[var(--theme-card-border)] shrink-0 mb-3">
                <h4 className="font-display font-black text-xl text-[var(--theme-text)] tracking-tight">Transaction History</h4>
                <button
                  onClick={() => setShowHistorySheet(false)}
                  className="btn-3d-secondary p-2 rounded-full border border-[var(--theme-card-border)] text-[var(--theme-text)] cursor-pointer focus:outline-none"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Filter Tabs Bar */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none shrink-0">
                {[
                  { id: "all", label: "All" },
                  { id: "deposit", label: "Recharge" },
                  { id: "withdraw", label: "Withdrawal" },
                  { id: "product", label: "Product" },
                  { id: "yield", label: "Yield" },
                  { id: "referral", label: "Referral" },
                  { id: "checkin", label: "Check-in" },
                  { id: "voucher", label: "Voucher" },
                  { id: "vip_task", label: "VIP Tasks" }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setHistoryFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-display font-black uppercase tracking-wider shrink-0 transition-all cursor-pointer ${
                      historyFilter === tab.id
                        ? "btn-3d-primary text-white shadow-md"
                        : "btn-3d-secondary text-[var(--theme-text)] border border-[var(--theme-card-border)]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* History listing body */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-none pb-4">
                {txLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 space-y-2">
                    <Loader2 className="w-6 h-6 animate-spin text-[var(--theme-primary)]" />
                    <span className="text-xs text-[var(--theme-text)] opacity-70 font-sans font-medium">Syncing transactions...</span>
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-20 space-y-2">
                    <AlertTriangle className="w-8 h-8 mx-auto text-[var(--theme-text)] opacity-40" />
                    <span className="text-xs font-sans text-[var(--theme-text)] block font-extrabold uppercase">NO TRANSACTIONS SECURED</span>
                    <p className="text-[12px] text-[var(--theme-text)] opacity-60 max-w-[220px] mx-auto font-sans">No activity found for this category yet.</p>
                  </div>
                ) : (
                  transactions
                    .filter((tx) => {
                      if (historyFilter === "all") return true;
                      const canon = canonicalTypeOf(tx.type, tx.metadata) as string;
                      if (historyFilter === "deposit") return canon === "deposit";
                      if (historyFilter === "withdraw") return canon === "withdrawal";
                      if (historyFilter === "product") return canon === "product_activation";
                      if (historyFilter === "yield") return canon === "daily_yield";
                      if (historyFilter === "checkin") return canon === "daily_checkin_bonus";
                      if (historyFilter === "referral") return canon === "referral_signup_bonus" || canon === "referral_level_income";
                      if (historyFilter === "voucher") return canon === "gift_code";
                      if (historyFilter === "vip_task") return canon === "vip_task";
                      if (historyFilter === "registration_bonus") return canon === "registration_bonus";
                      return true;
                    })
                    .map((tx) => {
                      const canon = canonicalTypeOf(tx.type, tx.metadata) as string;
                      const txStatus = String(tx.status || "").toUpperCase();
                      const isPositive = isPositiveTransaction(tx.type, tx.metadata);

                      const { fee: feeAmount, payout: payoutAmount } = getWithdrawalDisplayAmounts(tx);
                      const meta = getTransactionDisplayMeta(tx.type, tx.metadata);

                      let badgeLabel = meta.label;
                      let badgeStyle = "bg-blue-500/15 text-blue-500 border-blue-500/30";
                      let IconComponent = Coins;

                      if (canon === "deposit") {
                        badgeLabel = "Recharge";
                        badgeStyle = "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
                        IconComponent = ArrowDownLeft;
                      } else if (canon === "withdrawal") {
                        badgeLabel = "Withdrawal";
                        badgeStyle = "bg-rose-500/15 text-rose-500 border-rose-500/30";
                        IconComponent = ArrowUpRight;
                      } else if (canon === "product_activation") {
                        badgeLabel = meta.isProductWithName && meta.productName ? meta.productName : "Product Rental";
                        badgeStyle = "bg-blue-500/15 text-blue-500 border-blue-500/30";
                        IconComponent = Cpu;
                      } else if (canon === "daily_yield") {
                        badgeLabel = "Daily Yield";
                        badgeStyle = "bg-amber-500/15 text-amber-500 border-amber-500/30";
                        IconComponent = Flame;
                      } else if (canon === "daily_checkin_bonus") {
                        badgeLabel = "Daily Check-in";
                        badgeStyle = "bg-amber-500/15 text-amber-500 border-amber-500/30";
                        IconComponent = Flame;
                      } else if (canon === "registration_bonus") {
                        badgeLabel = "Registration Bonus";
                        badgeStyle = "bg-teal-500/15 text-teal-500 border-teal-500/30";
                        IconComponent = CheckCircle2;
                      } else if (canon === "referral_signup_bonus") {
                        badgeLabel = "Referral Bonus";
                        badgeStyle = "bg-purple-500/15 text-purple-500 border-purple-500/30";
                        IconComponent = Users;
                      } else if (canon === "referral_level_income") {
                        badgeLabel = `Referral L${meta.level ?? "?"}`;
                        badgeStyle = "bg-purple-500/15 text-purple-500 border-purple-500/30";
                        IconComponent = Users;
                      } else if (canon === "gift_code") {
                        badgeLabel = "Gift Code";
                        badgeStyle = "bg-indigo-500/15 text-indigo-500 border-indigo-500/30";
                        IconComponent = Gift;
                      } else if (canon === "vip_task") {
                        badgeLabel = "VIP Task";
                        badgeStyle = "bg-yellow-500/15 text-yellow-500 border-yellow-500/30";
                        IconComponent = Trophy;
                      }

                      return (
                        <div key={tx.id || Math.random()} className="bg-[var(--theme-bg)]/40 border border-[var(--theme-card-border)] p-3.5 rounded-[var(--theme-radius)] flex justify-between items-center transition-all">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-sans font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full border flex items-center gap-1 ${badgeStyle}`}>
                                <IconComponent className="w-3 h-3 inline" />
                                <span>{badgeLabel}</span>
                              </span>
                            </div>

                            {(tx.title || tx.senderPhone || tx.withdrawPhone) && (
                              <p className="text-[12px] text-[var(--theme-text)] font-sans font-bold truncate max-w-[170px] mt-1">
                                {tx.title || tx.withdrawPhone || tx.senderPhone}
                              </p>
                            )}

                            <p className="text-[11px] text-[var(--theme-text)] opacity-60 font-sans font-medium">
                              {new Date(tx.createdAt || tx.timestamp || 0).toLocaleDateString()} at {new Date(tx.createdAt || tx.timestamp || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>

                          <div className="text-right space-y-0.5">
                            <span className={`text-xs font-sans font-black ${isPositive ? "text-emerald-500" : "text-[var(--theme-text)]"}`}>
                              {isPositive ? "+" : "-"} {formatCurrency(canon === "withdrawal" ? payoutAmount : (tx.amount || 0))}
                            </span>

                            {canon === "withdrawal" && feeAmount > 0 && (
                              <p className="text-[11px] text-[var(--theme-text)] opacity-60 font-sans font-medium">
                                Fees: {formatCurrency(feeAmount)}
                              </p>
                            )}

                            {((tx.operator === "USDT" || tx.withdrawOperator === "USDT" || (tx.senderPhone || "").startsWith("T")) && siteConfig?.usdtRate) && (
                              <p className="text-[11px] font-sans text-[var(--theme-primary)] font-bold">
                                ≈ ${((canon === "withdrawal" ? payoutAmount : (tx.amount || 0)) / siteConfig.usdtRate).toFixed(2)} USDT
                              </p>
                            )}

                            <p className={`text-[11px] font-sans font-extrabold ${
                              txStatus === "SUCCESSFUL" || txStatus === "COMPLETED" ? "text-emerald-500" : txStatus === "PENDING" || txStatus === "PROCESSING" ? "text-amber-500 animate-pulse" : "text-rose-500"
                            }`}>
                              {txStatus || "COMPLETED"}
                            </p>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
