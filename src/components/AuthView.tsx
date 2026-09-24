/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { UserProfile } from "../types";
import { Phone, Lock, User, UserPlus, LogIn, ArrowLeft, Eye, EyeOff, MessageSquare, Send, ShieldAlert, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { BrandLogo } from "./BrandLogo";
import { Button } from "./ui/button";
import { fixGitHubImageUrl } from "../utils/imageUtils";
import { useShimmerPulse } from "../hooks/useShimmerPulse";

interface AuthViewProps {
  onAuthSuccess: (profile: UserProfile) => void;
  siteConfig?: any;
}

export default function AuthView({ onAuthSuccess, siteConfig }: AuthViewProps) {
  const [authMode, setAuthMode] = useState<"login" | "register" | "support">("login");
  
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  
  const [localSiteConfig, setLocalSiteConfig] = useState<any>(null);

  useEffect(() => {
    fetch("/api/config/site")
      .then(r => r.json())
      .then(data => {
        if (!data.error) setLocalSiteConfig(data);
      })
      .catch(() => {});
  }, []);

  const activeConfig = localSiteConfig || siteConfig;

  // Sitename shimmer pulse — same gated interval system as the balance cards.
  // AuthView only mounts pre-login, so the interval dies on sign-in.
  const sitenamePulse = useShimmerPulse();

  useEffect(() => {
    let ref = null;
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
      setAuthMode("register");
      setInviteCode(ref.toUpperCase());
      setTimeout(() => {
        toast.success(`Referral code applied: ${ref.toUpperCase()}`);
      }, 500);

      // Keep the referral code in the form, but remove it from the address bar
      // so refreshing or sharing the post-landing URL does not keep reapplying it.
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isRegister = authMode === "register";

    if (!phone || !password) {
      toast.error("Please enter both phone and password.");
      return;
    }
    
    if (!/^\d{9,10}$/.test(phone)) {
      toast.error("Phone number must be 9 or 10 digits.");
      return;
    }

    if (isRegister && password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    if (password.length < 8 || password.length > 128) {
      toast.error("Password must be between 8 and 128 characters.");
      return;
    }

    setIsLoading(true);

    try {
      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const payload = isRegister
        ? { phone, password, confirmPassword, inviteCode, username: username.trim() || undefined }
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

      if (isRegister) {
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
          setAuthMode("login");
          setPassword("");
          setUsername("");
          setConfirmPassword("");
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

  const authBg = fixGitHubImageUrl(activeConfig?.authBgImage);
  const regBonus = Number(activeConfig?.registrationBonus ?? activeConfig?.welcomeBonus ?? 1000);
  const inviteBonus = Number(activeConfig?.inviteBonus ?? 0);
  return (
    <div 
      className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] font-[var(--theme-font-family)] flex flex-col items-center justify-center p-4 relative overflow-y-auto transition-colors"
      style={{
        backgroundImage: authBg ? `linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.75)), url('${authBg}')` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Main Container Envelope */}
      <div className="w-full max-w-xl my-auto z-10 py-6">

        <AnimatePresence mode="wait">


          {/* LOGIN & REGISTER FORM VIEW */}
          {(authMode === "login" || authMode === "register") && (
            <motion.div
              key="auth-form"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -15 }}
              transition={{ duration: 0.3 }}
              className="max-w-md mx-auto bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-[24px] p-6 sm:p-8 shadow-2xl relative overflow-hidden space-y-5"
            >
              {/* Logo and Name WITHIN the form card with NO description */}
              <div className="text-center space-y-1.5 pb-1">
                <BrandLogo siteConfig={activeConfig} className="w-14 h-14 mx-auto block bg-transparent shadow-none" />
                <h2 className={`font-display font-extrabold text-2xl text-[var(--theme-text)]${sitenamePulse ? " animate-shimmer-slow" : ""}`}>
                  {activeConfig?.brandName || " "}
                </h2>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {authMode === "register" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-sans font-bold uppercase tracking-wider text-[var(--theme-text)]">Display Name <span className="normal-case font-normal opacity-50">(Optional)</span></label>
                    <div className="relative">
                      <User className="w-4 h-4 text-[var(--theme-text)] opacity-40 absolute left-3.5 top-3.5" />
                      <input
                        type="text"
                        autoComplete="nickname"
                        maxLength={64}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 input-frosted bg-[var(--theme-bg)]/60 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] text-sm font-sans font-medium rounded-[14px] outline-none transition-colors select-text"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-sans font-bold uppercase tracking-wider text-[var(--theme-text)]">Phone Number</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-[var(--theme-text)] opacity-40 absolute left-3.5 top-3.5" />
                    <input
                      type="tel"
                      required
                      autoComplete="tel"
                      placeholder="e.g. 0770000000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 input-frosted bg-[var(--theme-bg)]/60 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] text-sm font-sans font-medium rounded-[14px] outline-none transition-colors select-text"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-sans font-bold uppercase tracking-wider text-[var(--theme-text)]">Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[var(--theme-text)] opacity-40 absolute left-3.5 top-3.5" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete={authMode === "register" ? "new-password" : "current-password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-3 input-frosted bg-[var(--theme-bg)]/60 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] text-sm font-sans font-medium rounded-[14px] outline-none transition-colors select-text"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3.5 text-[var(--theme-text)] opacity-40 hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {authMode === "register" && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-sans font-bold uppercase tracking-wider text-[var(--theme-text)]">Confirm Password</label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-[var(--theme-text)] opacity-40 absolute left-3.5 top-3.5" />
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          required
                          autoComplete="new-password"
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full pl-10 pr-10 py-3 input-frosted bg-[var(--theme-bg)]/60 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] text-sm font-sans font-medium rounded-[14px] outline-none transition-colors select-text"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-3.5 text-[var(--theme-text)] opacity-40 hover:opacity-100 transition-opacity cursor-pointer"
                        >
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-sans font-bold uppercase tracking-wider text-[var(--theme-text)]">Invite Code <span className="normal-case font-normal opacity-50">(Optional)</span></label>
                        {inviteBonus > 0 && (
                          <span className="text-[11px] font-sans font-medium text-emerald-600">Claim UGX {inviteBonus.toLocaleString()}</span>
                        )}
                      </div>
                      <div className="relative">
                        <UserPlus className="w-4 h-4 text-[var(--theme-text)] opacity-40 absolute left-3.5 top-3.5" />
                        <input
                          type="text"
                          autoComplete="off"
                          placeholder="REFERRAL CODE"
                          value={inviteCode}
                          onChange={(e) => setInviteCode(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 input-frosted bg-[var(--theme-bg)]/60 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] text-[var(--theme-text)] text-sm rounded-[14px] outline-none transition-colors uppercase font-mono font-medium tracking-wide select-text"
                        />
                      </div>
                    </div>
                  </>
                )}

                <Button
                  variant="gold-glossy"
                  size="md"
                  type="submit"
                  loading={isLoading}
                  disabled={isLoading}
                  className="w-full mt-1"
                  glow={false}
                >
                  {authMode === "register" ? (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>REGISTER</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>LOGIN</span>
                    </>
                  )}
                </Button>
              </form>

              {/* Mode Toggles */}
              <div className="text-center pt-1 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === "register" ? "login" : "register");
                  }}
                  className="text-xs font-sans font-semibold text-[var(--theme-primary)] hover:underline cursor-pointer block w-full"
                >
                  {authMode === "register" ? "Already a member? Sign in" : "New member? Create account"}
                </button>
                
                {authMode === "login" && (
                  <button
                    type="button"
                    onClick={() => { setAuthMode("support"); }}
                    className="text-xs font-sans font-normal text-[var(--theme-text)] opacity-50 hover:opacity-100 transition-opacity cursor-pointer block w-full"
                  >
                    Forgot password?
                  </button>
                )}

              </div>
            </motion.div>
          )}

          {/* SUPPORT DESK VIEW - ONLY logo in support desk form, WhatsApp & Telegram placements configured via siteConfig */}
          {authMode === "support" && (
            <motion.div
              key="support"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -15 }}
              transition={{ duration: 0.3 }}
              className="max-w-md mx-auto bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-[24px] p-6 sm:p-8 shadow-2xl relative overflow-hidden space-y-6"
            >
              {/* Only leave the logo in the support desk form with title (no description) */}
              <div className="text-center space-y-2">
                <BrandLogo siteConfig={activeConfig} className="w-14 h-14 mx-auto block bg-transparent shadow-none" />
                <h2 className="text-2xl font-extrabold text-[var(--theme-text)]">Support Desk</h2>
              </div>

              {/* WhatsApp and Telegram Placements configured via siteConfig */}
              <div className="space-y-3 pt-2">
                {/* Telegram Support Placement */}
                <a 
                  href={activeConfig?.whatsappLink || "https://t.me/#"} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="btn-3d-secondary w-full py-3.5 px-4 flex items-center gap-3 text-[var(--theme-text)] cursor-pointer hover:border-sky-500/50 transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-6 h-6 shrink-0 fill-sky-500"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z"/></svg>
                  <div className="text-left font-sans flex-1">
                    <div className="font-bold text-sm">Telegram Support</div>
                    <div className="text-xs opacity-70">Live agent chat</div>
                  </div>
                </a>
                
                {/* Telegram Channel Placement */}
                <a 
                  href={activeConfig?.telegramLink || "https://t.me/#"} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="btn-3d-secondary w-full py-3.5 px-4 flex items-center gap-3 text-[var(--theme-text)] cursor-pointer hover:border-sky-500/50 transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-6 h-6 shrink-0 fill-sky-500"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z"/></svg>
                  <div className="text-left font-sans flex-1">
                    <div className="font-bold text-sm">Telegram Channel</div>
                    <div className="text-xs opacity-70">Official community announcements</div>
                  </div>
                </a>
              </div>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => { setAuthMode("login"); }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--theme-primary)] hover:underline cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>

      </div>
    </div>
  );
}
