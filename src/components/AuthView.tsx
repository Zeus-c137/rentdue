/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { UserProfile, SubscriptionItem } from "../types";
import {
  Phone,
  Lock,
  Eye,
  EyeOff,
  User,
  ChevronLeft,
  ChevronDown,
  ArrowRight,
  Gift,
  Link2,
  Mail,
  Send,
  CheckCircle2,
  X,
  Info,
  Bot,
  CalendarDays,
  ArrowUpRight,
  Activity,
  BarChart3,
  Gauge,
  ShieldCheck,
  AlertTriangle,
  Layers,
  Wallet,
  LineChart,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { BrandLogo } from "./BrandLogo";
import { fixGitHubImageUrl } from "../utils/imageUtils";
import TelegramLoginButton from "./TelegramLoginButton";
import { useTelegramLogin } from "../hooks/useTelegramLogin";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { TradingViewWidget } from "./TradingViewWidget";

interface AuthViewProps {
  onAuthSuccess: (profile: UserProfile) => void;
  siteConfig?: any;
}

type AuthScreen = "welcome" | "login" | "register" | "support";

const PHONE_PATTERN = /^\d{9,10}$/;

/* ------------------------------------------------------------------ *
 * Landing content
 * ------------------------------------------------------------------ */

const MARKETS = [
  {
    title: "Forex",
    copy: "Major and minor pairs, tracked around the clock while your cycle runs.",
    icon: LineChart,
  },
  {
    title: "Stocks",
    copy: "Blue-chip and growth listings, followed by strategies built for them.",
    icon: BarChart3,
  },
  {
    title: "CFDs",
    copy: "Go long or short on price movement without owning the asset.",
    icon: Activity,
  },
  {
    title: "Gold & Commodities",
    copy: "Hard assets that behave differently from every chart on your screen.",
    icon: Layers,
  },
];

const STEPS = [
  {
    title: "Create your account",
    copy: "Register with a phone number and password. No paperwork, no waiting room.",
    icon: User,
  },
  {
    title: "Fund your balance",
    copy: "Deposit once. Your balance is the only thing every strategy draws from.",
    icon: Wallet,
  },
  {
    title: "Start a cycle",
    copy: "Pick a strategy, choose a duration, and let the cycle run its course.",
    icon: Bot,
  },
];

const VISIBILITY = [
  {
    title: "Clear cycle details",
    copy: "Duration, allocation and expected daily yield are on the card before you commit.",
    icon: Gauge,
  },
  {
    title: "Performance tracking",
    copy: "Follow every cycle from the dashboard. Numbers update as the cycle moves.",
    icon: BarChart3,
  },
  {
    title: "Cycle status",
    copy: "Running, completed or closed. You always know where a cycle stands.",
    icon: Activity,
  },
  {
    title: "Transparent terms",
    copy: "What a cycle pays and when it ends is written down, not implied.",
    icon: ShieldCheck,
  },
];

const NAV_ITEMS = [
  { label: "Markets", id: "markets" },
  { label: "Strategies", id: "bots" },
  { label: "Cycles", id: "cycles" },
  { label: "Live", id: "markets-live" },
  { label: "FAQ", id: "faq" },
];

// Live market tape. Kept narrow on purpose — it is a pulse, not a data table.
const TICKER_SYMBOLS =
  "FOREXCOM:SPXUSD,FOREXCOM:NSXUSD,FOREXCOM:DJI,FX:EURUSD,BITSTAMP:BTCUSD,BITSTAMP:ETHUSD,CMCMARKETS:GOLD";

const FAQS = [
  {
    q: "What exactly am I buying?",
    a: "You are renting a strategy for a fixed number of days. The card shows the allocation, the daily yield and the duration before you confirm.",
  },
  {
    q: "When do returns show up?",
    a: "Returns accrue daily while the cycle is running and land in your balance. You can keep them or withdraw once you meet the minimum.",
  },
  {
    q: "What happens when a cycle ends?",
    a: "The cycle closes, the allocation is released back to you, and the strategy stops. You can start a new one whenever you want.",
  },
  {
    q: "Can I run more than one cycle?",
    a: "Yes. Your balance can be split across several cycles at once, as long as each one meets its own minimum allocation.",
  },
  {
    q: "Is there a minimum deposit?",
    a: "There is a minimum balance before you can start a cycle. The exact figure is shown on the register screen and inside the dashboard.",
  },
  {
    q: "How do withdrawals work?",
    a: "Withdrawals are requested from your balance and reviewed by the team. Support can walk you through the first one.",
  },
  {
    q: "Do I need to keep the app open?",
    a: "No. Cycles run on our side. Check in whenever you like, and collect your returns when you do.",
  },
];

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

function AuthField({
  icon,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-text)] opacity-40 pointer-events-none">
        {icon}
      </span>
      <input
        {...props}
        className={`w-full pl-12 pr-12 py-4 bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] rounded-2xl text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] text-[15px] font-sans font-medium outline-none transition-colors focus:border-[var(--theme-primary)] select-text ${className ?? ""}`}
      />
    </div>
  );
}

function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="w-full py-4 px-6 rounded-2xl bg-[var(--theme-primary)] text-[var(--theme-on-primary)] font-sans font-bold text-[15px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_0_0_var(--theme-primary-shadow)] active:shadow-none active:translate-y-[3px]"
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="w-full py-4 px-6 rounded-2xl border border-[var(--theme-card-border)] text-[var(--theme-text)] font-sans font-semibold text-[15px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] bg-transparent"
    >
      {children}
    </button>
  );
}

/** Section eyebrow + heading + optional lede. Shared by every landing band. */
function SectionHead({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-[11px] font-sans font-black uppercase tracking-[0.16em] text-[var(--theme-primary)]">
        {eyebrow}
      </p>
      <h2 className="mt-3 font-display font-black text-[30px] leading-[1.1] tracking-tight sm:text-[38px]">
        {title}
      </h2>
      {lede ? (
        <p className="mt-4 text-[15px] font-sans leading-relaxed text-[var(--theme-text-muted)] sm:text-base">
          {lede}
        </p>
      ) : null}
    </div>
  );
}

/** Scroll-reveal wrapper: opacity + 12px rise, once, skipped for reduced motion. */
function Reveal({
  children,
  delay = 0,
  reduce,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  reduce: boolean;
  className?: string;
}) {
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 * P&L bar chart
 * ------------------------------------------------------------------ */

/**
 * Profit curve for a cycle. Bars scale on Y from a 0.02 baseline (never
 * scale(0)) with a 40ms stagger, fire once on scroll-in, and keep the final
 * frame as a static chart for reduced-motion users. Chrome-free on purpose:
 * no card, no legend, just the curve, the total, and the last day.
 */
function PnlBarChart({ reduce, days }: { reduce: boolean; days: number }) {
  // Deterministic curve — same shape every render, upward drift with noise.
  const bars = React.useMemo(() => {
    const count = 14;
    return Array.from({ length: count }, (_, i) => {
      const t = i / (count - 1);
      const trend = 0.34 + t * 0.66;
      const wobble = 1 + Math.sin(i * 1.9) * 0.11 + Math.cos(i * 0.7) * 0.06;
      const value = Math.max(0.08, Math.min(1, trend * wobble));
      return { i, value };
    });
  }, []);

  return (
    <div className="h-full">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-display font-black text-2xl tracking-tight sm:text-[28px]">
          +23%
        </span>
        <span className="text-[10px] font-sans font-bold uppercase tracking-[0.12em] text-[var(--theme-text-muted)]">
          Day {days}
        </span>
      </div>

      {/* Plot */}
      <div className="mt-4">
        <div
          className="pnl-plot relative flex items-end gap-[3px] sm:gap-1.5 h-32 sm:h-40"
          role="group"
          aria-label={`Illustrative profit curve rising to 23 percent over ${days} days`}
        >
          {/* baseline */}
          <div className="absolute inset-x-0 bottom-0 h-px bg-[var(--theme-card-border)]" />

          {bars.map((b, idx) => {
            const dayNumber = Math.round(((idx + 1) / bars.length) * days);
            return (
              <div key={b.i} className="relative flex-1 h-full flex items-end">
                <motion.div
                  className="pnl-bar w-full rounded-t-[4px] bg-[var(--theme-primary)]/35"
                  style={{ height: `${Math.max(3, b.value * 100)}%`, transformOrigin: "bottom" }}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scaleY: 0.02 }}
                  whileInView={{ opacity: 1, scaleY: 1 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={
                    reduce
                      ? { duration: 0.3, delay: idx * 0.02 }
                      : {
                          duration: 0.5,
                          delay: idx * 0.04,
                          ease: [0.23, 1, 0.32, 1] as const,
                        }
                  }
                  tabIndex={0}
                  role="img"
                  aria-label={`Day ${dayNumber}`}
                >
                  {/* Value tag: only the hovered/focused bar shows it. */}
                  <span className="pnl-bar-tag pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded-md bg-[var(--theme-text)] px-1.5 py-0.5 text-[10px] font-sans font-bold text-[var(--theme-bg)]">
                    +{(b.value * 23).toFixed(1)}%
                  </span>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

export default function AuthView({ onAuthSuccess, siteConfig }: AuthViewProps) {
  const reduce = useReducedMotion();

  const [screen, setScreen] = useState<AuthScreen>("welcome");
  const [faqOpen, setFaqOpen] = useState<number | null>(0);

  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Fire-and-forget recovery desk: phone is the ticket key (direct_<phone>),
  // email + message ride inside the text — no schema change.
  const [recoveryPhone, setRecoveryPhone] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryMsg, setRecoveryMsg] = useState("");
  const [recoverySending, setRecoverySending] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);

  const [localSiteConfig, setLocalSiteConfig] = useState<any>(null);
  const [catalog, setCatalog] = useState<SubscriptionItem[]>([]);
  const [activeSection, setActiveSection] = useState<string>("markets");

  useEffect(() => {
    fetch("/api/config/site")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setLocalSiteConfig(data);
      })
      .catch(() => {});
  }, []);

  // Public catalog — the landing page shows a real product, not a mock.
  useEffect(() => {
    let alive = true;
    fetch("/api/items")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!alive || !Array.isArray(data)) return;
        setCatalog(
          (data as SubscriptionItem[]).filter((i) => !i.disabled && !i.outOfStock)
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const activeConfig = localSiteConfig || siteConfig;

  // Scroll spy for the desktop nav. Picks the section whose top edge has most
  // recently crossed the sticky-header line, so the active pill follows the
  // reading position instead of flickering between neighbours.
  useEffect(() => {
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;
    const sections = NAV_ITEMS.map((n) => document.getElementById(n.id)).filter(
      (el): el is HTMLElement => !!el
    );
    if (!sections.length) return;

    // Above the first band (hero) nothing is active yet.
    const clearAtTop = () => {
      if (window.scrollY < 160) setActiveSection("");
    };
    clearAtTop();
    window.addEventListener("scroll", clearAtTop, { passive: true });

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visible.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        let best = "";
        let bestRatio = 0;
        visible.forEach((ratio, id) => {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = id;
          }
        });
        if (best) setActiveSection(best);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.15, 0.4, 0.75] }
    );

    sections.forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", clearAtTop);
    };
  }, []);

  // Invite-link landing: ?ref=CODE (search or hash) jumps straight to
  // register with the code applied, then cleans the URL.
  useEffect(() => {
    let ref: string | null = null;
    try {
      const searchParams = new URLSearchParams(window.location.search);
      ref = searchParams.get("ref");
      if (!ref) {
        const hashIndex = window.location.hash.indexOf("?");
        if (hashIndex !== -1) {
          const hashParams = new URLSearchParams(window.location.hash.substring(hashIndex));
          ref = hashParams.get("ref");
        }
      }
    } catch (e) {}

    if (ref) {
      setScreen("register");
      setInviteCode(ref.toUpperCase());
      setTimeout(() => {
        toast.success(`Referral code applied: ${ref!.toUpperCase()}`);
      }, 500);

      try {
        const url = new URL(window.location.href);
        let changed = false;
        if (url.searchParams.has("ref")) {
          url.searchParams.delete("ref");
          changed = true;
        }
        const hashQueryIndex = url.hash.indexOf("?");
        if (hashQueryIndex !== -1) {
          const hashPath = url.hash.slice(0, hashQueryIndex);
          const hashParams = new URLSearchParams(url.hash.slice(hashQueryIndex + 1));
          if (hashParams.has("ref")) {
            hashParams.delete("ref");
            url.hash = hashParams.toString() ? `${hashPath}?${hashParams.toString()}` : hashPath;
            changed = true;
          }
        }
        if (changed) window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
      } catch (error) {
        console.warn("Unable to clean referral URL:", error);
      }
    }
  }, []);

  const goTo = (next: AuthScreen) => {
    setPassword("");
    setShowPassword(false);
    setScreen(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "auto" });
  };

  const handleSubmit = async (e: React.FormEvent, mode: "login" | "register") => {
    e.preventDefault();

    if (!phone || !password) {
      toast.error("Please enter both phone and password.");
      return;
    }

    if (!PHONE_PATTERN.test(phone)) {
      toast.error("Phone number must be 9 or 10 digits.");
      return;
    }

    if (password.length < 8 || password.length > 128) {
      toast.error("Password must be between 8 and 128 characters.");
      return;
    }

    setIsLoading(true);

    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      // Single password field by design; the API contract still expects a
      // matching confirmPassword, so echo it.
      const payload =
        mode === "register"
          ? { phone, password, confirmPassword: password, inviteCode: inviteCode.trim().toUpperCase(), username: username.trim() || undefined, ...(telegramIdToken ? { id_token: telegramIdToken } : {}) }
          : { phone, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed. Try again.");
      }

      if (mode === "register") {
        const issuedBonus = Number(data.profile?.points || 0);
        if (issuedBonus > 0) {
          // Carry the server-confirmed bonus through the register -> login
          // flow. The dashboard uses this one-shot handoff to distinguish a
          // genuinely new account from a normal returning login.
          sessionStorage.setItem(
            `pending_welcome_bonus_${phone}`,
            JSON.stringify({ amount: issuedBonus, issuedAt: Date.now() })
          );
        }
        toast.success(
          Number(activeConfig?.registrationBonus ?? activeConfig?.welcomeBonus ?? 0) > 0
            ? "Registration successful! Log in to claim your registration bonus."
            : "Registration successful! You can now log in.",
          { duration: 6000 }
        );
        setTimeout(() => {
          goTo("login");
          setUsername("");
        }, 1200);
      } else {
        onAuthSuccess(data.profile);
      }
    } catch (err: any) {
      // An expired pending Telegram token can't be reused — drop the pill
      // back to idle so the user reconnects. Other failures keep the pill so
      // only the flagged field needs fixing.
      if (mode === "register" && err.message === "Telegram verification expired. Tap the pill to reconnect.") {
        setTelegramIdToken(null);
      }
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTelegramLogin = async (payload: Record<string, unknown>) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/telegram/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Telegram sign-in failed.");
      onAuthSuccess(data.profile);
    } catch (error: any) {
      toast.error(error.message || "Telegram sign-in failed.");
    } finally {
      setIsLoading(false);
    }
  };

  // Register-pill Telegram state: the verified id_token is held in memory
  // only and attached to the register submit. Nothing is persisted until
  // the account is created.
  const [telegramIdToken, setTelegramIdToken] = useState<string | null>(null);
  const [telegramChecking, setTelegramChecking] = useState(false);
  const [telegramUnlinkOpen, setTelegramUnlinkOpen] = useState(false);

  // Pill tap -> Telegram popup -> DB check via the existing login endpoint:
  // 200 means this Telegram is already connected, so authenticate straight
  // in; 401 means it is free, so the pill flips to Connected and registration
  // continues as usual with the id_token attached at submit.
  const handleTelegramRegisterAuth = async (payload: Record<string, unknown>) => {
    const idToken = payload.id_token;
    if (typeof idToken !== "string" || !idToken) return;
    setTelegramChecking(true);
    try {
      const response = await fetch("/api/auth/telegram/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        onAuthSuccess(data.profile);
        return;
      }
      if (response.status === 401) {
        setTelegramIdToken(idToken);
        toast.success("Telegram connected. Finish registration to link it.");
        return;
      }
      throw new Error((data as { error?: string }).error || "Telegram verification failed. Please try again.");
    } catch (error: any) {
      toast.error(error.message || "Telegram verification failed. Please try again.");
    } finally {
      setTelegramChecking(false);
    }
  };
  const telegramRegister = useTelegramLogin(handleTelegramRegisterAuth);
  const telegramPillBusy = telegramChecking || telegramRegister.status === "loading";

  const handleTelegramPillClick = () => {
    if (telegramIdToken || telegramChecking || isLoading) return;
    if (telegramRegister.status === "failed") {
      telegramRegister.retry();
      return;
    }
    if (telegramRegister.status !== "ready") return;
    telegramRegister.authenticate();
  };

  // Fire-and-forget recovery: lands in the admin Support Desk as a
  // direct_<phone> ticket. No polling here — support reaches out.
  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tel = recoveryPhone.trim();
    const mail = recoveryEmail.trim();
    const msg = recoveryMsg.trim();
    if (!PHONE_PATTERN.test(tel)) {
      toast.error("Enter the 9–10 digit phone number on your account.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      toast.error("Enter a valid email address.");
      return;
    }
    if (msg.length < 10) {
      toast.error("Describe the issue in a few words (min 10 characters).");
      return;
    }
    setRecoverySending(true);
    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: `direct_${tel}`,
          sender: tel,
          senderName: "Recovery Guest",
          text: `[recovery] Phone: ${tel} | Email: ${mail} | ${msg}`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Could not reach support. Try again.");
      setRecoverySent(true);
      toast.success("Sent to support. They'll reach out. Typical response time is 15 mins.", { duration: 6000 });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not reach support. Try again.");
    } finally {
      setRecoverySending(false);
    }
  };

  /* ---------------- derived ---------------- */

  const brandName = activeConfig?.brandName || "Loading";
  const inviteBonus = Number(activeConfig?.inviteBonus ?? 0);
  const regBonus = Number(activeConfig?.registrationBonus ?? activeConfig?.welcomeBonus ?? 0);

  // Admin-configured art. authBgImage anchors the hero, authSlideImages[0..3]
  // back the market cards, the next free slide closes the page. Blank slots
  // simply render no image — never a hard-coded fallback.
  const rawBg = String((activeConfig as any)?.authBgImage || "").trim();
  const heroImage = fixGitHubImageUrl(rawBg);
  const rawSlides: string[] = Array.isArray((activeConfig as any)?.authSlideImages)
    ? (activeConfig as any).authSlideImages
    : [];
  const slideImage = (i: number) => fixGitHubImageUrl(String(rawSlides[i] || "").trim());
  const closingImage = slideImage(MARKETS.length) || slideImage(0);

  const featuredProduct: SubscriptionItem | undefined = catalog[0];

  const amounts = catalog.map((c) => Number(c.amount)).filter((n) => Number.isFinite(n) && n > 0);
  const durations = catalog.map((c) => Number(c.duration)).filter((n) => Number.isFinite(n) && n > 0);
  const fromAmount = amounts.length
    ? Math.min(...amounts)
    : Number(activeConfig?.minimumDeposit) || 30000;
  const maxDuration = durations.length ? Math.max(...durations) : 30;

  const featuredImage = featuredProduct
    ? fixGitHubImageUrl(String(featuredProduct.imageUrl || "").trim())
    : "";
  const featuredImageOk = /^(https?:\/\/|\/)/.test(featuredImage);

  /* ---------------- auth screens (login / register / support) ---------------- */

  const authScreen = screen !== "welcome" && (
    <div className="min-h-[100dvh] bg-[var(--theme-bg)] text-[var(--theme-text)] font-[var(--theme-font-family)] transition-colors">
      <div className="w-full max-w-md mx-auto min-h-[100dvh] flex flex-col px-6 pt-6 pb-8">
        {/* Brand header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Back"
            onClick={() => goTo(screen === "support" ? "login" : "welcome")}
            className="w-9 h-9 -ml-2 flex items-center justify-center text-[var(--theme-text)] opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <BrandLogo siteConfig={activeConfig} className="w-9 h-9 flex items-center justify-center shrink-0" />
          <span className="font-display font-black text-lg tracking-tight uppercase">{brandName}</span>
          <div className="flex-1" />
        </div>

        <AnimatePresence mode="wait">
          {/* ============ LOGIN ============ */}
          {screen === "login" && (
            <motion.div
              key="login"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col pt-10"
            >
              <h1 className="font-display font-black text-[38px] leading-[1.08] tracking-tight whitespace-nowrap">
                Welcome back.
              </h1>
              <p className="mt-3 text-[15px] font-sans text-[var(--theme-text-muted)] leading-relaxed">
                Sign in to continue.
              </p>

              <form onSubmit={(e) => handleSubmit(e, "login")} className="mt-8 space-y-3.5 flex-1 flex flex-col">
                <AuthField
                  icon={<Phone className="w-5 h-5" />}
                  type="tel"
                  required
                  autoComplete="tel"
                  aria-label="Phone Number"
                  placeholder="Phone Number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <div className="relative">
                  <AuthField
                    icon={<Lock className="w-5 h-5" />}
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    aria-label="Password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--theme-text)] opacity-40 hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => goTo("support")}
                    className="text-[13px] font-sans font-semibold text-[var(--theme-primary)] hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>

                <div className="flex-1" />

                <div className="pt-2">
                  <PrimaryButton type="submit" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Processing..
                      </>
                    ) : (
                      <>
                        Login <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </PrimaryButton>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-sans text-[var(--theme-text)] opacity-50">Or use</span>
                  <span className="flex-1" />
                  <TelegramLoginButton onAuth={handleTelegramLogin} disabled={isLoading} />
                  <button
                    type="button"
                    aria-label="About Telegram login"
                    onClick={() => toast.info("Connect Telegram to login without a password")}
                    className="w-8 h-8 flex items-center justify-center text-[var(--theme-text)] opacity-40 hover:opacity-100 transition-opacity cursor-pointer shrink-0"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                </div>
              </form>

              <div className="border-t border-[var(--theme-card-border)] mt-6 pt-5 text-center text-sm font-sans text-[var(--theme-text-muted)]">
                New here?{" "}
                <button
                  type="button"
                  onClick={() => goTo("register")}
                  className="font-bold text-[var(--theme-primary)] hover:underline cursor-pointer"
                >
                  Register
                </button>
              </div>
            </motion.div>
          )}

          {/* ============ REGISTER ============ */}
          {screen === "register" && (
            <motion.div
              key="register"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col pt-10"
            >
              <h1 className="font-display font-black text-[38px] leading-[1.08] tracking-tight whitespace-nowrap">
                Let's get started
              </h1>
              <p className="mt-3 text-[15px] font-sans text-[var(--theme-text-muted)] leading-relaxed">
                Fill in your details...
              </p>

              <form onSubmit={(e) => handleSubmit(e, "register")} className="mt-8 space-y-3.5 flex-1 flex flex-col">
                <AuthField
                  icon={<User className="w-5 h-5" />}
                  type="text"
                  autoComplete="nickname"
                  maxLength={64}
                  aria-label="Username"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <AuthField
                  icon={<Phone className="w-5 h-5" />}
                  type="tel"
                  required
                  autoComplete="tel"
                  aria-label="Phone Number"
                  placeholder="Phone Number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <div className="relative">
                  <AuthField
                    icon={<Lock className="w-5 h-5" />}
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    aria-label="Password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--theme-text)] opacity-40 hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <div>
                  <AuthField
                    icon={<Link2 className="w-5 h-5" />}
                    type="text"
                    autoComplete="off"
                    aria-label="Invite code"
                    placeholder="Invite code (Optional)"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                  />
                  {inviteBonus > 0 && (
                    <p className="mt-1.5 text-xs font-sans text-[var(--theme-primary)] font-semibold">
                      Invite bonus: UGX {inviteBonus.toLocaleString()}
                    </p>
                  )}
                </div>

                {/* Optional Telegram binding — pill floats right with the info
                    icon outside it and an Optional subtext below. The
                    verified id_token attaches to the register submit; the
                    pill flips to Connected once this Telegram is confirmed
                    unlinked. */}
                <div>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={handleTelegramPillClick}
                      disabled={isLoading || telegramPillBusy || !!telegramIdToken}
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] px-4 py-2.5 text-[13px] font-sans font-semibold text-[var(--theme-text)] transition-all active:scale-[0.97] disabled:opacity-60 disabled:cursor-default cursor-pointer"
                    >
                      {telegramPillBusy ? (
                        <>
                          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                          <span className="opacity-70">Connecting…</span>
                        </>
                      ) : telegramIdToken ? (
                        <>
                          <img src="/telegram.svg" alt="" aria-hidden="true" className="h-4 w-4 shrink-0 object-contain" />
                          <span>Connected</span>
                          <CheckCircle2 className="w-4 h-4 text-[var(--theme-primary)]" />
                        </>
                      ) : (
                        <>
                          <img src="/telegram.svg" alt="" aria-hidden="true" className="h-4 w-4 shrink-0 object-contain" />
                          <span>{telegramRegister.status === "failed" ? "Retry Telegram" : "Connect Telegram"}</span>
                        </>
                      )}
                    </button>
                    {telegramIdToken && (
                      <button
                        type="button"
                        aria-label="Unlink Telegram"
                        onClick={() => setTelegramUnlinkOpen(true)}
                        className="w-8 h-8 flex items-center justify-center text-[var(--theme-text)] opacity-40 hover:opacity-100 transition-opacity cursor-pointer shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="About Telegram login"
                      onClick={() => toast.info("Connect Telegram to login without a password")}
                      className="w-8 h-8 flex items-center justify-center text-[var(--theme-text)] opacity-40 hover:opacity-100 transition-opacity cursor-pointer shrink-0"
                    >
                      <Info className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="mt-1 text-right text-[11px] font-sans text-[var(--theme-text)] opacity-50">
                    Optional
                  </p>
                </div>

                <div className="flex-1" />

                {regBonus > 0 && (
                  <div className="relative overflow-hidden rounded-2xl bg-[var(--theme-primary)]/10 px-3 py-2 tile-shimmer-5s">
                    <p className="flex items-center gap-1.5 text-xs font-sans text-[var(--theme-text-muted)]">
                      <Gift className="w-12 h-12 text-[var(--theme-primary)]" />
                      Plus UGX {regBonus.toLocaleString()} Registration bonus upon first login.
                    </p>
                  </div>
                )}

                <div className="pt-2">
                  <PrimaryButton type="submit" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Processing..
                      </>
                    ) : (
                      <>
                        Register <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </PrimaryButton>
                </div>
              </form>

              <div className="border-t border-[var(--theme-card-border)] mt-6 pt-5 text-center text-sm font-sans text-[var(--theme-text-muted)]">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => goTo("login")}
                  className="font-bold text-[var(--theme-primary)] hover:underline cursor-pointer"
                >
                  Login
                </button>
              </div>
            </motion.div>
          )}

          {/* ============ SUPPORT ============ */}
          {screen === "support" && (
            <motion.div
              key="support"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col pt-10"
            >
              <h1 className="font-display font-black text-[38px] leading-[1.08] tracking-tight">
                Need a<br />
                hand?
              </h1>
              <p className="mt-3 text-[15px] font-sans text-[var(--theme-text-muted)] leading-relaxed">
                Send a note to the support desk to recover your account.
              </p>

              {/* Primary: fire-and-forget recovery form */}
              {recoverySent ? (
                <div className="mt-8 rounded-2xl border border-[var(--theme-primary)]/30 bg-[var(--theme-primary)]/10 px-5 py-6 text-center">
                  <CheckCircle2 className="w-10 h-10 mx-auto text-[var(--theme-primary)]" />
                  <p className="mt-3 font-display font-black text-lg tracking-tight">Message sent.</p>
                  <p className="mt-2 text-[14px] font-sans text-[var(--theme-text-muted)] leading-relaxed">
                    Support will reach out on your email or phone. Typical response time is 15 mins. Keep them handy.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setRecoverySent(false); setRecoveryMsg(""); }}
                    className="mt-4 text-[13px] font-sans font-semibold text-[var(--theme-primary)] hover:underline cursor-pointer"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleRecoverySubmit} className="mt-8 space-y-3.5">
                  <AuthField
                    icon={<Phone className="w-5 h-5" />}
                    type="tel"
                    required
                    autoComplete="tel"
                    aria-label="Account phone number"
                    placeholder="Account phone number"
                    value={recoveryPhone}
                    onChange={(e) => setRecoveryPhone(e.target.value)}
                  />
                  <AuthField
                    icon={<Mail className="w-5 h-5" />}
                    type="email"
                    required
                    autoComplete="email"
                    aria-label="Email address"
                    placeholder="Email address"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                  />
                  <textarea
                    required
                    aria-label="Describe the issue"
                    placeholder="Describe the issue e.g. locked out after number change"
                    value={recoveryMsg}
                    onChange={(e) => setRecoveryMsg(e.target.value)}
                    rows={4}
                    maxLength={1000}
                    className="w-full px-4 py-4 bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] rounded-2xl text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] text-[15px] font-sans font-medium outline-none transition-colors focus:border-[var(--theme-primary)] select-text resize-none"
                  />
                  <PrimaryButton type="submit" disabled={recoverySending}>
                    {recoverySending ? (
                      <>
                        <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Sending..
                      </>
                    ) : (
                      <>
                        Send message <Send className="w-4 h-4" />
                      </>
                    )}
                  </PrimaryButton>
                </form>
              )}

              {/* Secondary: external channels */}
              <p className="mt-8 mb-2 text-[11px] font-sans font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
                Or try a channel
              </p>
              <div className="space-y-3 opacity-80">
                <a
                  href={activeConfig?.whatsappLink || "https://t.me/#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-4 px-5 flex items-center gap-3 rounded-2xl bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] transition-all active:scale-[0.98]"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-6 h-6 shrink-0 fill-sky-500">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z" />
                  </svg>
                  <div className="text-left font-sans flex-1">
                    <div className="font-bold text-[15px]">Telegram Support</div>
                    <div className="text-[13px] text-[var(--theme-text-muted)]">Live agent chat</div>
                  </div>
                </a>

                <a
                  href={activeConfig?.telegramLink || "https://t.me/#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-4 px-5 flex items-center gap-3 rounded-2xl bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] transition-all active:scale-[0.98]"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-6 h-6 shrink-0 fill-sky-500">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z" />
                  </svg>
                  <div className="text-left font-sans flex-1">
                    <div className="font-bold text-[15px]">Telegram Channel</div>
                    <div className="text-[13px] text-[var(--theme-text-muted)]">Official community announcements</div>
                  </div>
                </a>
              </div>

              <div className="flex-1" />
              <div className="border-t border-[var(--theme-card-border)] mt-8 pt-5 text-center text-sm font-sans text-[var(--theme-text-muted)]">
                Remembered it?{" "}
                <button
                  type="button"
                  onClick={() => goTo("login")}
                  className="font-bold text-[var(--theme-primary)] hover:underline cursor-pointer"
                >
                  Login
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Unlink confirm: discards the pending (never persisted) Telegram
            token and drops the pill back to idle. */}
        {telegramUnlinkOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6" role="dialog" aria-modal="true" aria-label="Unlink Telegram account">
            <div className="absolute inset-0 bg-black/60" onClick={() => setTelegramUnlinkOpen(false)} />
            <div className="relative w-full max-w-xs rounded-2xl border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] p-5 text-center">
              <h3 className="font-display font-black text-lg tracking-tight">Unlink Telegram account?</h3>
              <p className="mt-2 text-[14px] font-sans text-[var(--theme-text-muted)] leading-relaxed">
                You can still register and log in with your phone and password.
              </p>
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => { setTelegramIdToken(null); setTelegramUnlinkOpen(false); toast.success("Telegram unlinked."); }}
                  className="w-full py-3 px-6 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 font-sans font-bold text-[14px] transition-all active:scale-[0.98] cursor-pointer"
                >
                  Unlink
                </button>
                <button
                  type="button"
                  onClick={() => setTelegramUnlinkOpen(false)}
                  className="w-full py-3 px-6 rounded-2xl border border-[var(--theme-card-border)] text-[var(--theme-text)] font-sans font-semibold text-[14px] transition-all active:scale-[0.98] bg-transparent cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (authScreen) return authScreen;

  /* ---------------- landing ---------------- */

  const heroStagger = reduce
    ? {}
    : {
        animate: "show",
        initial: "hidden",
        variants: {
          hidden: {},
          show: { transition: { staggerChildren: 0.06 } },
        },
      };

  const rise = (delay: number) =>
    reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.3, delay } }
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] as const, delay },
        };

  return (
    <div className="min-h-[100dvh] bg-[var(--theme-bg)] text-[var(--theme-text)] font-[var(--theme-font-family)] transition-colors">
      {/* ---------------- sticky nav ---------------- */}
      <header className="sticky top-0 z-50 border-b border-[var(--theme-card-border)]/60 bg-[var(--theme-bg)]/80 backdrop-blur-xl">
        <div className="relative max-w-7xl mx-auto px-5 sm:px-8 h-16 md:h-[72px] flex items-center gap-3">
          <BrandLogo siteConfig={activeConfig} className="w-9 h-9 flex items-center justify-center shrink-0" />
          <span className="hidden sm:inline font-display font-black text-base md:text-lg tracking-tight uppercase">
            {brandName}
          </span>

          <div className="flex-1 hidden md:block" />

          <nav className="hidden md:flex items-center justify-center gap-1 absolute left-1/2 -translate-x-1/2">
            {NAV_ITEMS.map((item) => {
              const active = activeSection === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  aria-current={active ? "true" : undefined}
                  className={`relative px-3.5 py-2 rounded-full text-[13px] font-sans font-semibold transition-colors duration-200 ${
                    active
                      ? "text-[var(--theme-text)]"
                      : "text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active-pill"
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full bg-[var(--theme-primary)]/12"
                      transition={
                        reduce
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 380, damping: 32 }
                      }
                    />
                  )}
                  <span className="relative z-10">{item.label}</span>
                </a>
              );
            })}
          </nav>

          <div className="flex-1" />

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => goTo("login")}
              disabled={isLoading}
              className="pressable px-4 py-2.5 rounded-full border border-[var(--theme-card-border)] text-[12px] font-sans font-black uppercase tracking-wider text-[var(--theme-text)] hover:border-[var(--theme-primary)]/50 transition-colors cursor-pointer disabled:opacity-60"
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => goTo("register")}
              disabled={isLoading}
              className="pressable px-4 py-2.5 rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] text-[12px] font-sans font-black uppercase tracking-wider cursor-pointer disabled:opacity-60"
            >
              Register
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* ---------------- hero ---------------- */}
        <section className="relative min-h-[calc(100dvh-4rem)] md:min-h-[calc(100dvh-4.5rem)] flex flex-col overflow-hidden">
          <motion.div
            {...heroStagger}
            className="relative flex-1 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] gap-4 sm:gap-10 lg:gap-14 items-center w-full max-w-7xl mx-auto px-3 sm:px-8 pt-3 pb-8 sm:py-16"
          >
            <div className="min-w-0 order-2 lg:order-1">
            <motion.h1
              {...rise(0.06)}
              className="max-w-3xl font-display font-black text-[40px] leading-[1.02] tracking-tight sm:text-[60px] lg:text-[64px] xl:text-[72px]"
            >
              Discover bots,

              <br />
              <span className="text-[var(--theme-primary)]">Put them to work.</span>
            </motion.h1>

            <motion.p
              {...rise(0.12)}
              className="mt-6 max-w-xl text-[15px] font-sans leading-relaxed text-[var(--theme-text-muted)] sm:text-lg"
            >
              Our system employs real-time algrorithmic trading bots to find you fixed trading opportunities in the volatile markets.
            </motion.p>

            <motion.div {...rise(0.18)} className="mt-9 flex flex-col sm:flex-row gap-3 sm:items-center">

              <button
               type="button"
                onClick={() => goTo("register")}
                disabled={isLoading}
                className="pressable inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] font-sans font-semibold text-[15px] text-[var(--theme-text)]"
              >
               Get started.
              </button>
            </motion.div>
            </div>

            {/* Hero art: the live catalog's own product image, shown bare. No
                card, no border, no background — the asset is the visual. Falls
                back to the admin-configured authBgImage only when the catalog
                has no image to show. */}
            <motion.div
              {...(reduce
                ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.3, delay: 0.2 } }
                : {
                    initial: { opacity: 0, y: 18 },
                    animate: { opacity: 1, y: 0 },
                    transition: { duration: 0.55, ease: [0.23, 1, 0.32, 1] as const, delay: 0.2 },
                  })}
              className="relative min-w-0 order-1 lg:order-2 -mx-3 -mt-2 sm:mx-0 sm:mt-0"
            >
              {featuredImageOk ? (
                <img
                  src={featuredImage}
                  alt={featuredProduct?.name ? `${featuredProduct.name} trading bot` : "Trading bot"}
                  referrerPolicy="no-referrer"
                  className="hero-art block w-full h-auto max-h-[240px] sm:max-h-[340px] lg:max-h-[440px] object-contain mx-auto drop-shadow-[0_18px_40px_rgba(0,0,0,0.18)]"
                />
              ) : heroImage ? (
                <img
                  src={heroImage}
                  alt=""
                  aria-hidden="true"
                  referrerPolicy="no-referrer"
                  className="hero-art block w-full h-auto max-h-[240px] sm:max-h-[340px] lg:max-h-[440px] object-contain mx-auto drop-shadow-[0_18px_40px_rgba(0,0,0,0.18)]"
                />
              ) : null}
            </motion.div>
          </motion.div>

          {/* Live tape pinned to the foot of the hero — the last thing you see
              before the fold. Sits outside the staggered block so it never
              competes with the headline for entrance timing. */}
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              reduce
                ? { duration: 0.3, delay: 0.3 }
                : { duration: 0.45, ease: [0.23, 1, 0.32, 1] as const, delay: 0.32 }
            }
            className="relative w-full border-t border-[var(--theme-card-border)]/60 bg-[var(--theme-card-bg)]"
          >
            <div className="max-w-7xl mx-auto px-5 sm:px-8">
              <TradingViewWidget
                kind="ticker-tape"
                height={46}
                attrs={{
                  symbols: TICKER_SYMBOLS,
                  isTransparent: true,
                  displayMode: "adaptive",
                  showSymbolLogo: true,
                }}
                fallback={<div className="h-[46px] animate-pulse rounded-lg bg-[var(--theme-card-bg)]" />}
              />
            </div>
          </motion.div>
        </section>

        {/* ---------------- markets + getting started ---------------- */}
        <section id="markets" className="scroll-mt-24 max-w-7xl mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <Reveal reduce={reduce}>
            <SectionHead
              eyebrow="Market coverage"
              title="The markets are full of opportunities."
              lede="Whether you follow forex,crpto,CFDs, See thousands of possible futures at once, with the drawdowns to expect, the winning streaks, and your odds of doubling the account or losing half."
            />
          </Reveal>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MARKETS.map((m, i) => {
              const img = slideImage(i);
              const Icon = m.icon;
              return (
                <Reveal key={m.title} delay={i * 0.05} reduce={reduce}>
                  <article className="lift-card group relative h-full overflow-hidden rounded-3xl border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] p-6">
                    {img ? (
                      <div className="absolute inset-0 pointer-events-none">
                        <img
                          src={img}
                          alt=""
                          aria-hidden="true"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover opacity-[0.14] transition-opacity duration-200 group-hover:opacity-[0.2]"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[var(--theme-bg)] via-[var(--theme-bg)]/70 to-transparent" />
                      </div>
                    ) : null}

                    <div className="relative">
                      <span className="inline-flex w-11 h-11 items-center justify-center rounded-2xl bg-[var(--theme-primary)]/12 text-[var(--theme-primary)] transition-transform duration-200 group-hover:scale-105">
                        <Icon className="w-5 h-5" />
                      </span>
                      <h3 className="mt-5 font-display font-black text-lg tracking-tight">{m.title}</h3>
                      <p className="mt-2 text-[14px] font-sans leading-relaxed text-[var(--theme-text-muted)]">
                        {m.copy}
                      </p>
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </div>

          {/* Getting started — folded into the same section */}
          <div className="mt-16 sm:mt-20">
            <Reveal reduce={reduce}>
              <SectionHead
                eyebrow="Getting started"
                title="Get started in three simple steps."
                lede="No paperwork and no waiting room. Account, balance, cycle."
              />
            </Reveal>

            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <Reveal key={s.title} delay={i * 0.06} reduce={reduce}>
                    <article className="lift-card h-full rounded-3xl border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] p-6">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex w-10 h-10 items-center justify-center rounded-2xl bg-[var(--theme-primary)]/12 text-[var(--theme-primary)]">
                          <Icon className="w-5 h-5" />
                        </span>
                        <span className="font-display font-black text-[13px] tracking-[0.14em] text-[var(--theme-text-muted)]">
                          0{i + 1}
                        </span>
                      </div>
                      <h3 className="mt-5 font-display font-black text-lg tracking-tight">{s.title}</h3>
                      <p className="mt-2 text-[14px] font-sans leading-relaxed text-[var(--theme-text-muted)]">
                        {s.copy}
                      </p>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------------- featured strategy ---------------- */}
        <section id="bots" className="scroll-mt-24 max-w-7xl mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <Reveal reduce={reduce}>
            <SectionHead
              eyebrow="Meet your trading bots"
              title="Find markets, activate bots."
              lede="Every market has a set of trading bots you activate with fixed returns for a set period of time. Choose as many as you like to get started"
            />
          </Reveal>

          <Reveal delay={0.06} reduce={reduce} className="mt-12">
            {featuredProduct ? (
              <article className="lift-card overflow-hidden rounded-3xl border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)]">
                <div className="flex flex-col sm:flex-row">
                  <div className="relative sm:w-2/5 aspect-[16/10] sm:aspect-auto sm:min-h-[260px] bg-[var(--theme-card-bg)]">
                    {featuredImageOk ? (
                      <img
                        src={featuredImage}
                        alt={featuredProduct.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Bot className="w-14 h-14 text-[var(--theme-primary)] opacity-50" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 p-6 sm:p-9">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--theme-primary)]/12 px-3 py-1 text-[11px] font-sans font-black uppercase tracking-[0.12em] text-[var(--theme-primary)]">
                        {featuredProduct.category}
                      </span>
                      <span className="rounded-full border border-[var(--theme-card-border)] px-3 py-1 text-[11px] font-sans font-black uppercase tracking-[0.12em] text-[var(--theme-text-muted)]">
                        Available now
                      </span>
                    </div>

                    <h3 className="mt-4 font-display font-black text-[26px] leading-tight tracking-tight sm:text-[32px]">
                      {featuredProduct.name}
                    </h3>

                    <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-6 sm:max-w-md">
                      <div>
                        <dt className="text-[11px] font-sans font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
                          Allocation
                        </dt>
                        <dd className="mt-1.5 font-display font-black text-md tracking-tight">
                          UGX {Number(featuredProduct.amount).toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-sans font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
                          Daily yield
                        </dt>
                        <dd className="mt-1.5 font-display font-black text-md tracking-tight">
                          UGX {Number(featuredProduct.dailyYield).toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-sans font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
                          Cycle
                        </dt>
                        <dd className="mt-1.5 flex items-center gap-2 font-display font-black text-md tracking-tight">
                          <CalendarDays className="w-4 h-4 text-[var(--theme-primary)]" />
                          {featuredProduct.duration} days
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-sans font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
                          Status
                        </dt>
                        <dd className="mt-1.5 flex items-center gap-2 font-display font-black text-md tracking-tight">
                          <CheckCircle2 className="w-4 h-4 text-[var(--theme-primary)]" />
                          Open
                        </dd>
                      </div>
                    </dl>

                    <button
                      type="button"
                      onClick={() => goTo("register")}
                      disabled={isLoading}
                      className="pressable group/bot mt-8 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-[var(--theme-primary)] text-[var(--theme-on-primary)] font-sans font-bold text-[14px] shadow-[0_4px_0_0_var(--theme-primary-shadow)] cursor-pointer disabled:opacity-60 sm:w-auto w-full"
                    >
                      Activate bot
                      <ArrowUpRight className="w-4 h-4 transition-transform duration-200 group-hover/bot:translate-x-0.5 group-hover/bot:-translate-y-0.5" />
                    </button>
                  </div>
                </div>
              </article>
            ) : (
              <div className="rounded-3xl border border-dashed border-[var(--theme-card-border)] bg-[var(--theme-card-bg)]/50 px-6 py-16 text-center">
                <Bot className="w-10 h-10 mx-auto text-[var(--theme-primary)] opacity-60" />
                <p className="mt-4 font-display font-black text-lg tracking-tight">
                  Strategies are being restocked.
                </p>
                <p className="mt-2 text-[14px] font-sans text-[var(--theme-text-muted)]">
                  Create an account and the live catalog is waiting inside.
                </p>
              </div>
            )}
          </Reveal>
        </section>

        {/* ---------------- cycles ---------------- */}
        <section id="cycles" className="scroll-mt-24 max-w-7xl mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 lg:items-center">
            <Reveal reduce={reduce}>
              <div>
                <SectionHead
                  eyebrow="Cycles"
                  title="Set your own pace"
                  lede="Short cycles turn over faster. Long cycles sit quietly and compound. Neither is smarter — one just fits your week better."
                />

                <div className="mt-8 flex flex-wrap gap-2.5">
                  <span className="rounded-full border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] px-4 py-2 text-[12px] font-sans font-bold text-[var(--theme-text)]">
                    From UGX {fromAmount.toLocaleString()}
                  </span>
                  <span className="rounded-full border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] px-4 py-2 text-[12px] font-sans font-bold text-[var(--theme-text)]">
                    Up to {maxDuration} days
                  </span>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.1} reduce={reduce}>
              <PnlBarChart reduce={reduce} days={maxDuration} />
            </Reveal>
          </div>
        </section>

        {/* ---------------- live market data ---------------- */}
        <section id="markets-live" className="scroll-mt-24 max-w-7xl mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <Reveal reduce={reduce}>
            <SectionHead
              eyebrow="Live market data"
              title="The tape never stops."
              lede="Stay updated with the markets and strategies you follow"
            />
          </Reveal>

          <div className="mt-12 grid gap-4 lg:grid-cols-5">
            <Reveal reduce={reduce} className="min-w-0 lg:col-span-3">
              <div className="lift-card h-full overflow-hidden rounded-3xl border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)]">
                <div className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 sm:pt-6">
                  <h3 className="font-display font-black text-sm sm:text-base tracking-tight">Market news</h3>
                  <span className="shrink-0 rounded-full bg-[var(--theme-primary)]/12 px-2.5 py-1 text-[10px] font-sans font-black uppercase tracking-[0.12em] text-[var(--theme-primary)]">
                    Live
                  </span>
                </div>
                <div className="px-1.5 sm:px-3 pb-2 sm:pb-3 pt-2">
                  <TradingViewWidget
                    kind="news-feed"
                    height={440}
                    heightMobile={340}
                    attrs={{ isTransparent: true, displayMode: "regular", feedMode: "all_symbols" }}
                    fallback={
                      <div className="space-y-2 px-2 py-2" aria-hidden="true">
                        {[0, 1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className="h-16 animate-pulse rounded-xl bg-[var(--theme-card-bg)]"
                          />
                        ))}
                      </div>
                    }
                  />
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.08} reduce={reduce} className="min-w-0 lg:col-span-2">
              <div className="lift-card h-full overflow-hidden rounded-3xl border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)]">
                <div className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 sm:pt-6">
                  <h3 className="font-display font-black text-sm sm:text-base tracking-tight">
                    Technicals · AAPL
                  </h3>
                  <span className="shrink-0 rounded-full bg-[var(--theme-primary)]/12 px-2.5 py-1 text-[10px] font-sans font-black uppercase tracking-[0.12em] text-[var(--theme-primary)]">
                    Live
                  </span>
                </div>
                <div className="px-1.5 sm:px-3 pb-2 sm:pb-3 pt-2">
                  <TradingViewWidget
                    kind="technical-analysis"
                    height={440}
                    heightMobile={340}
                    attrs={{
                      symbol: "NASDAQ:AAPL",
                      interval: "1D",
                      width: "100%",
                      isTransparent: true,
                      showIntervalTabs: false,
                      displayMode: "multiple",
                    }}
                    fallback={
                      <div className="space-y-2 px-2 py-2" aria-hidden="true">
                        {[0, 1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className="h-16 animate-pulse rounded-xl bg-[var(--theme-card-bg)]"
                          />
                        ))}
                      </div>
                    }
                  />
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ---------------- visibility ---------------- */}
        <section id="visibility" className="max-w-7xl mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <Reveal reduce={reduce}>
            <SectionHead
              eyebrow="Built around visibility"
              title="Nothing about a cycle is a surprise."
              lede="Before you commit, after you commit, and right up to the close — the same numbers stay on screen."
            />
          </Reveal>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {VISIBILITY.map((f, i) => {
              const Icon = f.icon;
              return (
                <Reveal key={f.title} delay={i * 0.05} reduce={reduce}>
                  <article className="lift-card h-full rounded-3xl border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] p-6">
                    <span className="inline-flex w-11 h-11 items-center justify-center rounded-2xl bg-[var(--theme-primary)]/12 text-[var(--theme-primary)]">
                      <Icon className="w-5 h-5" />
                    </span>
                    <h3 className="mt-5 font-display font-black text-base tracking-tight">{f.title}</h3>
                    <p className="mt-2 text-[14px] font-sans leading-relaxed text-[var(--theme-text-muted)]">
                      {f.copy}
                    </p>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* ---------------- closing CTA ---------------- */}
        <section className="max-w-7xl mx-auto px-5 sm:px-8 pb-20 sm:pb-28">
          <Reveal reduce={reduce}>
            <div className="relative overflow-hidden rounded-[28px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] px-6 py-16 sm:px-12 sm:py-20">
              {closingImage ? (
                <div className="absolute inset-0 pointer-events-none">
                  <img
                    src={closingImage}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover opacity-[0.18]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-[var(--theme-bg)] via-[var(--theme-bg)]/85 to-[var(--theme-bg)]/55" />
                </div>
              ) : null}

              <div className="relative max-w-xl">
                <h2 className="font-display font-black text-[30px] leading-[1.06] tracking-tight sm:text-[44px]">
                  Your next trading move starts here.
                </h2>
                <p className="mt-4 text-[15px] font-sans leading-relaxed text-[var(--theme-text-muted)] sm:text-base">
                  Create an account, fund the balance, and put a strategy to work. The catalog is
                  already loaded.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => goTo("register")}
                    disabled={isLoading}
                    className="pressable group/cta inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl bg-[var(--theme-primary)] text-[var(--theme-on-primary)] font-sans font-bold text-[15px] shadow-[0_4px_0_0_var(--theme-primary-shadow)] cursor-pointer disabled:opacity-60"
                  >
                    Create an account
                    <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover/cta:translate-x-0.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => goTo("login")}
                    disabled={isLoading}
                    className="pressable inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] font-sans font-semibold text-[15px] text-[var(--theme-text)] cursor-pointer disabled:opacity-60"
                  >
                    Login
                  </button>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ---------------- FAQ ---------------- */}
        <section id="faq" className="scroll-mt-24 max-w-3xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
          <Reveal reduce={reduce}>
            <SectionHead eyebrow="FAQ" title="Frequently asked questions." />
          </Reveal>

          <div className="mt-10">
            {FAQS.map((f, i) => {
              const open = faqOpen === i;
              return (
                <div key={f.q}>
                  <button
                    type="button"
                    onClick={() => setFaqOpen(open ? null : i)}
                    aria-expanded={open}
                    className="w-full flex items-center justify-between gap-4 py-4 text-left cursor-pointer group"
                  >
                    <span className="text-[15px] font-display font-black tracking-tight transition-colors group-hover:text-[var(--theme-primary)]">
                      {f.q}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 shrink-0 text-[var(--theme-primary)] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: "spring", damping: 30, stiffness: 320 }}
                        className="overflow-hidden"
                      >
                        <p className="pb-5 pr-8 text-[14px] font-sans leading-relaxed text-[var(--theme-text-muted)]">
                          {f.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </section>

      
      </main>

      {/* ---------------- footer ---------------- */}
      <footer className="border-t border-[var(--theme-card-border)]">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <BrandLogo siteConfig={activeConfig} className="w-8 h-8 flex items-center justify-center shrink-0" />
              <span className="font-display font-black text-sm tracking-tight uppercase">{brandName}</span>
            </div>

            <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <button
                type="button"
                onClick={() => goTo("support")}
                className="text-[13px] font-sans font-semibold text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors cursor-pointer"
              >
                Support
              </button>
              <button
                type="button"
                onClick={() => goTo("login")}
                className="text-[13px] font-sans font-semibold text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors cursor-pointer"
              >
                Login
              </button>
              <div className="flex items-center gap-3">
                {activeConfig?.telegramLink ? (
                  <a
                    href={activeConfig.telegramLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Telegram"
                    className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </a>
                ) : null}
                {activeConfig?.whatsappLink ? (
                  <a
                    href={activeConfig.whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="WhatsApp"
                    className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors"
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                ) : null}
              </div>
            </nav>
          </div>

          <p className="mt-8 text-[12px] font-sans text-[var(--theme-text-muted)]">
            © {new Date().getFullYear()} {brandName}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
