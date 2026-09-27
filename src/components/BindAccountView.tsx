/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Phone, Wallet, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { UserProfile } from "../types";

interface BindAccountViewProps {
  userProfile: UserProfile;
  onProfileUpdate: (newProfile: UserProfile) => void;
  onBack: () => void;
}

export default function BindAccountView({ userProfile, onProfileUpdate, onBack }: BindAccountViewProps) {
  const [username, setUsername] = useState(userProfile.username || "");
  const [operator, setOperator] = useState<"MTN" | "Airtel">(userProfile.operator || "MTN");
  const [usdtAddress, setUsdtAddress] = useState(userProfile.usdtAddress || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [withdrawalPhone, setWithdrawalPhone] = useState(userProfile.phone || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [successUpdate, setSuccessUpdate] = useState(false);
  const backTimer = useRef<number | null>(null);

  useEffect(() => {
    setUsername(userProfile.username || "");
    setOperator(userProfile.operator || "MTN");
    setUsdtAddress(userProfile.usdtAddress || "");
    setWithdrawalPhone(userProfile.phone || "");
  }, [userProfile]);

  useEffect(() => () => {
    if (backTimer.current) window.clearTimeout(backTimer.current);
  }, []);

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

  return (
    <div className="bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-[24px] p-4 text-[var(--theme-text)] space-y-5 pb-16">
      <button onClick={onBack} className="flex items-center gap-2 text-xs font-extrabold opacity-70 hover:opacity-100 py-1.5 px-3 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] shadow-sm cursor-pointer">
        <ArrowLeft className="w-3.5 h-3.5 text-[var(--theme-primary)]" /> Profile
      </button>

      <div className="space-y-0.5">
        <h4 className="font-display font-black text-base text-[var(--theme-text)] uppercase tracking-tight">Bind Account</h4>
        <p className="text-[12px] font-sans text-[var(--theme-text)] opacity-60">Configure your billing & security</p>
      </div>

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
          variant="gold-matte"
          size="sm"
          type="submit"
          loading={isSavingProfile}
          disabled={isSavingProfile}
          className="w-full"
          glow={false}
        >
          Save Account Data
        </Button>
      </form>
    </div>
  );
}
