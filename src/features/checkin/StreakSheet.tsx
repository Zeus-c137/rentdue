import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Flame, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useCurrency } from "../../currency";
import { formatClock, getPlatformDayKey, getPlatformDayParts, getPlatformYesterdayKey, msUntilPlatformMidnight } from "../../utils/runs";
import { readCachedHistory, writeCachedHistory, type CheckinHistory } from "./history";
import { StreakNumber } from "../../components/fx/StreakNumber";
import { AnimatedNumber } from "../../components/fx/AnimatedNumber";

interface StreakSheetProps {
  open: boolean;
  onClose: () => void;
  streak: number;
  checkedInToday: boolean;
  baseBonus: number;
  increment: number;
  createdAt?: string;
  lastCheckinDate?: string;
  claimedDays?: Set<string> | null;
  claimedLedger?: Record<string, number> | null;
  runStartDay?: number;
  phone?: string;
}

interface Cursor {
  y: number;
  m: number;
}

function compactAmount(amount: number, currency: "UGX" | "USD", exchangeRate: number): string {
  const rate = exchangeRate > 0 ? exchangeRate : 3700;
  const value = Math.abs(currency === "USD" ? amount / rate : amount);
  const sign = amount < 0 ? "-" : "";
  const prefix = currency === "USD" ? "$" : "";
  if (value >= 1_000_000) return `${prefix}${sign}${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}m`;
  if (value >= 10_000) return `${prefix}${sign}${Math.round(value / 1_000)}k`;
  if (value >= 1_000) return `${prefix}${sign}${(value / 1_000).toFixed(1)}k`;
  if (currency === "USD") return `${prefix}${sign}${value >= 1 ? value.toFixed(2) : value.toFixed(3)}`;
  return `${sign}${Math.round(value)}`;
}

export default function StreakSheet({
  open,
  onClose,
  streak,
  checkedInToday,
  baseBonus,
  increment,
  createdAt,
  lastCheckinDate,
  claimedDays = null,
  claimedLedger = null,
  runStartDay = 1,
  phone,
}: StreakSheetProps) {
  const { formatCurrency, currency, exchangeRate } = useCurrency();
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [history, setHistory] = useState<CheckinHistory | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  // Per open-session, not per mount: the sheet unmounts on close, so a ref
  // would never reset and the second open would show stale (or empty) data.
  const historyRequested = useRef<string | null>(null);

  const hasProvidedHistory = claimedDays !== null && claimedDays !== undefined;
  useEffect(() => {
    if (!open || hasProvidedHistory || !phone) return;
    if (historyRequested.current === phone) return;

    // Only clear when we are actually (re)loading — a new account or a fresh
    // request. Clearing on every open used to wipe good history while the
    // guard above stopped the reload, so the second open counted to zero.
    setHistory(null);
    const cached = readCachedHistory(phone);
    if (cached) {
      setHistory(cached);
      historyRequested.current = phone;
      return;
    }

    const controller = new AbortController();
    let settled = false;
    historyRequested.current = phone;
    fetch(`/api/profile/checkin-history/${encodeURIComponent(phone)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || data?.error) throw new Error(data?.error || "Unable to load check-in history.");
        if (controller.signal.aborted) return;
        const result: CheckinHistory = {
          days: Array.isArray(data.days) ? data.days.filter((day: unknown) => typeof day === "string") : [],
          ledger: data.ledger && typeof data.ledger === "object" ? data.ledger : {},
        };
        settled = true;
        writeCachedHistory(phone, result);
        setHistory(result);
      })
      .catch(() => {
        settled = true;
        if (!controller.signal.aborted) historyRequested.current = null;
      });

    return () => {
      controller.abort();
      if (!settled) historyRequested.current = null;
    };
  }, [open, phone, hasProvidedHistory, historyRefreshKey]);

  useEffect(() => {
    if (!open || !phone) return;
    const handleHistoryUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ phone: string; data: CheckinHistory | null }>).detail;
      if (detail?.phone !== phone) return;
      if (detail.data) {
        setHistory(detail.data);
        historyRequested.current = phone;
      } else {
        setHistory(null);
        historyRequested.current = null;
        setHistoryRefreshKey((key) => key + 1);
      }
    };
    window.addEventListener('checkin:history-updated', handleHistoryUpdate);
    return () => window.removeEventListener('checkin:history-updated', handleHistoryUpdate);
  }, [open, phone]);

  useEffect(() => {
    if (!open) return;
    // History lives in this component (the sheet only unmounts its inner
    // content), so it deliberately survives a close/reopen. Re-deriving the
    // clock is all the open transition needs; clearing history here made the
    // metric cards fall back to 0 until a full refresh.
    setCursor(null);
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  const effectiveClaimedDays = claimedDays ?? (history ? new Set(history.days) : null);
  const effectiveClaimedLedger = claimedLedger ?? history?.ledger ?? null;
  const historyLoaded = hasProvidedHistory || history !== null;

  const today = useMemo(() => getPlatformDayParts(), [open]);
  const todayKey = getPlatformDayKey();
  const bounds = useMemo(() => {
    const joined = new Date(createdAt || "");
    const joinedParts = Number.isFinite(joined.getTime()) ? getPlatformDayParts(joined) : today;
    let minYear = joinedParts.y;
    let minMonth = joinedParts.m;
    if (minYear === today.y && minMonth === today.m) {
      minMonth -= 1;
      if (minMonth < 0) {
        minMonth = 11;
        minYear -= 1;
      }
    }
    return { min: { y: minYear, m: minMonth }, max: { y: today.y, m: today.m } };
  }, [createdAt, today]);

  const view = cursor || bounds.max;
  const atMin = view.y < bounds.min.y || (view.y === bounds.min.y && view.m <= bounds.min.m);
  const atMax = view.y > bounds.max.y || (view.y === bounds.max.y && view.m >= bounds.max.m);
  const step = (delta: number) => {
    let y = view.y;
    let m = view.m + delta;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    if (y < bounds.min.y || (y === bounds.min.y && m < bounds.min.m)) return;
    if (y > bounds.max.y || (y === bounds.max.y && m > bounds.max.m)) return;
    setCursor({ y, m });
  };

  const isCurrentMonth = view.y === today.y && view.m === today.m;
  const lastDayKey = lastCheckinDate || (effectiveClaimedDays ? [...effectiveClaimedDays].sort().at(-1) : undefined);
  const todayStreak = checkedInToday
    ? streak
    : lastDayKey === getPlatformYesterdayKey() ? streak + 1 : 1;
  const todayAmount = baseBonus + (todayStreak - 1) * increment;
  const nextIn = msUntilPlatformMidnight(nowMs);

  const dim = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const lead = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const monthName = new Date(Date.UTC(view.y, view.m, 1)).toLocaleString("default", { month: "long" });
  const monthPrefix = `${view.y}-${String(view.m + 1).padStart(2, "0")}`;
  const monthClaimed = effectiveClaimedDays
    ? [...effectiveClaimedDays].filter((day) => day.startsWith(monthPrefix)).length
    : 0;
  const monthSum = effectiveClaimedLedger
    ? Object.entries(effectiveClaimedLedger).reduce((sum, [day, amount]) => day.startsWith(monthPrefix) ? sum + (Number(amount) || 0) : sum, 0)
    : 0;

  const joinedKey = createdAt && Number.isFinite(new Date(createdAt).getTime())
    ? getPlatformDayKey(new Date(createdAt))
    : "0000-00-00";

  const dayState = (dayNum: number) => {
    const key = `${monthPrefix}-${String(dayNum).padStart(2, "0")}`;
    const isToday = isCurrentMonth && dayNum === today.d;
    const isFuture = key > todayKey;
    const isBeforeJoin = key < joinedKey;
    let claimed = effectiveClaimedDays?.has(key) ?? false;
    if (!historyLoaded && !effectiveClaimedDays && isCurrentMonth) {
      claimed = dayNum >= runStartDay && (!isToday || checkedInToday) && !isFuture;
    }
    const missed = historyLoaded && !isBeforeJoin && !isFuture && !isToday && !claimed;
    const amount = Number(effectiveClaimedLedger?.[key] || 0);
    return { key, amount, claimed, missed, isToday, isFuture, isBeforeJoin };
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close streak sheet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 cursor-default bg-black/75"
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="streak-sheet-title"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-[51] mx-auto flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[24px] border border-white/10 bg-black text-white shadow-2xl"
          >
            <div className="flex justify-center pb-2 pt-3" aria-hidden="true">
              <span className="h-1 w-9 rounded-full bg-white/25" />
            </div>

            <header className="flex items-start justify-between px-5 pb-3 pt-1">
              <div className="flex flex-col gap-1.5">
                <h2 id="streak-sheet-title" className="flex items-center gap-2 text-base font-black leading-none">
                  <Flame className="h-4 w-4 shrink-0 self-center text-[var(--theme-primary)]" fill="currentColor" />
                  <span className="flex items-center gap-1.5 text-sm">
                    <StreakNumber value={streak} className="text-sm font-black leading-none tabular-nums" />
                    <span className="leading-none">{streak === 1 ? "day" : "days"} streak</span>
                  </span>
                </h2>
                <p className="pl-6 text-[11px] font-bold tabular-nums text-white/55">
                  {checkedInToday ? `Next check-in ${formatClock(nextIn)}` : `Today's reward ${formatCurrency(todayAmount)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close streak sheet"
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-transform active:scale-95"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
              <div className="mb-4 flex items-center justify-between gap-6 rounded-xl bg-white/[0.06] px-4 py-3">
                  <div className="text-left">
                    <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/45">Days</p>
                    <p className="mt-1 text-xs font-bold tabular-nums text-white/75">
                      <AnimatedNumber from={0} to={monthClaimed} duration={0.5} />
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/45">{monthName} earned</p>
                    <p className="mt-1 text-sm font-black tabular-nums text-[var(--theme-primary)]">
                      <AnimatedNumber
                        from={0}
                        to={monthSum}
                        duration={0.5}
                        format={formatCurrency}
                      />
                    </p>
                  </div>
                </div>

              <div className="mb-2 flex items-center justify-between px-1">
                <button type="button" onClick={() => step(-1)} disabled={atMin} aria-label="Previous month" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white disabled:opacity-30 active:scale-95">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h3 className="text-sm font-black">{monthName} {view.y}</h3>
                <button type="button" onClick={() => step(1)} disabled={atMax} aria-label="Next month" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white disabled:opacity-30 active:scale-95">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-white/45">
                {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`} className="py-1">{day}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: lead }, (_, index) => <span key={`offset-${index}`} />)}
                {Array.from({ length: dim }, (_, index) => {
                  const dayNum = index + 1;
                  const state = dayState(dayNum);
                  const tone = state.claimed
                    ? "bg-[var(--theme-primary)]/15 text-white"
                    : state.missed
                      ? "bg-red-500/10 text-white/60"
                      : "bg-white/[0.035] text-white/65";
                  const label = state.claimed
                    ? `${monthName} ${dayNum}: checked in for ${formatCurrency(state.amount)}`
                    : state.missed ? `${monthName} ${dayNum}: missed check-in` : `${monthName} ${dayNum}`;
                  return (
                    <div
                      key={state.key}
                      title={label}
                      aria-label={label}
                      className={`relative flex aspect-square min-w-0 flex-col items-center justify-center rounded-lg ${tone} ${state.isToday ? "ring-1 ring-[var(--theme-primary)]" : ""} ${state.isBeforeJoin || state.isFuture ? "opacity-30" : ""}`}
                    >
                      <span className="text-[11px] font-bold leading-none tabular-nums">{dayNum}</span>
                      {state.claimed && state.amount > 0 && <span className="mt-1 max-w-full truncate px-0.5 text-[8px] font-bold leading-none text-[var(--theme-primary)]">{compactAmount(state.amount, currency, exchangeRate)}</span>}
                      {state.missed && <span className="mt-1 h-1 w-1 rounded-full bg-red-400" aria-hidden="true" />}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-center gap-5 pt-3 text-[10px] font-semibold text-white/55">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[var(--theme-primary)]/70" />Checked in</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-400" />Missed</span>
                {!historyLoaded && <span className="text-white/40">Loading history…</span>}
              </div>
            </div>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
}
