import React, { useState, useEffect, useRef } from "react";
import { useGatedInterval } from "../hooks/useGatedInterval";
import { SubscriptionItem, UserProfile } from "../types";
import {
  ArrowLeft,
  Smartphone,
  XCircle,
  CheckCircle,
  Cpu,
  Copy,
  ShieldCheck,
  Clock,
  BadgeInfo,
} from "lucide-react";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import VisaMetricCard from "./VisaMetricCard";
import { Button } from "./ui/button";

interface DepositViewProps {
  userProfile: UserProfile;
  items: SubscriptionItem[];
  siteConfig?: any;
  onDepositSuccess: (newProfile: UserProfile) => void;
  onGpuSuccess: (newSub: any, CostAmount: number) => void;
  preselectedItem?: SubscriptionItem | null;
  onBack?: () => void;
}

export default function DepositView({
  userProfile,
  items,
  siteConfig,
  onDepositSuccess,
  onGpuSuccess,
  preselectedItem = null,
  onBack,
}: DepositViewProps) {
  const [payType, setPayType] = useState<"balance" | "gpu">(preselectedItem ? "gpu" : "balance");
  const [selectedGpu, setSelectedGpu] = useState<SubscriptionItem | null>(preselectedItem);
  const [depositAmount, setDepositAmount] = useState<number>(20000);
  const { formatCurrency } = useCurrency();
  const [mobileNumber, setMobileNumber] = useState<string>(userProfile.phone || "");

  const config = {
    allowAutoDeposit: true,
    allowManualDeposit: false,
    mtnReceiverPhone: "",
    mtnReceiverName: "",
    airtelReceiverPhone: "",
    airtelReceiverName: "",
    usdtRate: 3700,
    ...siteConfig,
  };

  const autoEnabled = config.allowAutoDeposit !== false;
  const manualEnabled = config.allowManualDeposit === true;
  const minimumDeposit = Number(config.minimumDeposit) > 0 ? Math.floor(Number(config.minimumDeposit)) : 20_000;
  const maximumDeposit = Number(config.maximumDeposit) > 0 ? Math.floor(Number(config.maximumDeposit)) : 0;

  const getDepositLimitError = (amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return "Enter a valid deposit amount.";
    if (amount < minimumDeposit) return `Minimum deposit is ${formatCurrency(minimumDeposit)}.`;
    if (maximumDeposit > 0 && amount > maximumDeposit) return `Maximum deposit is ${formatCurrency(maximumDeposit)}.`;
    return "";
  };

  useEffect(() => {
    if (depositAmount === 20_000) setDepositAmount(minimumDeposit);
    if (manualAmount === 20_000) setManualAmount(minimumDeposit);
    if (usdtAmountUSD === 5.5 && Number(config.usdtRate) > 0) {
      setUsdtAmountUSD(Number((minimumDeposit / Number(config.usdtRate)).toFixed(2)));
    }
  }, [minimumDeposit, config.usdtRate]);

  const [depositMode, setDepositMode] = useState<"auto" | "manual" | "usdt">(
    autoEnabled ? "auto" : manualEnabled ? "manual" : "usdt"
  );

  const [senderPhone, setSenderPhone] = useState(userProfile.phone || "");
  const [manualAmount, setManualAmount] = useState<number>(20000);
  const [usdtAmountUSD, setUsdtAmountUSD] = useState<number>(5.5);
  const [manualRef, setManualRef] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [currentTransId, setCurrentTransId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"IDLE" | "PENDING" | "SUCCESSFUL" | "FAILED">("IDLE");

  useEffect(() => {
    if (preselectedItem) {
      setSelectedGpu(preselectedItem);
      setPayType("gpu");
    } else {
      setPayType("balance");
    }
  }, [preselectedItem]);

  const backoffRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const BACKOFF = [3000, 5000, 10000] as const;
  const getBackoff = () => BACKOFF[Math.min(backoffRef.current, 2)];

  useEffect(() => {
    if (paymentStatus !== "PENDING" || !currentTransId) {
      backoffRef.current = 0;
      if (abortRef.current) abortRef.current.abort();
      return;
    }
    backoffRef.current = 0;
  }, [paymentStatus, currentTransId]);

  const checkStatus = async () => {
    if (document.hidden) return;
    if (paymentStatus !== "PENDING" || !currentTransId) return;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/payment/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trans_id: currentTransId }),
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      if (res.ok) {
        const data = await res.json();
        if (data.status === "SUCCESSFUL") {
          setPaymentStatus("SUCCESSFUL");
          toast.success("Payment completed successfully!");
          const finalAmt =
            depositMode === "usdt"
              ? payType === "gpu" ? selectedGpu?.amount || 0 : usdtAmountUSD * config.usdtRate
              : depositMode === "manual"
              ? payType === "gpu" ? selectedGpu?.amount || 0 : manualAmount
              : payType === "gpu" ? selectedGpu?.amount || 0 : depositAmount;
          if (payType === "balance") {
            if (data.profile) onDepositSuccess(data.profile);
            else {
              const fallbackProfile = { ...userProfile, rechargeBalance: (userProfile.rechargeBalance || 0) + finalAmt, totalDeposits: (userProfile.totalDeposits || 0) + finalAmt };
              onDepositSuccess(fallbackProfile);
            }
          } else if (data.subscription) {
            onGpuSuccess(data.subscription, selectedGpu?.amount || 0);
          }
        } else if (data.status === "FAILED") {
          setPaymentStatus("FAILED");
          toast.error("Transaction was declined or failed.");
          setErrorMsg("Transaction was declined or failed.");
        } else {
          backoffRef.current = Math.min(backoffRef.current + 1, 2);
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      console.error("Error polling payment status:", err);
    }
  };

  useGatedInterval(() => { void checkStatus(); }, getBackoff(), { enabled: paymentStatus === "PENDING" && !!currentTransId, visibilityGate: true });

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  const handleStartPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    const phoneTrim = mobileNumber.replace(/\s+/g, "");
    if (!phoneTrim || phoneTrim.length < 10) {
      toast.error("Please provide a valid 10-digit mobile money number.");
      return;
    }
    const finalAmount = payType === "gpu" ? selectedGpu?.amount || 0 : depositAmount;
    const limitError = getDepositLimitError(finalAmount);
    if (limitError) {
      setErrorMsg(limitError);
      toast.error(limitError);
      return;
    }
    setIsSubmitting(true);
    setPaymentStatus("PENDING");
    const operator = "MTN";
    try {
      const response = await fetch("/api/payment/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: userProfile.phone,
          depositPhone: phoneTrim,
          amount: finalAmount,
          operator,
          type: payType === "balance" ? "deposit" : "product_activation",
          itemId: payType === "gpu" ? selectedGpu?.id : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Payment dispatch failed.");
      setCurrentTransId(data.trans_id);
      toast.info("Payment dispatched. Please check your phone.");
    } catch (err: any) {
      console.error(err);
      setPaymentStatus("IDLE");
      toast.error(err.message || "Failed to dispatch mobile money charge.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    let phoneTrim = senderPhone.replace(/\s+/g, "");
    if (depositMode === "manual") {
      if (!phoneTrim || phoneTrim.length < 9) {
        toast.error("Please provide a valid 9 or 10 digit sender phone number.");
        return;
      }
    } else {
      phoneTrim = "USDT_TRANSFER";
    }
    const refTrim = manualRef.trim();
    if (!refTrim) {
      toast.error("Please provide the transaction ID / Hash.");
      return;
    }
    const finalAmount =
      payType === "gpu"
        ? selectedGpu?.amount || 0
        : depositMode === "usdt"
        ? usdtAmountUSD * config.usdtRate
        : manualAmount;
    const limitError = getDepositLimitError(finalAmount);
    if (limitError) {
      setErrorMsg(limitError);
      toast.error(limitError);
      return;
    }
    setIsSubmitting(true);
    setPaymentStatus("PENDING");
    let detectedOperator = depositMode === "usdt" ? "USDT" : "MTN";
    if (depositMode === "manual") {
      const normalizedPhone = phoneTrim.startsWith("256") ? "0" + phoneTrim.substring(3) : phoneTrim;
      if (normalizedPhone.startsWith("070") || normalizedPhone.startsWith("075") || normalizedPhone.startsWith("074")) {
        detectedOperator = "Airtel";
      }
    }
    try {
      const response = await fetch("/api/manual/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: userProfile.phone,
          senderPhone: phoneTrim,
          amount: finalAmount,
          operator: detectedOperator,
          transId: refTrim,
          itemId: payType === "gpu" ? selectedGpu?.id : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Proof submission failed.");
      setCurrentTransId(data.trans_id);
      toast.success("Proof submitted — pending review.");
    } catch (err: any) {
      console.error(err);
      setPaymentStatus("IDLE");
      toast.error(err.message || "Failed to submit proof.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const finalAmount =
    depositMode === "usdt"
      ? payType === "gpu"
        ? selectedGpu?.amount || 0
        : usdtAmountUSD * config.usdtRate
      : depositMode === "manual"
      ? payType === "gpu"
        ? selectedGpu?.amount || 0
        : manualAmount
      : payType === "gpu"
      ? selectedGpu?.amount || 0
      : depositAmount;

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

  return (
    <div className="bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] text-[var(--theme-text)] space-y-4 select-none p-4 min-h-[100dvh]">
      {/* Top bar — back */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          aria-label="Go back"
          className="w-10 h-10 rounded-full bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] flex items-center justify-center hover:border-[var(--theme-primary)]/40 active:scale-95 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Title — below back */}
      <div className="px-1">
        <h1 className="font-display font-black tracking-tight text-[26px] leading-none text-[var(--theme-text)]">Recharge account</h1>
        <p className="text-[13px] font-sans font-medium text-[var(--theme-text)] opacity-60 mt-2">Top up instantly with mobile money or USDT.</p>
      </div>

      {/* Selected product strip — theme-aware */}
      {payType === "gpu" && selectedGpu && (
        <div className="flex items-center gap-3 p-3 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] shadow-sm">
          <div className="w-12 h-12 rounded-xl overflow-hidden border border-[var(--theme-card-border)] bg-[var(--theme-bg)] shrink-0">
            {selectedGpu.imageUrl ? (
              <img src={selectedGpu.imageUrl} alt={selectedGpu.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[var(--theme-primary)] opacity-60">
                <Cpu className="w-6 h-6" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-sans font-medium opacity-60 leading-none">Paying for</p>
            <p className="text-[15px] font-sans font-extrabold leading-tight truncate mt-1">{selectedGpu.name}</p>
            <p className="text-[11px] font-bold text-[var(--theme-primary)] leading-none mt-1">
              Earns {formatCurrency(selectedGpu.dailyYield)}/day • {selectedGpu.duration} days
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[12px] font-sans font-medium opacity-60">Price</p>
            <p className="text-sm font-black text-[var(--theme-primary)]">{formatCurrency(selectedGpu.amount)}</p>
          </div>
        </div>
      )}

      {/* Visa balance card — rechargeable only */}
      <VisaMetricCard
        mode="single"
        leftLabel="Recharge balance"
        leftValue={formatCurrency(userProfile.rechargeBalance || 0)}
      />

      {paymentStatus === "IDLE" ? (
        <div className="rounded-[var(--theme-radius)] overflow-hidden">
          {/* Method picker — segmented pill */}
          <div className="p-3 border-b border-[var(--theme-card-border)] space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-sans font-extrabold tracking-tight text-[var(--theme-text)]">Choose method</h2>
              <span className="text-[11px] font-sans font-medium opacity-60 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Encrypted
              </span>
            </div>
            <div className="flex gap-1 border-b border-[var(--theme-card-border)]">
              {autoEnabled && (
                <PillBtn
                  active={depositMode === "auto"}
                  onClick={() => {
                    setDepositMode("auto");
                    setErrorMsg("");
                  }}
                  label="Instant"
                  sub=""
                  icon={
                    <span className="flex items-center gap-1.5">
                      {config.mtnLogoUrl ? <img src={config.mtnLogoUrl} alt="MTN" className="w-10 h-10 rounded-full bg-white object-contain" style={{ padding: 4 }} /> : <span className="w-10 h-10 rounded-full bg-[#FFCC00] text-black text-[11px] flex items-center justify-center font-black">MTN</span>}
                      {config.airtelLogoUrl ? <img src={config.airtelLogoUrl} alt="Airtel" className="w-10 h-10 rounded-full bg-white object-contain" style={{ padding: 3 }} /> : <span className="w-10 h-10 rounded-full bg-[#FF0000] text-white text-[10px] flex items-center justify-center font-black">Air</span>}
                    </span>
                  }
                />
              )}
              {manualEnabled && (
                <PillBtn
                  active={depositMode === "manual"}
                  onClick={() => {
                    setDepositMode("manual");
                    setErrorMsg("");
                  }}
                  label="Transfer"
                  sub="Manual • 5-15 min"
                  icon={
                    <span className="flex items-center gap-1.5">
                      {config.mtnLogoUrl ? <img src={config.mtnLogoUrl} alt="MTN" className="w-10 h-10 rounded-full bg-white object-contain" style={{ padding: 4 }} /> : <span className="w-10 h-10 rounded-full bg-[#FFCC00] text-black text-[11px] flex items-center justify-center font-black">MTN</span>}
                      {config.airtelLogoUrl ? <img src={config.airtelLogoUrl} alt="Airtel" className="w-10 h-10 rounded-full bg-white object-contain" style={{ padding: 3 }} /> : <span className="w-10 h-10 rounded-full bg-[#FF0000] text-white text-[10px] flex items-center justify-center font-black">Air</span>}
                    </span>
                  }
                />
              )}
              <PillBtn
                active={depositMode === "usdt"}
                onClick={() => {
                  setDepositMode("usdt");
                  setErrorMsg("");
                }}
                label="USDT"
                sub={config.usdtNetwork || "TRC20"}
                icon={
                  config.usdtLogoUrl ? (
                    <img src={config.usdtLogoUrl} alt="USDT" className="w-10 h-10 rounded-full bg-white object-contain" style={{ padding: 2 }} />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-[#26A17B] text-white text-[15px] flex items-center justify-center font-black">₮</span>
                  )
                }
              />
            </div>
          </div>

          {/* Forms */}
          <div className="p-4 space-y-4">
            {errorMsg && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-600 text-xs font-bold flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {depositMode === "auto" && (
              <form onSubmit={handleStartPayment} className="space-y-5">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-[13px] font-sans font-medium opacity-60">Mobile money number</label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] px-2.5 py-1 text-[11px] font-black">+256</span>
                      <input
                        type="text"
                        required
                        placeholder="7XX XXX XXX"
                        value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value)}
                        className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] rounded-2xl py-4 pl-[72px] pr-4 text-[15px] font-bold outline-none placeholder:font-medium placeholder:opacity-40 transition-colors"
                      />
                      <Smartphone className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[13px] font-sans font-medium opacity-60">Amount (UGX)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-black opacity-50">UGX</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        required
                        disabled={payType === "gpu"}
                        value={payType === "gpu" ? selectedGpu?.amount || 0 : depositAmount}
                        onChange={(e) => setDepositAmount(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                        className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] rounded-2xl py-4 pl-12 pr-4 text-[15px] font-black outline-none transition-colors disabled:opacity-60"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  type="submit"
                  loading={isSubmitting}
                  disabled={payType === "gpu" && !selectedGpu}
                  className="w-full"
                  glow={false}
                >
                  <span>Pay {formatCurrency(finalAmount)}</span>
                </Button>
                <p className="text-center text-xs font-sans font-medium opacity-60">
                  {formatCurrency(minimumDeposit)} min{maximumDeposit > 0 ? ` • ${formatCurrency(maximumDeposit)} max` : " • no max"}
                </p>
              </form>
            )}

            {depositMode === "manual" && (
              <form onSubmit={handleStartManualPayment} className="space-y-5">
                {/* Receiver cards */}
                <div className="space-y-2">
                  <p className="text-[15px] font-sans font-extrabold tracking-tight">Send to</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {config.mtnReceiverPhone ? (
                      <div className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] p-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {config.mtnLogoUrl ? (
                            <img src={config.mtnLogoUrl} alt="MTN" className="w-8 h-8 rounded-full bg-white p-1 object-contain border border-[var(--theme-card-border)] shrink-0" />
                          ) : (
                            <span className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-black shrink-0">MTN</span>
                          )}
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 leading-none">MTN Uganda</p>
                            <p className="text-sm font-black leading-none mt-1 select-all truncate">{config.mtnReceiverPhone}</p>
                            <p className="text-[11px] font-bold opacity-60 truncate">{config.mtnReceiverName || "PJNATAL"}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(config.mtnReceiverPhone);
                            toast.success("MTN number copied");
                          }}
                          className="shrink-0 w-8 h-8 rounded-full bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] flex items-center justify-center hover:border-[var(--theme-primary)]/30 transition-colors cursor-pointer"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-[var(--theme-radius)] bg-[var(--theme-bg)] border border-dashed border-[var(--theme-card-border)] p-3 text-xs font-bold opacity-50">MTN offline</div>
                    )}
                    {config.airtelReceiverPhone ? (
                      <div className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] p-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {config.airtelLogoUrl ? (
                            <img src={config.airtelLogoUrl} alt="Airtel" className="w-8 h-8 rounded-full bg-white p-1 object-contain border border-[var(--theme-card-border)] shrink-0" />
                          ) : (
                            <span className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px] font-black shrink-0">AT</span>
                          )}
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-wider text-rose-600 leading-none">Airtel Money</p>
                            <p className="text-sm font-black leading-none mt-1 select-all truncate">{config.airtelReceiverPhone}</p>
                            <p className="text-[11px] font-bold opacity-60 truncate">{config.airtelReceiverName || "PJNATAL"}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(config.airtelReceiverPhone);
                            toast.success("Airtel number copied");
                          }}
                          className="shrink-0 w-8 h-8 rounded-full bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] flex items-center justify-center hover:border-[var(--theme-primary)]/30 transition-colors cursor-pointer"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-[var(--theme-radius)] bg-[var(--theme-bg)] border border-dashed border-[var(--theme-card-border)] p-3 text-xs font-bold opacity-50">Airtel offline</div>
                    )}
                  </div>
                  <div className="rounded-full bg-[var(--theme-primary)]/10 border border-[var(--theme-primary)]/20 px-3 py-2 flex items-center justify-between gap-2 text-xs font-black">
                    <span className="opacity-70">Send exactly</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[var(--theme-primary)]">{formatCurrency(finalAmount)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(String(finalAmount));
                          toast.success("Amount copied");
                        }}
                        className="w-7 h-7 rounded-full bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] flex items-center justify-center cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  <p className="text-[15px] font-sans font-extrabold tracking-tight">Confirm details</p>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label className="text-[13px] font-sans font-medium opacity-60">Your sender number</label>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] px-2.5 py-1 text-[11px] font-black">+256</span>
                        <input
                          type="text"
                          required
                          placeholder="7XX XXX XXX"
                          value={senderPhone}
                          onChange={(e) => setSenderPhone(e.target.value)}
                          className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] rounded-2xl py-4 pl-[72px] pr-4 text-[15px] font-bold outline-none placeholder:font-medium placeholder:opacity-40"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[13px] font-sans font-medium opacity-60">Amount sent (UGX)</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-black opacity-50">UGX</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          required
                          disabled={payType === "gpu"}
                          value={payType === "gpu" ? selectedGpu?.amount || 0 : manualAmount}
                          onChange={(e) => setManualAmount(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                          className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] rounded-2xl py-4 pl-12 pr-4 text-[15px] font-black outline-none disabled:opacity-60"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[13px] font-sans font-medium opacity-60">Transaction ID</label>
                      <input
                        type="text"
                        required
                        placeholder="Paste mobile money TxID"
                        value={manualRef}
                        onChange={(e) => setManualRef(e.target.value)}
                        className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] rounded-2xl py-4 px-4 text-[15px] font-bold outline-none placeholder:font-medium placeholder:opacity-40"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  type="submit"
                  loading={isSubmitting}
                  disabled={payType === "gpu" && !selectedGpu}
                  className="w-full"
                  glow={false}
                >
                  <span>Submit proof • {formatCurrency(finalAmount)}</span>
                </Button>
                <p className="text-center text-xs font-sans font-medium opacity-60">
                  {formatCurrency(minimumDeposit)} min{maximumDeposit > 0 ? ` • ${formatCurrency(maximumDeposit)} max` : " • no max"}
                </p>
              </form>
            )}

            {depositMode === "usdt" && (
              <form onSubmit={handleStartManualPayment} className="space-y-5">
                {/* Step 1 — QR + wallet */}
                <div className="space-y-3">
                  <p className="text-[15px] font-sans font-extrabold tracking-tight">Send USDT</p>
                    <div className="p-5 space-y-4">
                    {config.usdtQrUrl && (
                      <div className="flex justify-center">
                        <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-2xl overflow-hidden bg-white p-2.5 border border-[var(--theme-card-border)] shadow-sm">
                          <img src={config.usdtQrUrl} alt="USDT QR" className="w-full h-full object-contain" />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-[11px] font-medium opacity-50">Scan or copy address</span>
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-[13px] font-sans font-medium opacity-60">Send exactly</p>
                      <p className="text-xl font-display font-black text-[var(--theme-primary)] tracking-tight leading-none">{formatCurrency(finalAmount)}</p>
                      {config.usdtRate ? <p className="text-[11px] font-semibold opacity-60">≈ ${(finalAmount / config.usdtRate).toFixed(2)}</p> : null}
                    </div>
                    <div className="rounded-xl bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-3.5 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#26A17B] text-white flex items-center justify-center shrink-0 text-sm font-black">₮</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-sans font-medium opacity-60 leading-none">{config.usdtNetwork || "USDT TRC20"} address</p>
                        <p className="text-[13px] font-semibold select-all truncate mt-1.5 font-mono">{config.usdtAddress || "Wallet not configured"}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (config.usdtAddress) {
                            navigator.clipboard.writeText(config.usdtAddress);
                            toast.success("Wallet copied");
                          }
                        }}
                        className="shrink-0 w-9 h-9 rounded-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] flex items-center justify-center hover:border-[var(--theme-primary)]/30 transition-colors cursor-pointer"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  <p className="text-[15px] font-sans font-extrabold tracking-tight">Confirm details</p>
                  <div className="space-y-2">
                    <label className="text-[13px] font-sans font-medium opacity-60">Amount sent (USD)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-black opacity-50">USD</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        required
                        disabled={payType === "gpu"}
                        value={payType === "gpu" ? ((selectedGpu?.amount || 0) / (config.usdtRate || 3700)).toFixed(2) : usdtAmountUSD}
                        onChange={(e) => setUsdtAmountUSD(Number(e.target.value) || 0)}
                        className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] rounded-2xl py-4 pl-12 pr-4 text-[15px] font-black outline-none disabled:opacity-60"
                      />
                    </div>
                    {payType !== "gpu" && (
                      <p className="text-[11px] font-bold opacity-50 px-1">≈ {formatCurrency(usdtAmountUSD * config.usdtRate)} • rate {config.usdtRate} UGX/USDT</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-sans font-medium opacity-60">Transaction hash / TxID</label>
                    <input
                      type="text"
                      required
                      placeholder="Paste USDT hash"
                      value={manualRef}
                      onChange={(e) => setManualRef(e.target.value)}
                      className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] rounded-2xl py-4 px-4 text-[15px] font-bold outline-none placeholder:font-medium placeholder:opacity-40"
                    />
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  type="submit"
                  loading={isSubmitting}
                  disabled={payType === "gpu" && !selectedGpu}
                  className="w-full"
                  glow={false}
                >
                  <span>Submit USDT proof</span>
                </Button>
                <p className="text-center text-xs font-sans font-medium opacity-60">
                  {formatCurrency(minimumDeposit)} min{maximumDeposit > 0 ? ` • ${formatCurrency(maximumDeposit)} max` : " • no max"}
                </p>
              </form>
            )}
          </div>
        </div>
      ) : paymentStatus === "PENDING" ? (
        <div className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-8 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 mx-auto rounded-full border-2 border-[var(--theme-primary)]/20 border-t-[var(--theme-primary)] animate-spin" />
          <div className="space-y-1">
            <h3 className="font-black text-sm">
              {depositMode === "manual" || depositMode === "usdt" ? "Verification pending" : "Awaiting PIN confirmation"}
            </h3>
            <p className="text-xs font-bold opacity-60 leading-relaxed max-w-xs mx-auto">
              {depositMode === "manual" || depositMode === "usdt" ? (
                <>
                  Ref <span className="text-[var(--theme-primary)]">{currentTransId}</span> is being reviewed. Your balance will credit once confirmed.
                </>
              ) : (
                <>
                  Sent to <span className="text-[var(--theme-primary)]">{mobileNumber}</span> — approve <span className="text-[var(--theme-text)]">{formatCurrency(finalAmount)}</span> on your phone.
                </>
              )}
            </p>
          </div>
          {(depositMode === "manual" || depositMode === "usdt") && (
            <button
              type="button"
              onClick={() => {
                setPaymentStatus("IDLE");
                setErrorMsg("Check History for updates.");
              }}
              className="px-4 py-2 rounded-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] text-xs font-black hover:border-[var(--theme-primary)]/30 transition-colors cursor-pointer"
            >
              Submit another proof
            </button>
          )}
        </div>
      ) : paymentStatus === "SUCCESSFUL" ? (
        <div className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-8 text-center space-y-5 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-500">
            <CheckCircle className="w-10 h-10" />
          </div>
          <div className="space-y-1">
            <h3 className="font-black text-sm uppercase tracking-wide">
              {payType === "gpu" ? "Product secured!" : "Account credited!"}
            </h3>
            <p className="text-xs font-bold opacity-60 max-w-sm mx-auto leading-relaxed">
              Settled <span className="text-[var(--theme-text)] opacity-100">{formatCurrency(finalAmount)}</span> {currentTransId ? `• Ref ${currentTransId}` : ""}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] p-4 max-w-xs mx-auto text-left space-y-2 text-xs font-bold">
            <div className="flex justify-between">
              <span className="opacity-60">Total</span>
              <span>{formatCurrency(finalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-60">Status</span>
              <span className="text-emerald-600">Approved</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-60">Type</span>
              <span className="text-[var(--theme-primary)] truncate ml-2">{payType === "gpu" && selectedGpu ? selectedGpu.name : "Deposit"}</span>
            </div>
          </div>
          <button
            onClick={onBack}
            className="w-full py-4 rounded-2xl bg-[var(--theme-primary)] text-[var(--theme-on-primary)] font-sans font-extrabold text-sm shadow-[0_3px_0_0_var(--theme-primary-shadow)] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
          >
            Continue
          </button>
        </div>
      ) : (
        <div className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-8 text-center space-y-5 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-500">
            <XCircle className="w-10 h-10" />
          </div>
          <div className="space-y-1">
            <h3 className="font-black text-xs uppercase tracking-widest text-rose-500">Transaction failed</h3>
            <p className="text-xs font-bold opacity-60 max-w-sm mx-auto">{errorMsg || "Declined. Try again."}</p>
          </div>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => {
                setPaymentStatus("IDLE");
                setErrorMsg("");
              }}
              className="px-5 py-2.5 rounded-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] text-xs font-black cursor-pointer"
            >
              Try again
            </button>
            <button
              onClick={onBack}
              className="px-5 py-2.5 rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] text-xs font-black cursor-pointer"
            >
              Go back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
