/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Phone, Wallet, CheckCircle2, Home, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { UserProfile } from "../types";
import { useTelegramLogin } from "../hooks/useTelegramLogin";

interface BindAccountViewProps {
  userProfile: UserProfile;
  onProfileUpdate: (newProfile: UserProfile) => void;
  onBack: () => void;
  onGoHome: () => void;
}

export default function BindAccountView({ userProfile, onProfileUpdate, onBack, onGoHome }: BindAccountViewProps) {
  const [username, setUsername] = useState(userProfile.username || "");
  const [operator, setOperator] = useState<"MTN" | "Airtel">((userProfile.operator as "MTN" | "Airtel") || "MTN");
  const [usdtAddress, setUsdtAddress] = useState(userProfile.usdtAddress || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [withdrawalPhone, setWithdrawalPhone] = useState(userProfile.phone || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [successUpdate, setSuccessUpdate] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<{ linked: boolean; isAdmin: boolean } | null>(null);
  // Confirm-screen flow: pill -> cookie check -> Telegram popup (pending
  // id_token, nothing saved) -> confirm view -> Home saves + navigates.
  const [telegramView, setTelegramView] = useState<"form" | "confirm">("form");
  const [pendingTelegramToken, setPendingTelegramToken] = useState<string | null>(null);
  const [telegramSaving, setTelegramSaving] = useState(false);
  const backTimer = useRef<number | null>(null);

  useEffect(() => {
    setUsername(userProfile.username || "");
    setOperator((userProfile.operator as "MTN" | "Airtel") || "MTN");
    setUsdtAddress(userProfile.usdtAddress || "");
    setWithdrawalPhone(userProfile.phone || "");
  }, [userProfile]);

  useEffect(() => () => {
    if (backTimer.current) window.clearTimeout(backTimer.current);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/telegram/status").then((response) => response.ok ? response.json() : null)
      .then((data) => { if (alive && data) setTelegramStatus(data); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const handleTelegramPopupAuth = (payload: Record<string, unknown>) => {
    const idToken = payload.id_token;
    if (typeof idToken !== "string" || !idToken) return;
    // Cookie already verified before opening the popup; hold the token in
    // memory and show the confirm screen. The link POST happens on Home.
    setPendingTelegramToken(idToken);
    setTelegramView("confirm");
  };
  const telegramHook = useTelegramLogin(handleTelegramPopupAuth);

  // Pill tap: verify the session cookie first (linking without a valid
  // session would let anyone bind their Telegram to someone else's phone
  // account), then open the Telegram popup.
  const handleTelegramPillClick = async () => {
    if (telegramHook.status !== "ready") {
      if (telegramHook.status === "failed") telegramHook.retry();
      return;
    }
    try {
      const response = await fetch("/api/auth/telegram/status");
      if (!response.ok) {
        toast.error("Session expired. Please log in again.");
        return;
      }
      telegramHook.authenticate();
    } catch {
      toast.error("Session expired. Please log in again.");
    }
  };

  // Home: single action that saves the connection, then navigates. The
  // button stays in loader state until the save resolves, so a failed save
  // never navigates away.
  const handleTelegramConfirmHome = async () => {
    if (!pendingTelegramToken || telegramSaving) return;
    setTelegramSaving(true);
    let status = 0;
    try {
      const response = await fetch("/api/auth/telegram/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: pendingTelegramToken })
      });
      status = response.status;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((data as { error?: string }).error || "Telegram link could not be saved.");
      setTelegramStatus({ linked: true, isAdmin: false });
      setPendingTelegramToken(null);
      setTelegramView("form");
      toast.success("Telegram account linked.");
      onGoHome();
    } catch (error: any) {
      const message = error.message || "Telegram link could not be saved.";
      toast.error(message);
      // Dead tokens (expired/unavailable) and conflicts can never succeed on
      // retry — drop back to the pill so the user reconnects. Anything else
      // (e.g. network) keeps the confirm screen so Home can be retried.
      if (status === 400 || status === 409 || status === 503 || /expir|reconnect|unavailable|already linked/i.test(message)) {
        setPendingTelegramToken(null);
        setTelegramView("form");
      }
    } finally {
      setTelegramSaving(false);
    }
  };

  const handleTelegramConfirmBack = () => {
    // Discard the pending token — nothing was persisted.
    setPendingTelegramToken(null);
    setTelegramView("form");
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessUpdate(false);

    if (newPassword && newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    if (!/^\d{9,10}$/.test(withdrawalPhone)) {
      toast.error("Withdrawal phone number must be 9 or 10 digits.");
      return;
    }

    setIsSavingProfile(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: userProfile.phone,
          username,
          operator,
          customPhone: withdrawalPhone,
          usdtAddress,
          newPassword: newPassword || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Profile ledger update failed.");
      }

      onProfileUpdate(data.profile);
      setSuccessUpdate(true);
      toast.success("Account preferences updated successfully.");
      if (newPassword) {
        setNewPassword("");
        setConfirmPassword("");
        toast.info("Password saved.");
      }
      backTimer.current = window.setTimeout(() => {
        setSuccessUpdate(false);
        onBack();
      }, 1500);
    } catch (err: any) {
      toast.error(err.message || "Failed to edit user settings.");
    } finally {
      setIsSavingProfile(false);
    }
  };

    // Confirm screen: shows the connected account + Telegram connected state.
  // Nothing is saved until Home is tapped.
  if (telegramView === "confirm") {
    const initial = (username.trim() || userProfile.phone || "?").charAt(0).toUpperCase();
    return (
      <div className="bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-[24px] p-4 text-[var(--theme-text)] space-y-5 pb-16">
        <button onClick={handleTelegramConfirmBack} className="flex items-center gap-2 text-xs font-extrabold opacity-70 hover:opacity-100 py-1.5 px-3 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] shadow-sm cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5 text-[var(--theme-primary)]" /> Bind Account
        </button>

        <div className="space-y-0.5 text-center">
          <h4 className="font-display font-black text-base text-[var(--theme-text)] uppercase tracking-tight">Connect Telegram</h4>
          <p className="text-[12px] font-sans text-[var(--theme-text)] opacity-60">Review and confirm</p>
        </div>

        <div className="rounded-2xl border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/40 p-4 flex items-center gap-3">
          <span className="w-11 h-11 rounded-full bg-[var(--theme-primary)]/15 text-[var(--theme-primary)] font-display font-black text-lg flex items-center justify-center shrink-0">
            {initial}
          </span>
          <div className="min-w-0 text-left">
            <div className="text-sm font-display font-black truncate">{username.trim() || userProfile.phone}</div>
            <div className="text-xs font-sans opacity-60 truncate">{userProfile.phone}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4" aria-hidden="true">
          <span className="flex-1 h-px bg-[var(--theme-card-border)]" />
          <Link2 className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
          <span className="flex-1 h-px bg-[var(--theme-card-border)]" />
        </div>

        <div className="rounded-2xl border border-[var(--theme-primary)]/30 bg-[var(--theme-primary)]/10 p-4 flex items-center justify-center gap-2">
          <img src="/telegram.svg" alt="" aria-hidden="true" className="h-5 w-5 shrink-0 object-contain" />
          <span className="text-sm font-sans font-bold">Telegram connected</span>
          <CheckCircle2 className="w-4 h-4 text-[var(--theme-primary)]" />
        </div>

        <Button
          variant="primary"
          size="sm"
          type="button"
          loading={telegramSaving}
          disabled={telegramSaving || !pendingTelegramToken}
          onClick={handleTelegramConfirmHome}
          className="w-full"
        >
          {!telegramSaving && <Home className="w-4 h-4" />}
          Home
        </Button>
        <p className="text-center text-[11px] font-sans opacity-60 -mt-3">
          Home saves this connection and takes you to your dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-[24px] p-4 text-[var(--theme-text)] space-y-5 pb-16">
      <button onClick={onBack} className="flex items-center gap-2 text-xs font-extrabold opacity-70 hover:opacity-100 py-1.5 px-3 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] shadow-sm cursor-pointer">
        <ArrowLeft className="w-3.5 h-3.5 text-[var(--theme-primary)]" /> Profile
      </button>

      <div className="space-y-0.5">
        <h4 className="font-display font-black text-base text-[var(--theme-text)] uppercase tracking-tight">Bind Account</h4>
        <p className="text-[12px] font-sans text-[var(--theme-text)] opacity-60">Configure your billing & security</p>
      </div>

      {telegramStatus && !telegramStatus.isAdmin && (
        <section className="rounded-2xl border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/40 p-4 space-y-2">
          <h5 className="text-sm font-display font-black">Telegram sign-in</h5>
          {telegramStatus.linked ? (
            <p className="text-xs font-sans opacity-70">Your Telegram account is linked. You can use it to sign in.</p>
          ) : (
            <button
              type="button"
              onClick={handleTelegramPillClick}
              disabled={telegramHook.status === "loading"}
              className="flex w-full items-center gap-2 rounded-2xl border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] px-4 py-3 text-[14px] font-sans font-semibold text-[var(--theme-text)] transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              <img src="/telegram.svg" alt="" aria-hidden="true" className="h-5 w-5 shrink-0 object-contain" />
              {telegramHook.status === "loading" ? (
                <>
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                  <span className="opacity-70">Connecting…</span>
                </>
              ) : (
                <span>{telegramHook.status === "failed" ? "Retry Telegram" : "Connect Telegram"}</span>
              )}
            </button>
          )}
        </section>
      )}

      <form onSubmit={handleSaveProfile} className="space-y-4">
        <div className="space-y-1">
          <label className="text-[12px] font-sans uppercase text-[var(--theme-text)] opacity-70 font-bold block">Display Name</label>
          <input
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-2.5 input-frosted bg-[var(--theme-bg)]/60 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] text-[var(--theme-text)] text-xs rounded-[var(--theme-radius)] outline-none font-sans font-medium transition-colors select-text"
            placeholder="Username display"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[12px] font-sans uppercase text-[var(--theme-text)] opacity-70 font-bold block">Phone Number</label>
          <div className="relative">
            <Phone className="w-3.5 h-3.5 text-[var(--theme-text)] opacity-50 absolute left-3 top-3.5" />
            <input
              type="tel"
              required
              autoComplete="tel"
              value={withdrawalPhone}
              disabled={true} readOnly
              onChange={(e) => setWithdrawalPhone(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 input-frosted bg-[var(--theme-bg)]/60 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] text-[var(--theme-text)] text-xs rounded-[var(--theme-radius)] outline-none font-sans opacity-70 select-text"
              placeholder="+25677..."
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[12px] font-sans uppercase text-[var(--theme-text)] opacity-70 font-bold block">USDT Wallet Address (Optional)</label>
          <div className="relative">
            <Wallet className="w-3.5 h-3.5 text-[var(--theme-text)] opacity-50 absolute left-3 top-3.5" />
            <input
              type="text"
              autoComplete="off"
              value={usdtAddress}
              onChange={(e) => setUsdtAddress(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 input-frosted bg-[var(--theme-bg)]/60 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] text-[var(--theme-text)] text-xs rounded-[var(--theme-radius)] outline-none font-sans transition-colors select-text"
              placeholder="T..."
            />
          </div>
        </div>

        <div className="space-y-1 pt-2 border-t border-[var(--theme-card-border)]">
          <label className="text-[12px] font-sans uppercase text-[var(--theme-text)] opacity-70 font-bold block">Update Password (Optional)</label>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-4 py-2.5 input-frosted bg-[var(--theme-bg)]/60 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] text-[var(--theme-text)] text-xs rounded-[var(--theme-radius)] outline-none font-sans transition-colors select-text"
            placeholder="New password"
          />
        </div>

        {newPassword && (
          <div className="space-y-1">
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2.5 input-frosted bg-[var(--theme-bg)]/60 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] text-[var(--theme-text)] text-xs rounded-[var(--theme-radius)] outline-none font-sans transition-colors select-text"
              placeholder="Confirm new password"
            />
          </div>
        )}

        {successUpdate && (
          <div className="text-center text-[11px] text-emerald-400 font-sans py-1 flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>✓ System settings saved offline!</span>
          </div>
        )}

        <Button
          variant="primary"
          size="sm"
          type="submit"
          loading={isSavingProfile}
          disabled={isSavingProfile}
          className="w-full"
        >
          Save Account Data
        </Button>
      </form>
    </div>
  );
}
