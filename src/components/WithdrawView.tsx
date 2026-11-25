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

/** Shared field shell. One border, one fill, one focus colour. */
const fieldShell =
  "w-full rounded-[10px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/60 px-3 py-2.5 text-[14px] font-semibold text-[var(--theme-text)] outline-none transition-colors placeholder:font-medium placeholder:opacity-35 focus:border-[var(--theme-primary)] disabled:opacity-55";

/** Uganda number: flag and dial code inside the box, fixed to +256. */
function PhoneField({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (digits: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--theme-text)] opacity-45">
        {label}
      </label>
      <div
        className={`flex w-full items-center rounded-[10px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/60 transition-colors ${
          readOnly ? "opacity-70" : "focus-within:border-[var(--theme-primary)]"
        }`}
      >
        <span className="flex shrink-0 items-center gap-1.5 border-r border-[var(--theme-card-border)] py-2.5 pl-2.5 pr-2.5">
          <img src="/flags/uganda.svg" alt="" aria-hidden="true" className="h-3.5 w-5 rounded-[1px] object-cover" />
          <span className="text-[13.5px] font-normal tabular-nums text-[var(--theme-text)]">+256</span>
        </span>
        <input
          type="tel"
          required
          inputMode="numeric"
          autoComplete="tel"
          placeholder="700 000 000"
          aria-label={label}
          readOnly={readOnly}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
          className="phone-input min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[14px] font-semibold tabular-nums text-[var(--theme-text)] outline-none placeholder:font-medium placeholder:opacity-35"
        />
      </div>
    </div>
  );
}

export default function WithdrawView({
  userProfile,
  siteConfig,
  activeNodes = [],
  onBack,
  onProfileUpdate,
}: WithdrawViewProps) {
  const { formatCurrency, exchangeRate } = useCurrency();

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
      aria-pressed={active}
      className={`flex flex-1 cursor-pointer flex-col items-center gap-1.5 rounded-[9px] px-1 py-2.5 transition-colors ${
        active
          ? "bg-[var(--theme-card-bg)] shadow-[0_1px_3px_rgba(0,0,0,0.18)]"
          : "hover:bg-[var(--theme-card-bg)]/40"
      }`}
    >
      <span className={`flex h-7 items-center justify-center transition-opacity ${active ? "opacity-100" : "opacity-45"}`}>
        {icon}
      </span>
      <span
        className={`text-[11px] font-sans leading-none tracking-tight ${
          active ? "font-extrabold text-[var(--theme-text)]" : "font-semibold text-[var(--theme-text)] opacity-55"
        }`}
      >
        {label}
      </span>
      {sub ? (
        <span className={`text-[9px] font-sans font-semibold leading-none ${active ? "text-[var(--theme-primary)]" : "opacity-35"}`}>
          {sub}
        </span>
      ) : null}
    </button>
  );

  const inputCls = fieldShell;
  // Crypto is quoted in USDT regardless of the viewer's display currency,
  // so this uses the shared UGX-per-USD rate rather than any local constant.
  const usdtAmount = (payout / (Number(siteConfig?.usdtRate) || exchangeRate)).toFixed(2);

  /** Digits with thousands separators. */
  const withThousands = (value: string): string => {
    const digits = value.replace(/[^0-9]/g, "");
    if (!digits) return "";
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  /** The digits behind a formatted amount. */
  const digitsOnly = (value: string): string => value.replace(/[^0-9]/g, "");

  /* ------------------------------- status ------------------------------- */
  if (paymentStatus !== "IDLE") {
    const ok = paymentStatus === "SUCCESSFUL";
    const failed = paymentStatus === "FAILED";
    return (
      <div className="min-h-[100dvh] select-none px-4 pb-8 pt-4 text-[var(--theme-text)]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setPaymentStatus("IDLE"); onBack(); }}
            aria-label="Go back"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] transition-all hover:border-[var(--theme-primary)]/40 active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-[22px] font-black leading-none tracking-tight">Withdraw funds</h1>
            <p className="mt-1 text-[11.5px] font-sans font-medium opacity-50">Withdrawable balance {formatCurrency(userProfile.points || 0)}</p>
          </div>
        </div>

        <div className="mt-4 rounded-[16px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] p-6 text-center">
          {paymentStatus === "PENDING" ? (
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--theme-primary)]/20 border-t-[var(--theme-primary)]" />
          ) : ok ? (
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-500">
              <CheckCircle2 className="h-6 w-6" />
            </div>
          ) : (
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
              {trackingUnavailable ? <Info className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
            </div>
          )}

          <p
            className={`mt-4 text-[10px] font-bold uppercase tracking-[0.14em] ${
              ok ? "text-emerald-500" : failed ? "text-rose-500" : "text-amber-500"
            }`}
          >
            {trackingUnavailable ? "Unknown" : statusLabel}
          </p>
          <p className="mt-1 text-[12px] font-medium leading-relaxed opacity-50">{statusDescription}</p>

          <div className="mx-auto mt-4 max-w-[17rem] space-y-1.5 text-left">
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <span className="opacity-45">Requested</span>
              <span className="font-semibold tabular-nums">{formatCurrency(lastPayout)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <span className="opacity-45">Destination</span>
              <span className="max-w-[10rem] truncate font-semibold">
                {withdrawOperator === "USDT" ? usdtAddress.slice(0, 10) + "…" : withdrawalPhone}
              </span>
            </div>
            {paymentStatus === "SUCCESSFUL" && withdrawOperator === "USDT" ? (
              <div className="flex items-center justify-between gap-3 text-[12px]">
                <span className="opacity-45">USDT sent</span>
                <span className="font-semibold tabular-nums">{usdtAmount} USDT</span>
              </div>
            ) : null}
          </div>

          <button
            onClick={() => { setPaymentStatus("IDLE"); onBack(); }}
            className="mt-5 w-full cursor-pointer rounded-[10px] bg-[var(--theme-primary)] py-3 font-sans text-[14px] font-extrabold text-[var(--theme-on-primary)] transition-all active:scale-[0.99]"
          >
            {paymentStatus === "PENDING" ? "Back to account" : "Done"}
          </button>
        </div>
      </div>
    );
  }

  /* -------------------------------- form -------------------------------- */
  return (
    <div className="min-h-[100dvh] select-none px-4 pb-8 pt-4 text-[var(--theme-text)]">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          aria-label="Go back"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] transition-all hover:border-[var(--theme-primary)]/40 active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate font-display text-[22px] font-black leading-none tracking-tight">Withdraw funds</h1>
          <p className="mt-1 text-[11.5px] font-sans font-medium opacity-50">Withdrawable balance {formatCurrency(userProfile.points || 0)}</p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div className="flex gap-1 rounded-[12px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/50 p-1">
          <PillBtn
            active={withdrawOperator !== "USDT"}
            onClick={() => setWithdrawOperator((userProfile.operator as any) === "Airtel" ? "Airtel" : "MTN")}
            label="Mobile Money"
            sub=""
            icon={
              <span className="flex items-center gap-1">
                {siteConfig?.mtnLogoUrl ? <img src={siteConfig.mtnLogoUrl} alt="MTN" className="h-6 w-6 rounded-full bg-white object-contain" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FFCC00] text-[8px] font-black text-black">MTN</span>}
                {siteConfig?.airtelLogoUrl ? <img src={siteConfig.airtelLogoUrl} alt="Airtel" className="h-6 w-6 rounded-full bg-white object-contain" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF0000] text-[8px] font-black text-white">Air</span>}
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
                <img src={siteConfig.usdtLogoUrl} alt="USDT" className="h-6 w-6 rounded-full bg-white object-contain" />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#26A17B] text-[10px] font-black text-white">₮</span>
              )
            }
          />
        </div>

        <div className="space-y-4 rounded-[16px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] p-4">
          {errorMsg ? (
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-rose-500">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </p>
          ) : null}

          <form onSubmit={handleWithdrawal} className="space-y-4">
            {withdrawOperator === "USDT" ? (
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--theme-text)] opacity-45">
                  USDT address
                </label>
                <div className="flex items-center gap-2 rounded-[10px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/60 px-3 py-2.5">
                  {siteConfig?.usdtLogoUrl ? (
                    <img src={siteConfig.usdtLogoUrl} alt="USDT" className="h-6 w-6 shrink-0 rounded-full bg-white object-contain" />
                  ) : (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#26A17B] text-[11px] font-black text-white">₮</span>
                  )}
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="T..."
                    aria-label="USDT wallet address"
                    value={usdtAddress}
                    onChange={(e) => setUsdtAddress(e.target.value)}
                    className={`phone-input ${inputCls} min-w-0 flex-1 border-0 bg-transparent px-0 font-mono text-[12px]`}
                  />
                </div>
              </div>
            ) : (
              <PhoneField label="Withdrawal number" value={withdrawalPhone} onChange={setWithdrawalPhone} readOnly />
            )}

            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--theme-text)] opacity-45">
                  Amount
                </label>
                <button
                  type="button"
                  onClick={() => setPointsToWithdraw(Math.min(userProfile.points || 0, maximumWithdrawal > 0 ? maximumWithdrawal : userProfile.points || 0))}
                  className="cursor-pointer text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--theme-primary)] transition-opacity hover:opacity-70"
                >
                  Max {formatCurrency(userProfile.points || 0)}
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={withThousands(String(pointsToWithdraw))}
                  onChange={(e) => setPointsToWithdraw(Number(digitsOnly(e.target.value)) || 0)}
                  className={`${inputCls} pr-14 tabular-nums`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold opacity-35">UGX</span>
              </div>
              {pointsToWithdraw > 0 && pointsToWithdraw > (userProfile.points || 0) ? (
                <p className="mt-1 text-[11px] font-semibold text-rose-500">Insufficient withdrawable balance.</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="opacity-45">Fee</span>
                <span className="font-semibold">{feePct}%</span>
              </div>
              <div className="flex items-center justify-between text-[13px] font-bold">
                <span>Estimated payout</span>
                <span className="tabular-nums">{formatCurrency(payout)}</span>
              </div>
              {withdrawOperator === "USDT" ? (
                <div className="flex items-center justify-between text-[12px] font-semibold text-emerald-500">
                  <span>USDT payout</span>
                  <span className="tabular-nums">{usdtAmount} USDT</span>
                </div>
              ) : null}
            </div>

            <p className="flex items-start gap-1.5 text-[11px] font-medium leading-relaxed opacity-40">
              {activeNodes && activeNodes.length > 0 ? (
                <>
                  <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <span>Active trading robot verified.</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span>Rent at least one bot to activate withdrawals.</span>
                </>
              )}
            </p>

            <p className="text-[11px] font-medium leading-relaxed opacity-40">
              Minimum {formatCurrency(minimumWithdrawal)}
              {maximumWithdrawal > 0 ? ` · maximum ${formatCurrency(maximumWithdrawal)}` : ""}
            </p>

            <Button
              variant="primary"
              size="md"
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
              {!activeNodes || activeNodes.length === 0 ? "Start a bot first" : "Withdraw"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
