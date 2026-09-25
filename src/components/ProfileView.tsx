/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
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
  UserPlus,
  Users,
  MessageSquare,
  Gift,
  CalendarCheck,
  Calendar,
  Lock,
  Download,
  RefreshCw,
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
  Coins,
  Cpu,
  Trophy
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import history3d from "@/src/assets/3d/3dicons-calender-iso-premium.png"; // lazy via img attrs
import dollar3d from "@/src/assets/3d/3dicons-dollar-iso-premium.png";
import invite3d from "@/src/assets/3d/3dicons-link-iso-premium.png";
import vip3d from "@/src/assets/3d/3dicons-trophy-iso-premium.png";
import gift3d2 from "@/src/assets/3d/3dicons-gift-box-iso-premium.png";
import checkin3d from "@/src/assets/3d/3dicons-calendar-iso-premium.png";
import install3d from "@/src/assets/3d/3dicons-rocket-iso-premium.png";
import bank3d from "@/src/assets/3d/3dicons-wallet-iso-premium.png";
import update3d from "@/src/assets/3d/3dicons-tools-iso-premium.png";
import guide3d from "@/src/assets/3d/3dicons-pencil-iso-premium.png";
import community3d from "@/src/assets/3d/3dicons-megaphone-iso-premium.png";
import lab3d from "@/src/assets/3d/3dicons-lab-iso-premium.png";
import { Button } from "./ui/button";
import { useShimmerPulse } from "../hooks/useShimmerPulse";
import confetti from "canvas-confetti";
import NewsCarousel from "./NewsCarousel";
import VisaMetricCard from "./VisaMetricCard";
import CommunitySheet from "./CommunitySheet";

interface ProfileViewProps {
  userProfile: UserProfile;
  siteConfig?: any;
  activeNodes?: SubscribedNode[];
  notifications?: any[];
  onProfileUpdate: (newProfile: UserProfile) => void;
  onNavigateToDeposit: () => void;
  onNavigateToWithdraw?: () => void;
  onNavigate: (tab: "dashboard" | "catalog" | "income" | "history" | "referral" | "chat" | "profile" | "account" | "guide" | "deposit" | "withdraw" | "alerts" | "vip" | "arcade", chatRoom?: "shared" | "admin") => void;
  onLogout: () => void;
  autoOpenWithdraw?: boolean;
  onCloseAutoWithdraw?: () => void;
}

export default function ProfileView({
  userProfile,
  siteConfig,
  activeNodes = [],
  notifications = [],
  onProfileUpdate,
  onNavigateToDeposit,
  onNavigateToWithdraw,
  onNavigate,
  onLogout,
  autoOpenWithdraw,
  onCloseAutoWithdraw
}: ProfileViewProps) {

  const { formatCurrency, currency } = useCurrency();

  const [showGiftCodeSheet, setShowGiftCodeSheet] = useState(false);
  const [giftCodeValue, setGiftCodeValue] = useState("");
  const [isRedeemingGiftCode, setIsRedeemingGiftCode] = useState(false);

  const [showCheckinSheet, setShowCheckinSheet] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [spinningIndex, setSpinningIndex] = useState<number | null>(null);

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

  // Manual app-update check (pairs with the auto UpdateBanner).
  const [updateState, setUpdateState] = useState<"idle" | "checking" | "ready" | "uptodate" | "unsupported">("idle");
  const [updateCheckedAt, setUpdateCheckedAt] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem("app_update_last_checked");
      return raw ? Number(raw) : null;
    } catch { return null; }
  });

  useEffect(() => {
    if (!("serviceWorker" in navigator)) { setUpdateState("unsupported"); return; }
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return; // dev / no worker yet — leave idle
      if (reg.waiting) setUpdateState("ready");
    }).catch(() => {});
  }, []);

  const updateAbortRef = useRef<AbortController | null>(null);
  const checkForAppUpdate = async () => {
    if (document.hidden) return;
    if (!("serviceWorker" in navigator)) {
      setUpdateState("unsupported");
      toast.info("Update checks need the installed production build.");
      return;
    }
    if (updateAbortRef.current) updateAbortRef.current.abort();
    const ctrl = new AbortController();
    updateAbortRef.current = ctrl;
    setUpdateState("checking");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg || ctrl.signal.aborted) {
        setUpdateState("unsupported");
        toast.info("Open the installed app to check.");
        return;
      }
      await reg.update().catch(() => {});
      await new Promise((r) => setTimeout(r, 1200));
      if (ctrl.signal.aborted) return;
      const fresh = await navigator.serviceWorker.getRegistration();
      const at = Date.now();
      try { localStorage.setItem("app_update_last_checked", String(at)); } catch {}
      setUpdateCheckedAt(at);
      if (fresh?.waiting) {
        setUpdateState("ready");
        toast.success("A new version is ready. Tap Apply to update.");
      } else {
        setUpdateState("uptodate");
        toast.success("You're on the latest version.");
      }
    } catch {
      if (ctrl.signal.aborted) return;
      setUpdateState("idle");
      toast.error("Could not check for updates. Try again.");
    }
  };

  const applyAppUpdate = () => {
    navigator.serviceWorker.getRegistration().then((reg) => {
      const waiting = reg?.waiting;
      if (!waiting) { window.location.reload(); return; }
      navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
      waiting.postMessage({ type: "SKIP_WAITING" });
      setTimeout(() => window.location.reload(), 2500);
    }).catch(() => window.location.reload());
  };

  useEffect(() => {
    // Just handle simple initialization if needed
  }, [platform]);

  const getDayIndex = () => {
    const day = new Date().getDay(); // 0 is Sun, 1 is Mon, ... 6 is Sat
    return day === 0 ? 6 : day - 1; // Map 0 (Sun) to 6, 1 to 0, 2 to 1, etc.
  };

  const todayStr = new Date().toISOString().split("T")[0];
  const checkedInToday = userProfile.lastCheckinDate === todayStr;
  // Hero label shimmer — same gated pulse as balances; ProfileView stays
  // mounted while the tab is open, so it dies off-page automatically.
  const heroPulse = useShimmerPulse();
  const currentStreak = userProfile.checkinStreak || 0;

  useEffect(() => {
    if (!checkedInToday) {
      if (document.hidden) return;
      const timer = setTimeout(() => {
        if (!document.hidden) setShowCheckinSheet(true);
      }, 5 * 60 * 1000);
      return () => clearTimeout(timer);
    }
  }, [checkedInToday]);

  // Canonical check-in economics — mirrors the server fallbacks in
  // dailyCheckin (base 1000 / increment 100). One pair everywhere so sheet
  // previews and actual payouts can never disagree.
  const baseBonus = (siteConfig?.checkinBaseBonus !== undefined && siteConfig?.checkinBaseBonus !== null) ? siteConfig.checkinBaseBonus : 1000;
  const increment = (siteConfig?.checkinIncrement !== undefined && siteConfig?.checkinIncrement !== null) ? siteConfig.checkinIncrement : 100;
  const withdrawalMode: "automatic" | "manual" = siteConfig?.allowAutoWithdraw === false ? "manual" : "automatic";
  const minimumWithdrawal = Number(siteConfig?.minimumWithdrawal) > 0 ? Math.floor(Number(siteConfig.minimumWithdrawal)) : 10_000;
  const maximumWithdrawal = siteConfig?.maximumWithdrawal === undefined || siteConfig?.maximumWithdrawal === null
    ? 5_000_000
    : (Number(siteConfig.maximumWithdrawal) > 0 ? Math.floor(Number(siteConfig.maximumWithdrawal)) : 0);

  // Month-run math. The server keeps streaks consecutive (a missed day
  // restarts at 1), so the current run is exactly: streak days ending today
  // (claimed) or yesterday (claimable). Every tile derives from this.
  const nowCal = new Date();
  const calMonthName = nowCal.toLocaleString("default", { month: "long" });
  const calYear = nowCal.getFullYear();
  const calDaysInMonth = new Date(calYear, nowCal.getMonth() + 1, 0).getDate();
  const calTodayDay = nowCal.getDate();
  const calFirstWeekday = new Date(calYear, nowCal.getMonth(), 1).getDay();
  // Streak number that today carries (claimed or about to be claimed).
  const calTodayStreak = checkedInToday ? currentStreak : currentStreak + 1;
  const calTodayAmount = baseBonus + (calTodayStreak - 1) * increment;
  // First day-of-month of the live run (<= 0 when the run started last month).
  const calRunStartDay = calTodayDay - calTodayStreak + 1;
  const calClaimedDays = Array.from({ length: calTodayDay }, (_, i) => i + 1)
    .filter((d) => d >= calRunStartDay && (d < calTodayDay || checkedInToday));
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
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsRedeemingGiftCode(false);
    }
  };

  const handleCheckin = async () => {
    if (isCheckingIn) return;
    setIsCheckingIn(true);
    setSpinningIndex(calTodayDay);
    const startTime = Date.now();
    try {
      const res = await fetch("/api/user/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: userProfile.phone })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to check in.");

      // Ensure spinner runs for at least 1500ms for a premium feel
      const elapsedTime = Date.now() - startTime;
      const minSpinTime = 1500;
      if (elapsedTime < minSpinTime) {
        await new Promise((resolve) => setTimeout(resolve, minSpinTime - elapsedTime));
      }

      const formattedAmount = formatCurrency(data.amount);
      const formattedNewBalance = formatCurrency(userProfile.points + data.amount);
      
      toast.success(`Checked in! You've claimed ${formattedAmount} for Day ${data.streak}! New balance: ${formattedNewBalance}${data.reset ? " Fresh streak started!" : ""}`);
      
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

      // Update profile locally (modal stays open — the user dismisses it)
      onProfileUpdate({
        ...userProfile,
        points: userProfile.points + data.amount,
        lastCheckinDate: new Date().toISOString().split("T")[0],
        checkinStreak: data.streak
      });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsCheckingIn(false);
      setSpinningIndex(null);
    }
  };

  // States to trigger minimal sheets
  const [showWithdrawSheet, setShowWithdrawSheet] = useState(false);

  const [showHistorySheet, setShowHistorySheet] = useState(false);
  const [showCommunitySheet, setShowCommunitySheet] = useState(false);

  // Withdraw form fields (bind-account settings moved to BindAccountView page)
  const [usdtAddress, setUsdtAddress] = useState(userProfile.usdtAddress || "");
  const [withdrawalPhone, setWithdrawalPhone] = useState(userProfile.phone || "");

  // Cashout request form fields
  const [pointsToWithdraw, setPointsToWithdraw] = useState<number>(0);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawOperator, setWithdrawOperator] = useState<"MTN" | "Airtel" | "USDT">(userProfile.operator || "MTN");

  // Transactions list
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<string>("all");

  // Sync profile details when userProfile changes
  useEffect(() => {
    if (userProfile) {
      setUsdtAddress(userProfile.usdtAddress || "");
      setWithdrawalPhone(userProfile.phone || "");
      setWithdrawOperator(userProfile.operator || "MTN");
    }
  }, [userProfile, showWithdrawSheet]);

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
        variant="bank-dark"
        leftLabel="Recharge balance"
        leftValue={`${currency === 'USD' ? '$' : 'UGX'} ${currency === 'USD' ? ((userProfile.rechargeBalance || 0) / 3700).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (userProfile.rechargeBalance || 0).toLocaleString()}`}
        rightLabel="Withdrawable"
        rightValue={`${currency === 'USD' ? '$' : 'UGX'} ${currency === 'USD' ? ((userProfile.points || 0) / 3700).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (userProfile.points || 0).toLocaleString()}`}
      />
      <div className="grid grid-cols-2 gap-2 bg-transparent border-0 p-0">
        <Button variant="gold-glossy" size="sm" onClick={onNavigateToDeposit} className="w-full" glow={false}>
          <ArrowDownLeft className="w-4 h-4" /> Deposit
        </Button>
        <Button variant="gold-matte" size="sm" onClick={() => (onNavigateToWithdraw ? onNavigateToWithdraw() : setShowWithdrawSheet(true))} className="w-full" glow={false}>
          <ArrowUpRight className="w-4 h-4" /> Withdraw
        </Button>
      </div>

        {/* More Actions — frosted container with flat 3D icons */}
        <div className="bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-[24px] p-4 space-y-4">
          <h4 className="font-display font-black text-xs uppercase tracking-wider text-[var(--theme-text)] opacity-70">More Actions</h4>
          <div id="quick-action-menu-grid" className="grid grid-cols-4 gap-x-2 gap-y-5">
            <button onClick={() => onNavigate("history")} className="flex flex-col items-center gap-1.5 focus:outline-none group">
              <img src={history3d} loading="lazy" decoding="async" alt="" className="w-12 h-12 object-contain drop-shadow-sm" />
              <span className="text-[11px] font-sans text-[var(--theme-text)] font-extrabold tracking-wide">History</span>
            </button>
            <button onClick={() => onNavigate("referral")} className="flex flex-col items-center gap-1.5 focus:outline-none group">
              <img src={invite3d} alt="" loading="lazy" decoding="async" className="w-12 h-12 object-contain drop-shadow-sm" />
              <span className="text-[11px] font-sans text-[var(--theme-text)] font-extrabold tracking-wide">Team Invite</span>
            </button>
            <button onClick={() => setShowCommunitySheet(true)} className="flex flex-col items-center gap-1.5 focus:outline-none group">
              <img src={community3d} alt="" loading="lazy" decoding="async" className="w-12 h-12 object-contain drop-shadow-sm" />
              <span className="text-[11px] font-sans text-[var(--theme-text)] font-extrabold tracking-wide">Community</span>
            </button>
            <button onClick={() => onNavigate("vip")} className="flex flex-col items-center gap-1.5 focus:outline-none group">
              <img src={vip3d} alt="" loading="lazy" decoding="async" className="w-12 h-12 object-contain drop-shadow-sm" />
              <span className="text-[11px] font-sans text-[var(--theme-text)] font-extrabold tracking-wide">VIP Tasks</span>
            </button>
            <button onClick={() => setShowGiftCodeSheet(true)} className="flex flex-col items-center gap-1.5 focus:outline-none group">
              <img src={gift3d2} alt="" className="w-12 h-12 object-contain drop-shadow-sm" />
              <span className="text-[11px] font-sans text-[var(--theme-text)] font-extrabold tracking-wide">Gift Code</span>
            </button>
            <button onClick={() => setShowCheckinSheet(true)} className="relative flex flex-col items-center gap-1.5 focus:outline-none group">
              {!checkedInToday && (
                <span className="absolute -top-1 right-2 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--theme-primary)] opacity-60"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--theme-primary)] border-2 border-[var(--theme-bg)]"></span>
                </span>
              )}
              <img src={checkin3d} alt="" className="w-12 h-12 object-contain drop-shadow-sm" />
              <span className="text-[11px] font-sans text-[var(--theme-text)] font-extrabold tracking-wide">Check-in</span>
              {!checkedInToday && (
                <span className="text-[10px] font-black text-[var(--theme-primary)] leading-none">UGX {compactUgx(calTodayAmount)}</span>
              )}
          </button>

            <button onClick={async () => {
              if (isInstalled) { toast.success("App is already installed and running!"); } else if (canInstall) { const accepted = await install(); if (!accepted) toast.info("Installation was cancelled."); } else { toast.info("Automatic install is unavailable. Use browser install menu."); }
            }} className="flex flex-col items-center gap-1.5 focus:outline-none group">
              <img src={install3d} alt="" className="w-12 h-12 object-contain drop-shadow-sm" />
              <span className="text-[11px] font-sans text-[var(--theme-text)] font-extrabold tracking-wide">{isInstalled ? "Installed" : "Install App"}</span>
            </button>
            <button onClick={() => onNavigate("account")} className="flex flex-col items-center gap-1.5 focus:outline-none group">
              <img src={bank3d} alt="" className="w-12 h-12 object-contain drop-shadow-sm" />
              <span className="text-[11px] font-sans text-[var(--theme-text)] font-extrabold tracking-wide">Bank Account</span>
            </button>
            <button onClick={() => onNavigate("guide")} className="flex flex-col items-center gap-1.5 focus:outline-none group">
              <img src={guide3d} alt="" loading="lazy" decoding="async" className="w-12 h-12 object-contain drop-shadow-sm" />
              <span className="text-[11px] font-sans text-[var(--theme-text)] font-extrabold tracking-wide">Guide</span>
            </button>
            <button onClick={() => onNavigate("arcade")} className="flex flex-col items-center gap-1.5 focus:outline-none group">
              <img src={lab3d} alt="" loading="lazy" decoding="async" className="w-12 h-12 object-contain drop-shadow-sm" />
              <span className="text-[11px] font-sans text-[var(--theme-text)] font-extrabold tracking-wide">Experimental</span>
            </button>
          </div>
          <div className="h-px bg-[var(--theme-card-border)]/60" />
          {/* App updates — inside frosted container */}
          <div className="flex items-center gap-3">
          <div className="flex items-center justify-center shrink-0">
            <img src={update3d} alt="" className="w-10 h-10 object-contain shrink-0 drop-shadow-sm" />
            <RefreshCw className={`w-5 h-5 text-[var(--theme-primary)] ${updateState === "checking" ? "animate-spin" : "hidden"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-display font-black text-[var(--theme-text)] leading-none">Software updates</p>
            <p className="text-[11px] font-sans font-bold text-[var(--theme-text)] opacity-60 leading-none mt-1.5 truncate">
              {updateState === "checking" ? "Checking…" :
               updateState === "ready" ? "New version available" :
               updateState === "uptodate" ? "Up to date" :
               updateState === "unsupported" ? "Install the app to enable updates" :
               isInstalled ? "Installed" : "Not installed"}
              {updateCheckedAt ? ` • checked ${new Date(updateCheckedAt).toLocaleDateString()} ${new Date(updateCheckedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
            </p>
          </div>
          {updateState === "ready" ? (
            <button
              onClick={applyAppUpdate}
              className="shrink-0 px-4 py-2 rounded-xl bg-[var(--theme-primary)] text-white text-[11px] font-black uppercase tracking-wide shadow-[0_3px_0_0_var(--theme-primary-shadow)] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
            >
              Apply
            </button>
          ) : (
            <button
              onClick={checkForAppUpdate}
              disabled={updateState === "checking"}
              className="shrink-0 px-4 py-2 rounded-full bg-[var(--theme-primary)]/12 border border-[var(--theme-primary)]/20 text-[var(--theme-primary)] text-[11px] font-black uppercase tracking-wide hover:bg-[var(--theme-primary)]/20 transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {updateState === "checking" ? "…" : "Check"}
            </button>
          )}
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
                    <button onClick={() => setShowGiftCodeSheet(false)} className="absolute right-4 top-4 text-[var(--theme-text)] opacity-60 hover:opacity-100 p-1.5 rounded-full btn-3d-secondary border border-[var(--theme-card-border)] transition-colors cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                    <div className="flex flex-col items-center justify-center mb-5 mt-1">
                      <img src={gift3d2} alt="" className="w-14 h-14 object-contain drop-shadow-sm mb-3" loading="lazy" decoding="async" />
                      <h3 className="text-lg font-display font-black text-[var(--theme-text)] tracking-tight">Gift code</h3>
                      <p className="text-[12px] text-[var(--theme-text)] opacity-70 mt-1 text-center font-sans">Enter your code below</p>
                    </div>
                    <form onSubmit={handleRedeemGiftCode} className="space-y-4">
                      <div>
                        <input
                          type="text"
                          required
                          value={giftCodeValue}
                          onChange={e => setGiftCodeValue(e.target.value.toUpperCase())}
                          placeholder="ENTER CODE"
                          className="w-full px-4 py-3 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] text-sm font-display font-black text-center tracking-[0.2em] text-[var(--theme-text)] outline-none focus:border-[var(--theme-primary)] uppercase transition-all shadow-inner placeholder-[var(--theme-text)]/40"
                        />
                      </div>
                    <Button
                      variant="gold-glossy"
                      size="sm"
                      type="submit"
                      loading={isRedeemingGiftCode}
                      disabled={!giftCodeValue}
                      className="w-full"
                      glow={false}
                    >
                      get gift
                    </Button>
                    </form>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>



            {/* Daily Check-in Modal (30-Day Calendar matching inspiration screenshot) */}
            <AnimatePresence>
              {showCheckinSheet && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4">
                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }} 
                    className="absolute inset-0 bg-black/75 backdrop-blur-xs" 
                    onClick={() => setShowCheckinSheet(false)} 
                  />
                  <motion.div 
                    initial={{ scale: 0.94, y: 15, opacity: 0 }} 
                    animate={{ scale: 1, y: 0, opacity: 1 }} 
                    exit={{ scale: 0.94, y: 15, opacity: 0 }} 
                    transition={{ type: "spring", damping: 26, stiffness: 360 }} 
                    className="relative w-full max-w-[440px] max-h-[90vh] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] rounded-[24px] shadow-2xl text-[var(--theme-text)] text-left flex flex-col overflow-hidden backdrop-blur-xl"
                  >
                    {/* Top Banner - Theme Aware */}
                    <div className=" relative px-5 py-4 text-[var(--theme-text)] flex flex-col gap-3 shrink-0">
                      <button 
                        onClick={() => setShowCheckinSheet(false)} 
                        className="absolute right-4 top-4 text-[var(--theme-text)] opacity-60 hover:opacity-100 p-2 rounded-full hover:bg-[var(--theme-bg)] transition-colors cursor-pointer"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      <div className="flex items-center gap-3">
                        <img src={checkin3d} alt="" className="w-11 h-11 object-contain drop-shadow-sm" loading="lazy" decoding="async" />
                        <h3 className="font-display font-black text-xl tracking-tight text-[var(--theme-text)]">Daily check-in</h3>
                      </div>
                    </div>

                    <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-5 scrollbar-none">
                      {/* Hero Reward — today's payout */}
                      <div className="rounded-2xl px-4 py-3.5 flex items-center justify-center gap-3">
                        <img src={dollar3d} alt="" loading="lazy" decoding="async" className={`w-12 h-12 object-contain drop-shadow-lg shrink-0${checkedInToday ? " opacity-40 saturate-50" : ""}`} />
                        <div className="min-w-0">
                          <p className={`text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-primary)] leading-none${heroPulse ? " animate-shimmer-slow" : ""}`}>
                            {checkedInToday ? "Come back tomorrow" : `Day ${calTodayStreak} reward`}
                          </p>
                          <p className="font-display font-black text-2xl text-[var(--theme-text)] tracking-tight leading-none mt-1.5">
                            {formatCurrency(calTodayAmount)}
                          </p>
                        </div>
                      </div>

                      {/* Month & Count Header */}
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between px-1">
                              <span className="font-display font-black text-xs text-[var(--theme-text)]">
                                {calMonthName} {calYear}
                              </span>
                              <span className="bg-transparent text-[var(--theme-primary)] border border-[var(--theme-primary)] font-sans text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                                {calClaimedDays.length} / {calDaysInMonth}
                              </span>
                            </div>

                            {/* Calendar Grid — bare tiles on the modal */}
                            <div className="rounded-2xl p-2.5 space-y-1.5">
                              {/* Weekdays Row */}
                              <div className="grid grid-cols-7 gap-1 text-center font-sans font-bold text-[10px] text-[var(--theme-text)] opacity-60 pb-1">
                                <div>S</div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div>
                              </div>

                              {/* Days Grid */}
                              <div className="grid grid-cols-7 gap-1">
                                {/* Empty offset slots */}
                                {Array.from({ length: calFirstWeekday }).map((_, i) => (
                                  <div key={`empty-${i}`} className="w-full aspect-square" />
                                ))}

                                {/* Day cards 1 to daysInMonth */}
                                {Array.from({ length: calDaysInMonth }).map((_, i) => {
                                  const dayNum = i + 1;
                                  const isToday = dayNum === calTodayDay;
                                  const isFuture = dayNum > calTodayDay;
                                  // In-run days up to today are claimed (today only if done).
                                  const isClaimed = !isFuture && dayNum >= calRunStartDay && (!isToday || checkedInToday);
                                  const isMissed = !isFuture && !isToday && !isClaimed;
                                  const claimable = isToday && !checkedInToday;

                                  return (
                                    <div
                                      key={`day-${dayNum}`}
                                      onClick={() => {
                                        if (claimable && spinningIndex === null) {
                                          handleCheckin();
                                        }
                                      }}
                                      className={`aspect-square rounded-xl relative flex items-center justify-center transition-all select-none ${
                                        claimable ? "cursor-pointer ring-2 ring-[var(--theme-primary)] bg-[var(--theme-primary)]/10" : ""
                                      }`}
                                    >
                                      {spinningIndex !== null && isToday ? (
                                        <Loader2 className="w-5 h-5 animate-spin text-[var(--theme-primary)]" />
                                      ) : (
                                        <img
                                          src={dollar3d}
                                          alt=""
                                          loading="lazy"
                                          decoding="async"
                                          className={`w-9 h-9 object-contain drop-shadow ${
                                            claimable
                                              ? "animate-pulse"
                                              : isClaimed
                                                ? ""
                                                : isMissed
                                                  ? "opacity-60"
                                                  : "opacity-40 saturate-50"
                                          }`}
                                        />
                                      )}
                                      {isMissed && (
                                        <div className="absolute inset-0 rounded-xl bg-red-500/45 pointer-events-none" />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                      {/* Tiles handle claim directly */}
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>





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

      {/* 3.5 Community Sheet — shared with DashboardView */}
      <CommunitySheet open={showCommunitySheet} onClose={() => setShowCommunitySheet(false)} siteConfig={siteConfig} />
    </div>
  );
}
