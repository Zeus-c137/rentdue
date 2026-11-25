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
  InfoIcon,
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

/** Shared field shell. One border, one fill, one focus colour. */
const fieldShell =
  "w-full rounded-[10px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/60 px-3 py-2.5 text-[14px] font-semibold text-[var(--theme-text)] outline-none transition-colors placeholder:font-medium placeholder:opacity-35 focus:border-[var(--theme-primary)] disabled:opacity-55";

/** Label + control. Declared at module scope so typing never remounts it. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--theme-text)] opacity-45">
        {label}
      </label>
      {children}
    </div>
  );
}

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
    <Field label={label}>
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
    </Field>
  );
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
  const [depositAmount, setDepositAmount] = useState<number>(0);
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

  const footerNote = `Minimum ${formatCurrency(minimumDeposit)}${
    maximumDeposit > 0 ? ` · maximum ${formatCurrency(maximumDeposit)}` : ""
  }`;

  const getDepositLimitError = (amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return "Enter a valid deposit amount.";
    if (amount < minimumDeposit) return `Minimum deposit is ${formatCurrency(minimumDeposit)}.`;
    if (maximumDeposit > 0 && amount > maximumDeposit) return `Maximum deposit is ${formatCurrency(maximumDeposit)}.`;
    return "";
  };

  // Amount fields start at zero. The minimum is guidance in the footer and a
  // validation rule, never a pre-filled value — a seeded amount reads as an
  // amount the user already chose.
  const [depositMode, setDepositMode] = useState<"auto" | "manual" | "usdt">(
    autoEnabled ? "auto" : manualEnabled ? "manual" : "usdt"
  );

  const [senderPhone, setSenderPhone] = useState(userProfile.phone || "");
  const [manualAmount, setManualAmount] = useState<number>(0);
  const [usdtAmountUSD, setUsdtAmountUSD] = useState<string>("0");
  const [manualRef, setManualRef] = useState("");

  const usdtValue = Number(usdtAmountUSD) || 0;

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
          toast.success("Payment confirmed. Your account has been updated.");
          const finalAmt =
            depositMode === "usdt"
              ? payType === "gpu" ? selectedGpu?.amount || 0 : usdtValue * config.usdtRate
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
          toast.error("Payment failed. Please try again or contact support.");
          setErrorMsg("We couldn’t confirm this payment. Please try again or contact support.");
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
      toast.error("Enter a valid mobile money number.");
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
      toast.info("Payment request sent. Check your phone and approve it to continue.");
    } catch (err: any) {
      console.error(err);
      setPaymentStatus("IDLE");
      toast.error(err.message || "We couldn’t start the mobile money payment. Please try again.");
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
        toast.error("Enter a valid 9 or 10 digit sender number.");
        return;
      }
    } else {
      phoneTrim = "USDT_TRANSFER";
    }
    const refTrim = manualRef.trim();
    if (!refTrim) {
      toast.error("Enter the transaction ID or hash to submit your payment.");
      return;
    }
    const finalAmount =
      payType === "gpu"
        ? selectedGpu?.amount || 0
        : depositMode === "usdt"
        ? usdtValue * config.usdtRate
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
      toast.success("Payment details submitted. We’ll review them shortly.");
    } catch (err: any) {
      console.error(err);
      setPaymentStatus("IDLE");
      toast.error(err.message || "We couldn’t submit your payment details. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const finalAmount =
    depositMode === "usdt"
      ? payType === "gpu"
        ? selectedGpu?.amount || 0
        : usdtValue * config.usdtRate
      : depositMode === "manual"
      ? payType === "gpu"
        ? selectedGpu?.amount || 0
        : manualAmount
      : payType === "gpu"
      ? selectedGpu?.amount || 0
      : depositAmount;

  const inputCls = fieldShell;
  const moneyInputCls = `${fieldShell} tabular-nums`;

  /** Digits with thousands separators, e.g. 20000 -> "20,000". */
  const withThousands = (value: string): string => {
    const digits = value.replace(/[^0-9]/g, "");
    if (!digits) return "";
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  /** The digits behind a formatted amount. */
  const digitsOnly = (value: string): string => value.replace(/[^0-9]/g, "");

  /** Uganda number, same shell as the login phone field but fixed to +256. */
  const PhoneField: React.FC<{
    label: string;
    value: string;
    onChange: (digits: string) => void;
  }> = ({ label, value, onChange }) => (
    <Field label={label}>
      <div className="flex w-full items-center rounded-[10px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/60 transition-colors focus-within:border-[var(--theme-primary)]">
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
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
          className="phone-input min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[14px] font-semibold tabular-nums text-[var(--theme-text)] outline-none placeholder:font-medium placeholder:opacity-35"
        />
      </div>
    </Field>
  );

  /** Form footer copy. One place, so the wording stays identical. */
  const Footer = () => (
    <p className="text-[11px] font-medium leading-relaxed opacity-40">
      Minimum {formatCurrency(minimumDeposit)}
      {maximumDeposit > 0 ? ` · maximum ${formatCurrency(maximumDeposit)}` : ""}
    </p>
  );

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

  return (
    <div className="min-h-[100dvh] select-none px-4 pb-8 pt-4 text-[var(--theme-text)]">
      <div className="space-y-4">
        {/* Back, then the title with the balance under it. */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label="Go back"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] transition-all hover:border-[var(--theme-primary)]/40 active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-[22px] font-black leading-none tracking-tight">Add funds</h1>
            <p className="mt-1 text-[11.5px] font-sans font-medium opacity-50">
              Trading capital {formatCurrency(userProfile.rechargeBalance || 0)}
            </p>
          </div>
        </div>

        {payType === "gpu" && selectedGpu && (
          <div className="flex items-center gap-2.5 rounded-[10px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] p-2.5">
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-[8px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]">
              {selectedGpu.imageUrl ? (
                <img src={selectedGpu.imageUrl} alt={selectedGpu.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[var(--theme-primary)] opacity-60">
                  <Cpu className="h-4 w-4" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold leading-tight">{selectedGpu.name}</p>
              <p className="mt-0.5 text-[11px] font-medium opacity-45">
                {formatCurrency(selectedGpu.dailyYield)}/day · {selectedGpu.duration} days
              </p>
            </div>
            <p className="shrink-0 text-[13px] font-bold tabular-nums text-[var(--theme-primary)]">
              {formatCurrency(selectedGpu.amount)}
            </p>
          </div>
        )}
      </div>

      {paymentStatus === "IDLE" ? (
        <div className="mt-4 space-y-4">
          <div className="flex gap-1 rounded-[12px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/50 p-1">
            {autoEnabled && (
              <PillBtn
                active={depositMode === "auto"}
                onClick={() => { setDepositMode("auto"); setErrorMsg(""); }}
                label="Instant"
                sub=""
                icon={
                  <span className="flex items-center gap-1">
                    {config.mtnLogoUrl ? <img src={config.mtnLogoUrl} alt="MTN" className="h-6 w-6 rounded-full bg-white object-contain" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FFCC00] text-[8px] font-black text-black">MTN</span>}
                    {config.airtelLogoUrl ? <img src={config.airtelLogoUrl} alt="Airtel" className="h-6 w-6 rounded-full bg-white object-contain" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF0000] text-[8px] font-black text-white">Air</span>}
                  </span>
                }
              />
            )}
            {manualEnabled && (
              <PillBtn
                active={depositMode === "manual"}
                onClick={() => { setDepositMode("manual"); setErrorMsg(""); }}
                label="Transfer"
                sub="5-15 min"
                icon={
                  <span className="flex items-center gap-1">
                    {config.mtnLogoUrl ? <img src={config.mtnLogoUrl} alt="MTN" className="h-6 w-6 rounded-full bg-white object-contain" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FFCC00] text-[8px] font-black text-black">MTN</span>}
                    {config.airtelLogoUrl ? <img src={config.airtelLogoUrl} alt="Airtel" className="h-6 w-6 rounded-full bg-white object-contain" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF0000] text-[8px] font-black text-white">Air</span>}
                  </span>
                }
              />
            )}
            <PillBtn
              active={depositMode === "usdt"}
              onClick={() => { setDepositMode("usdt"); setErrorMsg(""); }}
              label="USDT"
              sub={config.usdtNetwork || "TRC20"}
              icon={
                config.usdtLogoUrl ? (
                  <img src={config.usdtLogoUrl} alt="USDT" className="h-6 w-6 rounded-full bg-white object-contain" />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#26A17B] text-[10px] font-black text-white">₮</span>
                )
              }
            />
          </div>

          <div className="space-y-4 rounded-[16px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] p-4">
            {errorMsg ? (
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-rose-500">
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </p>
            ) : null}

            {depositMode === "auto" && (
              <form onSubmit={handleStartPayment} className="space-y-4">
                <PhoneField label="Mobile money number" value={mobileNumber} onChange={setMobileNumber} />

                <Field label="Amount">
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      aria-label="Amount in Ugandan shillings"
                      disabled={payType === "gpu"}
                      value={payType === "gpu" ? withThousands(String(selectedGpu?.amount || 0)) : withThousands(String(depositAmount))}
                      onChange={(e) => setDepositAmount(Number(digitsOnly(e.target.value)) || 0)}
                      className={`${moneyInputCls} pr-14`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold opacity-35">UGX</span>
                  </div>
                </Field>

                <p className="text-[11px] font-medium leading-relaxed opacity-40">{footerNote}</p>

                <Button variant="primary" size="md" type="submit" loading={isSubmitting} disabled={payType === "gpu" && !selectedGpu} className="w-full">
                  Deposit
                </Button>
              </form>
            )}

            {depositMode === "manual" && (
              <form onSubmit={handleStartManualPayment} className="space-y-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {config.mtnReceiverPhone ? (
                    <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/60 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] opacity-40">MTN</p>
                        <p className="mt-0.5 select-all truncate text-[13px] font-bold tabular-nums">{config.mtnReceiverPhone}</p>
                      </div>
                      <button type="button" aria-label="Copy MTN number" onClick={() => { navigator.clipboard.writeText(config.mtnReceiverPhone); toast.success("Copied"); }} className="shrink-0 cursor-pointer opacity-45 transition-opacity hover:opacity-100">
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                  {config.airtelReceiverPhone ? (
                    <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/60 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] opacity-40">Airtel</p>
                        <p className="mt-0.5 select-all truncate text-[13px] font-bold tabular-nums">{config.airtelReceiverPhone}</p>
                      </div>
                      <button type="button" aria-label="Copy Airtel number" onClick={() => { navigator.clipboard.writeText(config.airtelReceiverPhone); toast.success("Copied"); }} className="shrink-0 cursor-pointer opacity-45 transition-opacity hover:opacity-100">
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </div>

                <Field label="Amount sent">
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      disabled={payType === "gpu"}
                      value={payType === "gpu" ? withThousands(String(selectedGpu?.amount || 0)) : withThousands(String(manualAmount))}
                      onChange={(e) => setManualAmount(Number(digitsOnly(e.target.value)) || 0)}
                      className={`${moneyInputCls} pr-14`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold opacity-35">UGX</span>
                  </div>
                </Field>

                <PhoneField label="Sender number" value={senderPhone} onChange={setSenderPhone} />

                <Field label="Transaction ID">
                  <input type="text" required placeholder="MP2410..." value={manualRef} onChange={(e) => setManualRef(e.target.value)} className={`${inputCls} font-mono text-[13px]`} />
                </Field>

                <p className="text-[11px] font-medium leading-relaxed opacity-40">{footerNote}</p>

                <Button variant="primary" size="md" type="submit" loading={isSubmitting} disabled={payType === "gpu" && !selectedGpu} className="w-full">
                  Submit
                </Button>
              </form>
            )}

            {depositMode === "usdt" && (
              <form onSubmit={handleStartManualPayment} className="space-y-4">
                {config.usdtQrUrl ? (
                  <div className="flex justify-center rounded-[10px] border border-[var(--theme-card-border)] bg-white p-2.5">
                    <img src={config.usdtQrUrl} alt="USDT deposit QR code" className="h-36 w-36 object-contain" />
                  </div>
                ) : null}

                <div className="flex items-center gap-2 rounded-[10px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/60 px-3 py-2.5">
                  {config.usdtLogoUrl ? (
                    <img src={config.usdtLogoUrl} alt="USDT" className="h-6 w-6 shrink-0 rounded-full bg-white object-contain" />
                  ) : (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#26A17B] text-[11px] font-black text-white">₮</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--theme-text)] opacity-45">USDT address</p>
                    <p className="mt-0.5 select-all break-all font-mono text-[12px] font-semibold leading-snug">{config.usdtAddress || "Wallet not configured"}</p>
                  </div>
                  <button type="button" aria-label="Copy wallet address" disabled={!config.usdtAddress} onClick={() => { if (config.usdtAddress) { navigator.clipboard.writeText(config.usdtAddress); toast.success("Copied"); } }} className="shrink-0 cursor-pointer opacity-45 transition-opacity hover:opacity-100 disabled:opacity-30">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>

                <Field label="Amount">
                  <div className="flex items-center rounded-[10px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/60 transition-colors focus-within:border-[var(--theme-primary)]">
                    <span className="shrink-0 pl-3 text-[11px] font-bold text-[var(--theme-text)] opacity-40">USD</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      disabled={payType === "gpu"}
                      placeholder="0"
                      aria-label="Amount in US dollars"
                      value={payType === "gpu" ? ((selectedGpu?.amount || 0) / (config.usdtRate || 3700)).toFixed(2) : usdtAmountUSD}
                      onChange={(e) => {
                        const next = e.target.value.replace(/[^0-9.]/g, "");
                        const [whole, ...rest] = next.split(".");
                        setUsdtAmountUSD(rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole);
                      }}
                      className="phone-input min-w-0 flex-1 bg-transparent px-2 py-2.5 text-[14px] font-semibold tabular-nums text-[var(--theme-text)] outline-none placeholder:font-medium placeholder:opacity-35"
                    />
                    <span className="shrink-0 border-l border-[var(--theme-card-border)] py-2.5 pl-2.5 pr-3 text-[11px] font-bold tabular-nums text-[var(--theme-text)] opacity-45">
                      {formatCurrency(finalAmount)}
                    </span>
                  </div>
                </Field>

                <Field label="Transaction hash">
                  <input type="text" required placeholder="0x..." value={manualRef} onChange={(e) => setManualRef(e.target.value)} className={`${inputCls} font-mono text-[13px]`} />
                </Field>

                <p className="text-[11px] font-medium leading-relaxed opacity-40">
                  Send exactly ${(finalAmount / (config.usdtRate || 3700)).toFixed(2)} USDT to the address above, then paste the
                  transaction hash. Deposits are credited after blockchain confirmation.
                </p>

                <Button variant="primary" size="md" type="submit" loading={isSubmitting} disabled={payType === "gpu" && !selectedGpu} className="w-full">
                  Submit
                </Button>
              </form>
            )}
          </div>
        </div>
      ) : paymentStatus === "PENDING" ? (
        <div className="mt-4 rounded-[16px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] p-6 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--theme-primary)]/20 border-t-[var(--theme-primary)]" />
          <p className="mt-4 text-[14px] font-bold">
            {depositMode === "auto" ? "Waiting for approval" : "Checking your transfer"}
          </p>
          <p className="mt-1 text-[12px] font-medium leading-relaxed opacity-50">
            {depositMode === "auto" ? (
              <>Prompt sent to {mobileNumber}. Enter your PIN to approve.</>
            ) : (
              <>Matching {formatCurrency(finalAmount)} against the receiver number.</>
            )}
          </p>
          {currentTransId ? <p className="mt-3 truncate font-mono text-[11px] font-semibold text-[var(--theme-primary)]">{currentTransId}</p> : null}
        </div>
      ) : paymentStatus === "SUCCESSFUL" ? (
        <div className="mt-4 rounded-[16px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-500">
            <CheckCircle className="h-6 w-6" />
          </div>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-500">
            {payType === "gpu" ? "Product active" : "Deposit complete"}
          </p>
          <p className="mt-1 font-display text-[26px] font-black leading-none tracking-tight tabular-nums">{formatCurrency(finalAmount)}</p>
          <p className="mt-2 text-[12px] font-medium opacity-50">
            {payType === "gpu" ? <>{selectedGpu?.name || "Your product"} is now earning daily.</> : <>Added to your trading capital.</>}
          </p>
          <div className="mx-auto mt-4 max-w-[17rem] space-y-1.5 text-left">
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <span className="opacity-45">Paid</span>
              <span className="font-semibold tabular-nums">{formatCurrency(finalAmount)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <span className="opacity-45">Method</span>
              <span className="font-semibold">{depositMode === "usdt" ? "USDT" : "Mobile money"}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <span className="shrink-0 opacity-45">Reference</span>
              <span className="truncate font-mono text-[11px] font-semibold">{currentTransId || "—"}</span>
            </div>
          </div>
          <button onClick={onBack} className="mt-5 w-full cursor-pointer rounded-[10px] bg-[var(--theme-primary)] py-3 font-sans text-[14px] font-extrabold text-[var(--theme-on-primary)] transition-all active:scale-[0.99]">
            Done
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-[16px] border border-rose-500/25 bg-[var(--theme-card-bg)] p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
            <XCircle className="h-6 w-6" />
          </div>
          <p className="mt-4 text-[14px] font-bold">Payment not completed</p>
          <p className="mt-1 text-[12px] font-medium leading-relaxed opacity-50">{errorMsg || "We could not confirm this payment."}</p>
          {currentTransId ? <p className="mt-2 font-mono text-[11px] font-semibold text-[var(--theme-primary)]">{currentTransId}</p> : null}
          <div className="mt-5 flex gap-2">
            <button onClick={() => { setPaymentStatus("IDLE"); setErrorMsg(""); }} className="flex-1 cursor-pointer rounded-[10px] border border-[var(--theme-card-border)] py-2.5 text-[13px] font-bold transition-colors hover:border-[var(--theme-primary)]/40">
              Try again
            </button>
            <button onClick={onBack} className="flex-1 cursor-pointer rounded-[10px] bg-[var(--theme-primary)] py-2.5 text-[13px] font-bold text-[var(--theme-on-primary)]">
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
