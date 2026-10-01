/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { UserProfile } from "../types";
import { Phone, Lock, Eye, EyeOff, User, ChevronLeft, ArrowRight, Gift, Link2, Mail, Send, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { BrandLogo } from "./BrandLogo";
import { fixGitHubImageUrl } from "../utils/imageUtils";

interface AuthViewProps {
  onAuthSuccess: (profile: UserProfile) => void;
  siteConfig?: any;
}

type AuthScreen = "welcome" | "login" | "register" | "support";

// Welcome hero: admin-customizable via Custom Wallpapers (authBgImage).
// Blank until siteconfig loads — no flashing fallback image.

const WELCOME_SLIDES = [
  {
    title: "Runs that pay daily.",
    sub: "Start a run and collect returns every single day.",
  },
  {
    title: "Milestones that move you up.",
    sub: "Finish achievements, unlock new stages, grow your status.",
  },
  {
    title: "One tap keeps the streak.",
    sub: "Check in daily and watch your bonus grow with it.",
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
  // Fire-and-forget recovery desk: phone is the ticket key (direct_<phone>),
  // email + message ride inside the text — no schema change.
  const [recoveryPhone, setRecoveryPhone] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryMsg, setRecoveryMsg] = useState("");
  const [recoverySending, setRecoverySending] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);

  const [localSiteConfig, setLocalSiteConfig] = useState<any>(null);

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
          ? { phone, password, confirmPassword: password, inviteCode: inviteCode.trim().toUpperCase(), username: username.trim() || undefined }
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
        toast.success("Logged in successfully!");
        onAuthSuccess(data.profile);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Welcome hero comes from siteconfig only — blank until it loads, no
  // flashing fallback image and no placeholder logo.
  const heroSrc = fixGitHubImageUrl(activeConfig?.authBgImage || "");

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
      toast.success("Sent to support. They'll reach out — typical response time is 15 mins.", { duration: 6000 });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not reach support. Try again.");
    } finally {
      setRecoverySending(false);
    }
  };
  const brandName = activeConfig?.brandName || "Loading";
  const inviteBonus = Number(activeConfig?.inviteBonus ?? 0);
  const regBonus = Number(activeConfig?.registrationBonus ?? activeConfig?.welcomeBonus ?? 0);

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
                {heroSrc && !heroFailed ? (
                  <>
                    <img
                      src={heroSrc}
                      alt="Operators at work at night"
                      loading="eager"
                      onError={() => setHeroFailed(true)}
                      className="absolute inset-0 w-full h-full object-cover block"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
                  </>
                ) : null}
              </div>

              <div className="space-y-3 mt-6">
                <PrimaryButton onClick={() => goTo("register")} disabled={isLoading}>
                  Register
                </PrimaryButton>
                <GhostButton onClick={() => goTo("login")} disabled={isLoading}>
                  Login
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
                    placeholder="Invite code"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                  />
                  {inviteBonus > 0 && (
                    <p className="mt-1.5 text-xs font-sans text-[var(--theme-primary)] font-semibold">
                      Invite bonus: UGX {inviteBonus.toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="flex-1" />

                {regBonus > 0 && (
                  <div className="relative overflow-hidden rounded-2xl border border-dashed border-[var(--theme-primary)] bg-[var(--theme-primary)]/10 px-4 py-3.5 tile-shimmer-5s">
                    <p className="flex items-center gap-1.5 text-xs font-sans text-[var(--theme-text-muted)]">
                      <Gift className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
                      Plus UGX {regBonus.toLocaleString()} welcome bonus on sign-up.
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
      </div>
    </div>
  );
}
