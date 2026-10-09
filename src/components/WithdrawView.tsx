import React, { useState, useEffect, useRef } from "react";
import { useGatedInterval } from "../hooks/useGatedInterval";
import { UserProfile, SubscribedNode } from "../types";
import {
  ArrowLeft,
  Phone,
  Copy,
  AlertTriangle,
  CheckCircle2,
  Info,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import VisaMetricCard from "./VisaMetricCard";
import { Button } from "./ui/button";

interface WithdrawViewProps {
  userProfile: UserProfile;
  siteConfig?: any;
  activeNodes?: SubscribedNode[];
  onBack: () => void;
  onProfileUpdate: (p: UserProfile) => void;
}

export default function WithdrawView({
  userProfile,
  siteConfig,
  activeNodes = [],
  onBack,
  onProfileUpdate,
}: WithdrawViewProps) {
  const { formatCurrency, currency } = useCurrency();

  const minimumWithdrawal =
    Number(siteConfig?.minimumWithdrawal) > 0 ? Math.floor(Number(siteConfig.minimumWithdrawal)) : 0;
  const maximumWithdrawal =
    Number(siteConfig?.maximumWithdrawal) > 0 ? Math.floor(Number(siteConfig.maximumWithdrawal)) : 0;
  const withdrawalMode = (siteConfig?.withdrawMode || siteConfig?.withdrawalMode || "automatic") as string;

  const [pointsToWithdraw, setPointsToWithdraw] = useState<number>(0);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawOperator, setWithdrawOperator] = useState<"MTN" | "Airtel" | "USDT">(
    (userProfile.operator as any) || "MTN"
  );
  const [withdrawalPhone, setWithdrawalPhone] = useState(userProfile.phone || "");
  const [usdtAddress, setUsdtAddress] = useState(userProfile.usdtAddress || "");
  const [paymentStatus, setPaymentStatus] = useState<"IDLE" | "PENDING" | "SUCCESSFUL" | "FAILED">("IDLE");
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [trackingUnavailable, setTrackingUnavailable] = useState(false);
  const [lastPayout, setLastPayout] = useState<number>(0);
  const [pollDelay, setPollDelay] = useState(3000);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setWithdrawalPhone(userProfile.phone || "");
    setUsdtAddress(userProfile.usdtAddress || "");
    setWithdrawOperator((userProfile.operator as any) || "MTN");
  }, [userProfile]);

  useEffect(() => {
    if (paymentStatus !== "PENDING" || !transactionId) {
      setPollDelay(3000);
      abortRef.current?.abort();
      return;
    }
    setPollDelay(3000);
  }, [paymentStatus, transactionId]);

  const refreshProfile = async () => {
    const response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    if (data.profile) onProfileUpdate(data.profile);
  };

  const checkStatus = async () => {
    if (document.hidden || paymentStatus !== "PENDING" || !transactionId) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const response = await fetch("/api/payment/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trans_id: transactionId }),
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted || !response.ok) return;
      const data = await response.json();
      if (data.status === "SUCCESSFUL") {
        setPaymentStatus("SUCCESSFUL");
        if (data.profile) onProfileUpdate(data.profile);
        else await refreshProfile();
        toast.success("Withdrawal completed successfully.");
      } else if (data.status === "FAILED") {
        setPaymentStatus("FAILED");
        setErrorMsg(data.error || "The withdrawal failed. Any deducted balance has been returned.");
        if (data.profile) onProfileUpdate(data.profile);
        else await refreshProfile();
        toast.error("Withdrawal failed. Your balance has been updated.");
      } else {
        setPollDelay((delay) => delay === 3000 ? 5000 : 10000);
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") console.error("Error polling withdrawal status:", err);
    }
  };

  useGatedInterval(() => { void checkStatus(); }, pollDelay, {
    enabled: paymentStatus === "PENDING" && !!transactionId,
    visibilityGate: true,
  });

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const handleWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeNodes || activeNodes.length === 0) {
      toast.error("Purchase a product before requesting a withdrawal.");
      return;
    }
    if (!Number.isInteger(pointsToWithdraw) || pointsToWithdraw < minimumWithdrawal) {
      toast.error(`The minimum withdrawal is ${formatCurrency(minimumWithdrawal)}.`);
      return;
    }
    if (maximumWithdrawal > 0 && pointsToWithdraw > maximumWithdrawal) {
      toast.error(`The maximum withdrawal is ${formatCurrency(maximumWithdrawal)}.`);
      return;
    }
    if (pointsToWithdraw > (userProfile.points || 0)) {
      toast.error(`Your available balance is ${formatCurrency(userProfile.points || 0)}.`);
      return;
    }
    if (withdrawOperator === "USDT") {
      if (usdtAddress.length < 10) {
        toast.error("Enter a valid USDT wallet address.");
        return;
      }
    } else {
      if (!/^\d{9,10}$/.test(withdrawalPhone)) {
        toast.error("Enter a withdrawal phone number with 9 or 10 digits.");
        return;
      }
    }
    setIsWithdrawing(true);
    setErrorMsg("");
    setTrackingUnavailable(false);
    try {
      const res = await fetch("/api/payment/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: userProfile.phone,
          amount: pointsToWithdraw,
          operator: withdrawOperator,
          withdrawPhone: withdrawOperator === "USDT" ? usdtAddress : withdrawalPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Withdrawal rejected.");
      onProfileUpdate(data.profile);
      setLastPayout(pointsToWithdraw);
      setTransactionId(data.transaction?.id || null);
      const canPoll = Boolean(data.transaction?.id);
      if (data.status === "FAILED") setErrorMsg(data.error || "The withdrawal failed. Your balance has been updated.");
      else if (data.status !== "SUCCESSFUL" && data.status !== "FAILED" && !canPoll) {
        setTrackingUnavailable(true);
        setErrorMsg("We received your request but could not get a tracking ID. Refresh your balance or contact support before trying again.");
      }
      setPaymentStatus(data.status === "SUCCESSFUL" ? "SUCCESSFUL" : data.status === "FAILED" || !canPoll ? "FAILED" : "PENDING");
      if (data.status === "FAILED") toast.error("Withdrawal failed. Your balance has been updated.");
      else if (!canPoll && data.status !== "SUCCESSFUL") {
        try { await refreshProfile(); } catch { /* Keep the tracking issue visible. */ }
        toast.error("We couldn’t track this withdrawal. Check your balance before trying again.");
      }
      else if (data.status === "SUCCESSFUL") toast.success("Withdrawal completed successfully.");
      else toast.success(data.mode === "manual" || withdrawOperator === "USDT"
        ? "Withdrawal request submitted. We’ll update you after review."
        : "Withdrawal request sent. Waiting for provider confirmation.");
      setPointsToWithdraw(0);
    } catch (err: any) {
      setPaymentStatus("IDLE");
      try { await refreshProfile(); } catch { /* Keep the original withdrawal error visible. */ }
      toast.error(err.message || "Something went wrong.");
    } finally {
      setIsWithdrawing(false);
    }
  };

  const feePct = Number(siteConfig?.withdrawFee || 0);
  const feeAmount = Math.floor(pointsToWithdraw * (feePct / 100));
  const payout = Math.max(0, pointsToWithdraw - feeAmount);
  const isManualPayout = withdrawalMode === "manual" || withdrawOperator === "USDT";
  const statusTitle = paymentStatus === "PENDING" ? "Withdrawal processing" : paymentStatus === "FAILED" ? trackingUnavailable ? "Unable to track withdrawal" : "Withdrawal failed" : "Withdrawal complete";
  const statusDescription = paymentStatus === "FAILED"
    ? errorMsg
    : paymentStatus === "PENDING"
    ? `${formatCurrency(lastPayout)} requested. ${isManualPayout ? "Awaiting admin approval." : "Waiting for provider confirmation."}`
    : "Your withdrawal is settled. Check your balance and destination for the final amount.";
  const statusLabel = trackingUnavailable ? "Unknown" : paymentStatus === "SUCCESSFUL" ? "Completed" : paymentStatus === "FAILED" ? "Failed" : "Pending";
  const statusColor = trackingUnavailable ? "text-[var(--theme-text)] opacity-60" : paymentStatus === "SUCCESSFUL" ? "text-emerald-600" : paymentStatus === "FAILED" ? "text-rose-600" : "text-amber-600";

  const PillBtn: React.FC<{
    active: boolean;
    onClick: () => void;
    label: string;
    sub: string;
    icon?: React.ReactNode;
  }> = ({ active, onClick, label, sub, icon }) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2.5 py-3.5 relative text-[11px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
        active ? "text-[var(--theme-primary)]" : "text-[var(--theme-text)] opacity-60 hover:opacity-100"
      }`}
    >
      {icon ? <span className="shrink-0 flex items-center justify-center gap-1.5">{icon}</span> : null}
      <span className="flex flex-col items-start leading-none">
        <span className="text-[11px] leading-none">{label}</span>
        {sub ? <span className="text-[9px] font-bold normal-case opacity-60 leading-none mt-1">{sub}</span> : null}
      </span>
      {active && <span className="absolute bottom-0 left-2 right-2 h-[3px] bg-[var(--theme-primary)] rounded-full" />}
    </button>
  );

  if (paymentStatus !== "IDLE") {
    return (
      <div className="bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] text-[var(--theme-text)] p-4 pt-4 min-h-[100dvh] space-y-4 select-none">
        {/* Top bar — back + title on one level */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setPaymentStatus("IDLE");
              onBack();
            }}
            aria-label="Go back"
            className="w-10 h-10 rounded-full bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] flex items-center justify-center hover:border-[var(--theme-primary)]/40 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display font-black tracking-tight text-[26px] leading-none text-[var(--theme-text)] truncate">Withdraw funds</h1>
            <p className="text-[13px] font-sans font-medium text-[var(--theme-text)] opacity-60 mt-1 truncate">Withdraw to mobile money or a USDT wallet.</p>
          </div>
        </div>
        <div className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-8 text-center space-y-5 shadow-sm">
          {paymentStatus === "PENDING" ? (
            <div className="w-14 h-14 mx-auto rounded-full border-2 border-[var(--theme-primary)]/20 border-t-[var(--theme-primary)] animate-spin" />
          ) : paymentStatus === "FAILED" ? (
            <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-500"><AlertTriangle className="w-10 h-10" /></div>
          ) : (
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-500">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          )}
          <div className="space-y-1">
            <h3 className="font-black text-sm uppercase tracking-wide">{statusTitle}</h3>
            <p className="text-xs font-bold opacity-60 max-w-sm mx-auto leading-relaxed">
              {statusDescription}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] p-4 max-w-xs mx-auto text-left space-y-2 text-xs font-bold">
            <div className="flex justify-between">
              <span className="opacity-60">Requested</span>
              <span>{formatCurrency(lastPayout)}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-60">Status</span>
              <span className={statusColor}>{statusLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-60">Destination</span>
              <span className="text-[var(--theme-primary)] truncate ml-2">
                {withdrawOperator === "USDT" ? usdtAddress.slice(0, 12) + "…" : withdrawalPhone}
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              setPaymentStatus("IDLE");
              onBack();
            }}
            className="w-full py-4 rounded-2xl bg-[var(--theme-primary)] text-[var(--theme-on-primary)] font-sans font-extrabold text-sm shadow-[0_3px_0_0_var(--theme-primary-shadow)] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
          >
            {paymentStatus === "PENDING" ? "Return to account" : "Done"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] text-[var(--theme-text)] space-y-4 select-none p-4 pt-0 min-h-[100dvh]">
      {/* Top — back + title + balance flow with the page */}
      <div className="pt-4 space-y-4">
        {/* Top bar — back + title on one level */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label="Go back"
            className="w-10 h-10 rounded-full bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] flex items-center justify-center hover:border-[var(--theme-primary)]/40 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display font-black tracking-tight text-[26px] leading-none text-[var(--theme-text)] truncate">Withdraw funds</h1>
            <p className="text-[13px] font-sans font-medium text-[var(--theme-text)] opacity-60 mt-1 truncate">Withdraw to mobile money or a USDT wallet.</p>
          </div>
        </div>

        {/* Visa balance card — withdrawable only */}
        <VisaMetricCard
          mode="single"
          leftLabel="Withdrawable balance"
          leftValue={formatCurrency(userProfile.points || 0)}
        />
      </div>

      <div className="rounded-[var(--theme-radius)] overflow-hidden">
        <div className="p-3 border-b border-[var(--theme-card-border)] space-y-3">
          <h2 className="text-[15px] font-sans font-extrabold tracking-tight">Payout method</h2>
          <div className="flex gap-1 border-b border-[var(--theme-card-border)]">
            <PillBtn
              active={withdrawOperator !== "USDT"}
              onClick={() => setWithdrawOperator((userProfile.operator as any) === "Airtel" ? "Airtel" : "MTN")}
              label="Mobile Money"
              sub=""
              icon={
                <span className="flex items-center gap-1.5">
                  {siteConfig?.mtnLogoUrl ? (
                    <img src={siteConfig.mtnLogoUrl} alt="MTN" className="w-10 h-10 rounded-full bg-white object-contain" style={{ padding: 4 }} />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-[#FFCC00] text-black text-[11px] flex items-center justify-center font-black">MTN</span>
                  )}
                  {siteConfig?.airtelLogoUrl ? (
                    <img src={siteConfig.airtelLogoUrl} alt="Airtel" className="w-10 h-10 rounded-full bg-white object-contain" style={{ padding: 3 }} />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-[#FF0000] text-white text-[10px] flex items-center justify-center font-black">Air</span>
                  )}
                </span>
              }
            />
            <PillBtn
              active={withdrawOperator === "USDT"}
              onClick={() => setWithdrawOperator("USDT")}
              label="USDT"
              sub={siteConfig?.usdtNetwork || "TRC20"}
              icon={
                siteConfig?.usdtLogoUrl ? (
                  <img src={siteConfig.usdtLogoUrl} alt="USDT" className="w-10 h-10 rounded-full bg-white object-contain" style={{ padding: 2 }} />
                ) : (
                  <span className="w-10 h-10 rounded-full bg-[#26A17B] text-white text-[15px] flex items-center justify-center font-black">₮</span>
                )
              }
            />
          </div>
        </div>

        <form onSubmit={handleWithdrawal} className="p-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-sans font-medium opacity-60">
              {withdrawOperator === "USDT" ? "USDT wallet address" : "Withdrawal phone number"}
            </label>
            <div className="relative">
              {withdrawOperator !== "USDT" && <Phone className="w-4 h-4 text-[var(--theme-primary)] absolute left-3.5 top-1/2 -translate-y-1/2" />}
              <input
                type={withdrawOperator === "USDT" ? "text" : "tel"}
                required
                value={withdrawOperator === "USDT" ? usdtAddress : withdrawalPhone}
                disabled={withdrawOperator !== "USDT"}
                readOnly={withdrawOperator !== "USDT"}
                onChange={(e) => {
                  if (withdrawOperator === "USDT") setUsdtAddress(e.target.value);
                }}
                className={`w-full ${withdrawOperator === "USDT" ? "px-4" : "pl-10 pr-4"} py-4 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] text-[var(--theme-text)] text-[15px] rounded-2xl outline-none font-bold placeholder:font-medium placeholder:opacity-40 focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] transition-all disabled:opacity-60`}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-sans font-medium opacity-60">Amount (UGX)</label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                required
                min={minimumWithdrawal}
                max={maximumWithdrawal > 0 ? maximumWithdrawal : undefined}
                value={pointsToWithdraw || ""}
                onChange={(e) => setPointsToWithdraw(parseInt(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                className="w-full px-4 py-4 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] text-[var(--theme-text)] text-[15px] rounded-2xl outline-none font-bold placeholder:font-medium placeholder:opacity-40 focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] transition-all pr-20"
              />
              <button
                type="button"
                onClick={() =>
                  setPointsToWithdraw(Math.min(userProfile.points || 0, maximumWithdrawal > 0 ? maximumWithdrawal : userProfile.points || 0))
                }
                className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[11px] font-black rounded-full transition-colors cursor-pointer uppercase"
              >
                MAX
              </button>
            </div>
            {pointsToWithdraw > 0 && pointsToWithdraw > (userProfile.points || 0) && (
              <p className="text-[11px] text-rose-500 font-bold">Insufficient withdrawable balance.</p>
            )}
          </div>

          <div className="space-y-2.5 p-3 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)]">
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="opacity-60 uppercase tracking-wider text-[11px]">Withdraw fee</span>
              <span className="px-2.5 py-0.5 bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] rounded-full text-xs font-black">
                {feePct}%
              </span>
            </div>
            <div className="border-t border-[var(--theme-card-border)]" />
            <div className="flex justify-between text-sm font-black">
              <span>Estimated payout</span>
              <span>{formatCurrency(payout)}</span>
            </div>
            {withdrawOperator === "USDT" && (
              <>
                <div className="flex justify-between text-sm font-black text-emerald-600 border-t border-[var(--theme-card-border)]/50 pt-2">
                  <span>USDT payout</span>
                  <span>≈ ${(payout / (siteConfig?.usdtRate || 3700)).toFixed(2)} USDT</span>
                </div>
                <div className="flex justify-between text-[11px] opacity-60 font-bold">
                  <span>Rate</span>
                  <span>1 USDT = {formatCurrency(siteConfig?.usdtRate || 3700)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-xs opacity-60 font-bold">
              <span>Fee</span>
              <span>{formatCurrency(feeAmount)}</span>
            </div>
          </div>

          <div className="space-y-3 p-3 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)]">
            <div className="flex gap-2.5 items-start text-[11px] opacity-80 font-bold">
              <Info className="w-3.5 h-3.5 text-[var(--theme-primary)] shrink-0 mt-0.5" />
              <div>
                <span className="font-black block mb-0.5">Processing time</span>
                {withdrawalMode === "manual"
                  ? "Pending approval — once approved, settled to destination."
                  : "Pending until provider webhook confirms — usually 5–30 min."}
              </div>
            </div>
            <div className="border-t border-[var(--theme-card-border)]" />
            <div className="flex gap-2.5 items-start text-[11px] opacity-80 font-bold">
              {activeNodes && activeNodes.length > 0 ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-black block mb-0.5">Security</span>Active product verified.
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-black block mb-0.5">Requirement</span>Activate withdrawals by starting at least 1 run.
                  </div>
                </>
              )}
            </div>
          </div>

          <Button
            variant="primary"
            size="lg"
            type="submit"
            loading={isWithdrawing}
            disabled={
              !Number.isInteger(pointsToWithdraw) ||
              pointsToWithdraw < minimumWithdrawal ||
              (maximumWithdrawal > 0 && pointsToWithdraw > maximumWithdrawal) ||
              pointsToWithdraw > (userProfile.points || 0) ||
              !activeNodes ||
              activeNodes.length === 0
            }
            className="w-full"
          >
            {!activeNodes || activeNodes.length === 0 ? (
              <span>Start a run first</span>
            ) : (
              <>
                <ArrowUpRight className="w-4 h-4" /> Request withdrawal
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
