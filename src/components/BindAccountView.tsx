/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Phone, Wallet, CheckCircle2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { UserProfile } from "../types";
import CurrencyFlagSelect from "./CurrencyFlagSelect";

interface BindAccountViewProps {
  userProfile: UserProfile;
  onProfileUpdate: (newProfile: UserProfile) => void;
  onBack: () => void;
}

export default function BindAccountView({ userProfile, onProfileUpdate, onBack }: BindAccountViewProps) {
  const [username, setUsername] = useState(userProfile.username || "");
  const [operator, setOperator] = useState<"MTN" | "Airtel">((userProfile.operator as "MTN" | "Airtel") || "MTN");
  const [usdtAddress, setUsdtAddress] = useState(userProfile.usdtAddress || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [withdrawalPhone, setWithdrawalPhone] = useState(userProfile.phone || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [successUpdate, setSuccessUpdate] = useState(false);
  // Email is editable and is what a password reset code is delivered to.
  // Verification is a separate step, so a saved address is never presented as
  // proven until the code sent to it has been entered.
  const [email, setEmail] = useState(userProfile.email || "");
  const [verifyCode, setVerifyCode] = useState("");
  const [verifySent, setVerifySent] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const backTimer = useRef<number | null>(null);

  useEffect(() => {
    setUsername(userProfile.username || "");
    setOperator((userProfile.operator as "MTN" | "Airtel") || "MTN");
    setUsdtAddress(userProfile.usdtAddress || "");
    setWithdrawalPhone(userProfile.phone || "");
    setEmail(userProfile.email || "");
  }, [userProfile]);

  useEffect(() => () => {
    if (backTimer.current) window.clearTimeout(backTimer.current);
  }, []);

  const emailIsVerified =
    Boolean(userProfile.emailVerifiedAt) &&
    (userProfile.email || "").toLowerCase() === email.trim().toLowerCase();

  // Step one: ask the server to mail a code to whatever is in the field. The
  // endpoint refuses an address that belongs to another account.
  const requestEmailCode = async () => {
    const target = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(target)) {
      toast.error("Enter a valid email address first.");
      return;
    }
    setVerifyBusy(true);
    try {
      const res = await fetch("/api/auth/verify-email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Could not send the code.");
      }
      setVerifySent(true);
      toast.success("Verification code sent.");
    } catch (error: any) {
      toast.error(error.message || "Could not send the code.");
    } finally {
      setVerifyBusy(false);
    }
  };

  // Step two: spend the code. Confirming is what writes the address onto the
  // account and stamps it verified, so this can run before or after a save.
  const confirmEmailCode = async () => {
    const target = email.trim().toLowerCase();
    if (!/^\d{4,8}$/.test(verifyCode.trim())) {
      toast.error("Enter the code from your email.");
      return;
    }
    setVerifyBusy(true);
    try {
      const res = await fetch("/api/auth/verify-email/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target, code: verifyCode.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "That code is invalid or has expired.");
      onProfileUpdate({ ...userProfile, email: target, emailVerifiedAt: new Date().toISOString() });
      setVerifyCode("");
      setVerifySent(false);
      toast.success("Email verified.");
    } catch (error: any) {
      toast.error(error.message || "That code is invalid or has expired.");
    } finally {
      setVerifyBusy(false);
    }
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
          email,
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

  return (
    <div className="bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-[24px] p-4 text-[var(--theme-text)] space-y-5 pb-16">
      <button onClick={onBack} className="flex items-center gap-2 text-xs font-extrabold opacity-70 hover:opacity-100 py-1.5 px-3 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] shadow-sm cursor-pointer">
        <ArrowLeft className="w-3.5 h-3.5 text-[var(--theme-primary)]" /> Profile
      </button>

      <div className="space-y-0.5">
        <h4 className="font-display font-black text-base text-[var(--theme-text)] uppercase tracking-tight">Update Account Info</h4>
        <p className="text-[12px] font-sans text-[var(--theme-text)] opacity-60">Configure your billing details & security</p>
      </div>

      <form onSubmit={handleSaveProfile} className="space-y-4">
        <div className="space-y-1">
          <label className="text-[12px] font-sans uppercase text-[var(--theme-text)] opacity-70 font-bold block">Username / Invite Code</label>
          <input
            type="text"
            required
            value={username}
            disabled
            readOnly
            className="w-full px-4 py-2.5 input-frosted bg-[var(--theme-bg)]/40 border border-[var(--theme-card-border)] text-[var(--theme-text)] text-xs rounded-[var(--theme-radius)] outline-none font-sans font-medium opacity-60 cursor-not-allowed select-text"
            aria-describedby="username-invite-note"
          />
          <p id="username-invite-note" className="text-[11px] text-[var(--theme-text)] opacity-50">
            This is your permanent username and invite code.
          </p>
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
          <label className="text-[12px] font-sans uppercase text-[var(--theme-text)] opacity-70 font-bold block">Email Address</label>
          <div className="relative">
            <Mail className="w-3.5 h-3.5 text-[var(--theme-text)] opacity-50 absolute left-3 top-3.5" />
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setVerifySent(false);
                setVerifyCode("");
              }}
              className="w-full pl-9 pr-4 py-2.5 input-frosted bg-[var(--theme-bg)]/60 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] text-[var(--theme-text)] text-xs rounded-[var(--theme-radius)] outline-none font-sans transition-colors select-text"
              placeholder="you@example.com"
            />
          </div>
          <p className="text-[11px] text-[var(--theme-text)] opacity-50" aria-live="polite">
            {emailIsVerified ? (
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                <CheckCircle2 className="w-3 h-3" /> Verified — used for password recovery.
              </span>
            ) : email.trim() ? (
              "Not verified yet. Save, then confirm the code we send you."
            ) : (
              "Optional. Used to recover your account if you lose your phone."
            )}
          </p>

          {!emailIsVerified && email.trim() && (
            verifySent ? (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="Code"
                  aria-label="Verification code"
                  className="min-w-0 flex-1 px-4 py-2.5 input-frosted bg-[var(--theme-bg)]/60 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] text-[var(--theme-text)] text-xs rounded-[var(--theme-radius)] outline-none font-sans tabular-nums tracking-[0.2em]"
                />
                <Button variant="primary" size="sm" type="button" loading={verifyBusy} disabled={verifyBusy} onClick={() => void confirmEmailCode()}>
                  Verify
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void requestEmailCode()}
                disabled={verifyBusy}
                className="pt-1 text-[11px] font-sans font-bold text-[var(--theme-primary)] transition-opacity hover:underline disabled:opacity-50 cursor-pointer"
              >
                Send verification code
              </button>
            )
          )}
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

        {/* Display currency: the same flag control as the home card, so there is
            one way to change it rather than two. Uganda is the only market the
            product settles in locally, so it is the only one that can switch. */}
        <div className="space-y-1.5 pt-2 border-t border-[var(--theme-card-border)]">
          <label className="text-[12px] font-sans uppercase text-[var(--theme-text)] opacity-70 font-bold block">Display Currency</label>
          <div className="flex items-center justify-between gap-3">
            <CurrencyFlagSelect size="md" />
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
