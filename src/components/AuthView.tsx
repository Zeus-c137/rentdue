/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { UserProfile } from "../types";
import { Phone, Lock, Eye, EyeOff, User, ChevronLeft, ArrowRight, Mail, Gift } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { BrandLogo } from "./BrandLogo";
import { LevelBadge, OPERATOR_TIERS } from "./LevelBadge";
import { fixGitHubImageUrl } from "../utils/imageUtils";

interface AuthViewProps {
  onAuthSuccess: (profile: UserProfile) => void;
  siteConfig?: any;
}

type AuthScreen = "welcome" | "login" | "register" | "support";

// Welcome hero: admin-customizable via Custom Wallpapers (authBgImage),
// otherwise a verified neon-city night photo (Unsplash, ZHENYU LUO).
const DEFAULT_WELCOME_HERO =
  "https://images.unsplash.com/photo-1749916883754-a7b3fc88d4a7?auto=format&fit=crop&w=900&q=70";

const WELCOME_SLIDES = [
  {
    title: "Built for operators.",
    sub: "Complete tasks. Earn rewards. Grow on your terms.",
  },
  {
    title: "Track progress daily.",
    sub: "Watch every run accrue, day after day.",
  },
  {
    title: "Cash out on your terms.",
    sub: "Top up in seconds, withdraw when it suits you.",
  },
];

const PHONE_PATTERN = /^\d{9,10}$/;

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

export default function AuthView({ onAuthSuccess, siteConfig }: AuthViewProps) {
  const [screen, setScreen] = useState<AuthScreen>("welcome");
  const [slide, setSlide] = useState(0);
  const [heroFailed, setHeroFailed] = useState(false);

  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [localSiteConfig, setLocalSiteConfig] = useState<any>(null);
  const ladderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/config/site")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setLocalSiteConfig(data);
      })
      .catch(() => {});
  }, []);

  const activeConfig = localSiteConfig || siteConfig;

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

  // Level ladder autoplay: drifts the badges every 2s, loops back at the end.
  useEffect(() => {
    if (screen !== "register") return;
    const id = window.setInterval(() => {
      const el = ladderRef.current;
      if (!el || document.hidden) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const next = el.scrollLeft + el.clientWidth * 0.6;
      el.scrollTo({ left: next >= max - 4 ? 0 : next, behavior: "smooth" });
    }, 2000);
    return () => window.clearInterval(id);
  }, [screen, levelNames.length]);

  // Welcome carousel auto-advance (pauses off-screen: AuthView unmounts at login).
  useEffect(() => {
    if (screen !== "welcome") return;
    const timer = setInterval(() => {
      setSlide((s) => (s + 1) % WELCOME_SLIDES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [screen]);

  const goTo = (next: AuthScreen) => {
    setPassword("");
    setShowPassword(false);
    setScreen(next);
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
          ? { phone, password, confirmPassword: password, inviteCode, username: username.trim() || undefined }
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
        toast.success("Registration successful!");
        setTimeout(() => {
          goTo("login");
          setUsername("");
        }, 1200);
      } else {
        toast.success("Logged in successfully!");
        onAuthSuccess(data.profile);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const heroSrc = fixGitHubImageUrl(activeConfig?.authBgImage) || DEFAULT_WELCOME_HERO;
  // Admin-backed level ladder for the register card (falls back to the
  // static operator ladder when the admin hasn't defined tiers yet).
  const adminCats = Array.isArray(activeConfig?.vipTaskCategories)
    ? activeConfig.vipTaskCategories.filter((c: any) => typeof c === "string" && c.trim())
    : [];
  const levelNames = (adminCats.length > 0 ? adminCats : OPERATOR_TIERS.map((t) => t.name)).slice(0, 6);
  const brandName = activeConfig?.brandName || "Loading";
  const inviteBonus = Number(activeConfig?.inviteBonus ?? 0);
  const regBonus = Number(activeConfig?.registrationBonus ?? activeConfig?.welcomeBonus ?? 1000);

  const currentSlide = WELCOME_SLIDES[slide];

  return (
    <div className="min-h-[100dvh] bg-[var(--theme-bg)] text-[var(--theme-text)] font-[var(--theme-font-family)] transition-colors">
      <div className="w-full max-w-md mx-auto min-h-[100dvh] flex flex-col px-6 pt-6 pb-8">
        {/* Brand header */}
        <div className="flex items-center gap-3">
          {(screen === "login" || screen === "register" || screen === "support") && (
            <button
              type="button"
              aria-label="Back"
              onClick={() => goTo(screen === "support" ? "login" : "welcome")}
              className="w-9 h-9 -ml-2 flex items-center justify-center text-[var(--theme-text)] opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          <BrandLogo siteConfig={activeConfig} className="w-9 h-9 flex items-center justify-center shrink-0" />
          <span className="font-display font-black text-lg tracking-tight uppercase">{brandName}</span>
        </div>

        {screen === "welcome" && (
          <div className="flex items-center gap-1.5 pt-5">
            {WELCOME_SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => setSlide(i)}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  i === slide ? "w-5 bg-[var(--theme-primary)]" : "w-1.5 bg-[var(--theme-text)] opacity-20"
                }`}
              />
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* ============ WELCOME ============ */}
          {screen === "welcome" && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col pt-5"
            >
              <div className="min-h-[158px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={slide}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25 }}
                  >
                    <h1 className="font-display font-black text-[42px] leading-[1.05] tracking-tight">
                      {currentSlide.title}
                    </h1>
                    <p className="mt-3 text-[15px] font-sans text-[var(--theme-text-muted)] leading-relaxed">
                      {currentSlide.sub}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="mt-6 flex-1 min-h-[220px] rounded-[24px] overflow-hidden border border-[var(--theme-card-border)] relative">
                {!heroFailed ? (
                  <img
                    src={heroSrc}
                    alt="Operators at work at night"
                    loading="eager"
                    onError={() => setHeroFailed(true)}
                    className="absolute inset-0 w-full h-full object-cover block"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,var(--theme-primary)_0%,transparent_70%)] opacity-90">
                    <BrandLogo siteConfig={activeConfig} className="w-24 h-24 flex items-center justify-center" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
              </div>

              <div className="space-y-3 mt-6">
                <PrimaryButton onClick={() => goTo("register")} disabled={isLoading}>
                  Register <ArrowRight className="w-4 h-4" />
                </PrimaryButton>
                <GhostButton onClick={() => goTo("login")} disabled={isLoading}>
                  Login <ArrowRight className="w-4 h-4" />
                </GhostButton>
              </div>
            </motion.div>
          )}

          {/* ============ LOGIN ============ */}
          {screen === "login" && (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col pt-10"
            >
              <h1 className="font-display font-black text-[38px] leading-[1.08] tracking-tight">
                Welcome
                <br />
                back.
              </h1>

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
                      <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        Login <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </PrimaryButton>
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
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col pt-10"
            >
              <h1 className="font-display font-black text-[38px] leading-[1.08] tracking-tight">
                Create your
                <br />
                account.
              </h1>

              <form onSubmit={(e) => handleSubmit(e, "register")} className="mt-8 space-y-3.5 flex-1 flex flex-col">
                <AuthField
                  icon={<Mail className="w-5 h-5" />}
                  type="text"
                  autoComplete="nickname"
                  maxLength={64}
                  aria-label="Email or Username"
                  placeholder="Email / Username"
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
                    icon={<User className="w-5 h-5" />}
                    type="text"
                    autoComplete="off"
                    aria-label="Invite Code"
                    placeholder="Invite Code"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    className="uppercase font-mono tracking-wide"
                  />
                  {inviteBonus > 0 && (
                    <p className="mt-1.5 text-xs font-sans text-[var(--theme-primary)] font-semibold">
                      Invite bonus: UGX {inviteBonus.toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="flex-1" />

                <div className="rounded-2xl border border-dashed border-[var(--theme-primary)] bg-[var(--theme-primary)]/10 px-4 py-3.5 space-y-3">
                  <div className="flex items-center gap-3">
                    <LevelBadge level={0} className="w-12 h-12" />
                    <div className="flex-1 min-w-0">
                      <p className="font-sans font-black text-[15px] leading-tight">
                        Start as {levelNames[0]}
                      </p>
                      <p className="text-xs font-sans text-[var(--theme-text-muted)]">
                        Unlock by running, inviting &amp; checking in.
                      </p>
                    </div>
                  </div>
                  <div ref={ladderRef} className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {levelNames.map((name, i) => (
                      <span
                        key={`${name}-${i}`}
                        className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-sans font-black uppercase tracking-wider ${
                          i === 0
                            ? "bg-[var(--theme-primary)] text-[var(--theme-on-primary)]"
                            : "border border-[var(--theme-card-border)] text-[var(--theme-text-muted)]"
                        }`}
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                  {regBonus > 0 && (
                    <p className="flex items-center gap-1.5 text-xs font-sans text-[var(--theme-text-muted)]">
                      <Gift className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
                      Plus UGX {regBonus.toLocaleString()} welcome bonus on sign-up.
                    </p>
                  )}
                </div>

                <div className="pt-2">
                  <PrimaryButton type="submit" disabled={isLoading}>
                    {isLoading ? (
                      <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
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
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col pt-10"
            >
              <h1 className="font-display font-black text-[38px] leading-[1.08] tracking-tight">
                Need a<br />
                hand?
              </h1>
              <p className="mt-3 text-[15px] font-sans text-[var(--theme-text-muted)] leading-relaxed">
                Talk to a live agent to recover your account.
              </p>

              <div className="mt-8 space-y-3.5">
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
      </div>
    </div>
  );
}
