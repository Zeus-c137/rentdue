import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import flameSvg from "@/src/assets/svg/flame.svg";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import { fetchJsonWithSignal } from "../utils/abortableFetch";
import { unlockCheckinSound, playCheckinSound } from "../utils/checkinSound";
import { formatClock, getTodayKey, getPlatformDayKey, getPlatformDayParts, getPlatformYesterdayKey, msUntilPlatformMidnight } from "../utils/runs";
import type { TransactionRow, UserProfile } from "../types";
import dollar3d from "@/src/assets/3d/3dicons-dollar-iso-premium.png";

interface Props {
  phone: string;
  userProfile: UserProfile;
  siteConfig?: any;
  onClaimSuccess?: (p: UserProfile) => void;
  onBack?: () => void;
}

interface Cursor { y: number; m: number; }
interface FlightCoin {
  id: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  delay: number;
}

/**
 * Streaks page: accrued panel, month panning capped to the join month,
 * and home-style day tiles. Linked from Home's calendar icon and Profile's
 * check-in button — no modals.
 */
export default function StreaksPage({ phone, userProfile, siteConfig, onClaimSuccess, onBack }: Props) {
  const { formatCurrency } = useCurrency();
  const [claimedDays, setClaimedDays] = useState<Set<string>>(new Set());
  const [claimedLedger, setClaimedLedger] = useState<Record<string, number>>({});
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);
  const claimBusyRef = useRef(false);
  const claimRevisionRef = useRef(0);
  const [coins, setCoins] = useState<FlightCoin[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const accruedRef = useRef<HTMLParagraphElement>(null);
  const profileRef = useRef(userProfile);
  profileRef.current = userProfile;
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) setNowMs(Date.now()); }, 1000);
    return () => clearInterval(timer);
  }, []);

  const todayKey = getTodayKey();
  const checkedInToday = userProfile.lastCheckinDate === todayKey;
  const streak = Math.max(0, Number(userProfile.checkinStreak) || 0);
  const base = siteConfig?.checkinBaseBonus ?? 0;
  const inc = siteConfig?.checkinIncrement ?? 0;

  // Ledger truth from daily_checkin_bonus transactions.
  useEffect(() => {
    const ctrl = new AbortController();
    const revision = claimRevisionRef.current;
    fetchJsonWithSignal<TransactionRow[]>(`/api/profile/transactions/${phone}`, ctrl.signal)
      .then((rows) => {
        if (ctrl.signal.aborted || revision !== claimRevisionRef.current || claimBusyRef.current || !Array.isArray(rows)) return;
        const days = new Set<string>();
        const ledger: Record<string, number> = {};
        for (const tx of rows) {
          if (String(tx.type || "").toLowerCase() !== "daily_checkin_bonus") continue;
          if (!["SUCCESSFUL", "COMPLETED"].includes(String(tx.status || "").toUpperCase())) continue;
          const ts = new Date(tx.timestamp).getTime();
          if (!Number.isFinite(ts)) continue;
          const key = getPlatformDayKey(new Date(ts));
          days.add(key);
          ledger[key] = (ledger[key] || 0) + (Number(tx.amount) || 0);
        }
        setClaimedDays(days);
        setClaimedLedger(ledger);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [phone]);

  // Bounds: back to the join month (plus one behind when new), forward to today.
  // Platform calendar — the grid lays out platform YMDs.
  const now = new Date();
  const nowPlat = getPlatformDayParts(now);
  const bounds = useMemo(() => {
    const max = { y: nowPlat.y, m: nowPlat.m };
    const joined = new Date(userProfile.createdAt || "").getTime();
    const baseDate = Number.isFinite(joined) ? new Date(joined) : now;
    const basePlat = getPlatformDayParts(baseDate);
    let y = basePlat.y;
    let m = basePlat.m;
    if (y === max.y && m === max.m) {
      m -= 1;
      if (m < 0) { m = 11; y -= 1; }
    }
    return { min: { y, m }, max };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile.createdAt, todayKey]);
  const view = cursor || bounds.max;
  const atMin = view.y < bounds.min.y || (view.y === bounds.min.y && view.m <= bounds.min.m);
  const atMax = view.y > bounds.max.y || (view.y === bounds.max.y && view.m >= bounds.max.m);
  const step = (delta: number) => {
    let y = view.y;
    let m = view.m + delta;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    const { min, max } = bounds;
    if (y < min.y || (y === min.y && m < min.m)) return;
    if (y > max.y || (y === max.y && m > max.m)) return;
    setCursor({ y, m });
  };

  const isCurrentMonth = view.y === nowPlat.y && view.m === nowPlat.m;
  const dim = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const lead = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const monthName = new Date(Date.UTC(view.y, view.m, 1)).toLocaleString("default", { month: "long" });
  const prefix = `${view.y}-${String(view.m + 1).padStart(2, "0")}`;

  let monthClaimed = 0;
  let monthSum = 0;
  for (const key of claimedDays) {
    if (key.startsWith(prefix)) {
      monthClaimed += 1;
      monthSum += Number(claimedLedger[key]) || 0;
    }
  }

  const todayMs = Date.UTC(nowPlat.y, nowPlat.m, nowPlat.d);
  const tomorrowMs = todayMs + 86400000;
  const nextIn = msUntilPlatformMidnight(nowMs);
  const todayStreak = checkedInToday ? streak : userProfile.lastCheckinDate === getPlatformYesterdayKey() ? streak + 1 : 1;
  const todayAmount = base + (todayStreak - 1) * inc;

  const handleCheckin = async (e?: React.MouseEvent<HTMLElement>) => {
    if (e) e.stopPropagation();
    if (checkedInToday || claimBusyRef.current) return;
    const sourceRect = e?.currentTarget.getBoundingClientRect() ?? null;
    const key = todayKey;
    const previousProfile = profileRef.current;
    const previousHadDay = claimedDays.has(key);
    const previousLedgerAmount = Number(claimedLedger[key]) || 0;
    const optimisticStreak = previousProfile.lastCheckinDate === getPlatformYesterdayKey()
      ? streak + 1
      : 1;
    const optimisticBonus = Math.max(0, Number(base) + (optimisticStreak - 1) * Number(inc));
    const optimisticProfile = {
      ...previousProfile,
      points: (Number(previousProfile.points) || 0) + optimisticBonus,
      lastCheckinDate: key,
      checkinStreak: optimisticStreak,
    };

    claimRevisionRef.current += 1;
    claimBusyRef.current = true;
    setClaimBusy(true);
    setClaimedDays((prev) => new Set(prev).add(key));
    setClaimedLedger((prev) => ({ ...prev, [key]: (Number(prev[key]) || 0) + optimisticBonus }));
    profileRef.current = optimisticProfile;
    onClaimSuccess?.(optimisticProfile);
    unlockCheckinSound();
    playCheckinSound();

    // Coin travel begins with the local claim and never holds the balance update.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = rootRef.current;
    const target = accruedRef.current?.getBoundingClientRect();
    if (!reduced && sourceRect && root && target) {
      const rootRect = root.getBoundingClientRect();
      const startX = sourceRect.left + sourceRect.width / 2 - rootRect.left;
      const startY = sourceRect.top + sourceRect.height / 2 - rootRect.top;
      const endX = target.left + target.width / 2 - rootRect.left;
      const endY = target.top + target.height / 2 - rootRect.top;
      setCoins(Array.from({ length: 10 }, (_, i) => ({
        id: Date.now() + i,
        startX: startX + (Math.random() - 0.5) * 24,
        startY: startY + (Math.random() - 0.5) * 10,
        dx: endX - startX + (Math.random() - 0.5) * 30,
        dy: endY - startY,
        delay: i * 0.06,
      })));
      window.setTimeout(() => setCoins(null), 1050);
    }

    try {
      const res = await fetch("/api/user/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Check-in failed.");
      claimRevisionRef.current += 1;
      const bonus = Math.max(0, Number(data.amount ?? data.bonus ?? optimisticBonus) || 0);
      const nextStreak = Number(data.streak ?? optimisticStreak);
      const latest = profileRef.current;
      const confirmedProfile = {
        ...latest,
        points: (Number(latest.points) || 0) + bonus - optimisticBonus,
        lastCheckinDate: key,
        checkinStreak: nextStreak,
      };
      profileRef.current = confirmedProfile;
      onClaimSuccess?.(confirmedProfile);
      if (bonus !== optimisticBonus) {
        setClaimedLedger((prev) => ({ ...prev, [key]: Math.max(0, (Number(prev[key]) || 0) + bonus - optimisticBonus) }));
      }
      toast.success("Check-in collected", {
        description: bonus > 0
          ? `+${formatCurrency(bonus)} added to your balance. Day ${nextStreak} streak.`
          : `Day ${nextStreak} streak saved.`,
        duration: 4500,
      });
    } catch (err: any) {
      claimRevisionRef.current += 1;
      const latest = profileRef.current;
      const rollbackProfile = {
        ...latest,
        points: Math.max(0, (Number(latest.points) || 0) - optimisticBonus),
        lastCheckinDate: previousProfile.lastCheckinDate,
        checkinStreak: previousProfile.checkinStreak,
      };
      profileRef.current = rollbackProfile;
      onClaimSuccess?.(rollbackProfile);
      setClaimedDays((prev) => {
        if (previousHadDay) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setClaimedLedger((prev) => ({ ...prev, [key]: previousLedgerAmount }));
      setCoins(null);
      toast.error(err.message || "Check-in failed.");
    } finally {
      claimBusyRef.current = false;
      setClaimBusy(false);
    }
  };

  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  while (cells.length < 42) cells.push(null);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div ref={rootRef} className="relative w-full flex-1 flex flex-col min-h-0">
      <AnimatePresence>
        {coins && (
          <div className="absolute inset-0 z-30 pointer-events-none overflow-visible" aria-hidden="true">
            {coins.map((coin) => (
              <motion.img
                key={coin.id}
                src={dollar3d}
                alt=""
                initial={{ x: 0, y: 0, scale: 0.7, opacity: 1 }}
                animate={{ x: coin.dx, y: coin.dy, scale: 0.25, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, delay: coin.delay, ease: "easeOut" }}
                className="absolute w-9 h-9 object-contain"
                style={{ left: coin.startX - 18, top: coin.startY - 18 }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-8 scrollbar-none min-h-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button type="button" onClick={onBack} aria-label="Back" className="w-9 h-9 rounded-full border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] flex items-center justify-center text-[var(--theme-text)] cursor-pointer active:scale-95 transition-all shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
           <div className="min-w-0 flex-1 mx-12">
            <p className="text-[12px] font-black tracking-[0.14em] text-[var(--theme-text)]  leading-none">
              Your daily streak {isCurrentMonth ? "this month" : monthName}
            </p>
            <div className="flex items-baseline gap-2.5 mt-2">
              <p className="inline-flex items-center gap-1 text-[13px] font-sans font-black text-[var(--theme-primary)]">
                <img src={flameSvg} alt="" aria-hidden="true" className="h-4 w-auto" />
                {monthClaimed} day{monthClaimed === 1 ? "" : "s"}
              </p>
              <p ref={accruedRef} className="font-display font-black text-2xl text-[var(--theme-text)] tracking-tight leading-none">
                {formatCurrency(monthSum)}
              </p>
            </div>
          </div>
        </div>

        {/*   the viewed month */}
        <div className="px-1 py-1 mt-3 flex items-end justify-between gap-3">

          {checkedInToday ? (
            <p className="text-right text-[11px] font-sans font-bold tabular-nums text-[var(--theme-primary)] shrink-0">
              Come back in<br />{formatClock(nextIn)}
            </p>
          ) : (
            <p className="text-right text-[12px] font-sans font-bold tabular-nums text-[var(--theme-primary)] shrink-0">
              {`Day ${todayStreak} reward • ${formatCurrency(todayAmount)}`}
            </p>
          )}
        </div>

        {/* Month nav */}
        <div className="flex items-center justify-between px-1 gap-2 mt-4 mb-3">
          <button type="button" onClick={() => step(-1)} disabled={atMin} aria-label="Previous month" className="w-9 h-9 rounded-full border border-[var(--theme-card-border)] flex items-center justify-center cursor-pointer disabled:opacity-30 active:scale-95 transition-all"><ChevronLeft className="w-4 h-4" /></button>
          <span className="font-display font-black text-sm text-[var(--theme-text)] flex-1 text-center">
            {monthName} {view.y}
          </span>
          <button type="button" onClick={() => step(1)} disabled={atMax} aria-label="Next month" className="w-9 h-9 rounded-full border border-[var(--theme-card-border)] flex items-center justify-center cursor-pointer disabled:opacity-30 active:scale-95 transition-all"><ChevronRight className="w-4 h-4" /></button>
        </div>

        {/* Home-style day tiles — frosted, bigger coins/dates to match Home */}
        <div className="relative rounded-[24px] bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 p-3">
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={i} className="text-[12px] font-sans font-black opacity-50 py-1">{d}</span>
            ))}
            {cells.map((day, i) => {
              if (day === null) return <span key={`blank-${i}`} />;
              const ms = Date.UTC(view.y, view.m, day);
              const key = new Date(ms).toISOString().split("T")[0];
              const claimed = (checkedInToday && ms === todayMs) || claimedDays.has(key);
              const isToday = ms === todayMs;
              const isFuture = ms > todayMs;
              const isNext = checkedInToday && ms === tomorrowMs;
              const missed = !isFuture && !isToday && !claimed;
              const dimmed = missed || isFuture;
              const active = isToday && !claimed;
              const inner = (
                <>
                  <img
                    src={dollar3d}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={`w-10 h-10 object-contain ${dimmed ? "grayscale" : ""}`}
                  />
                  {missed && <div className="absolute inset-0 rounded-xl bg-black/45 pointer-events-none" />}
                  <span className={`text-[11px] font-sans font-black uppercase tracking-wide ${claimed ? "text-[var(--theme-primary)]" : "text-[var(--theme-text-muted)]"}`}>
                    {day}
                  </span>
                </>
              );
              const cls = `relative rounded-xl w-full min-h-[78px] py-2 flex flex-col items-center justify-center gap-1 ${
                claimed
                  ? ""
                  : active
                    ? "border border-[var(--theme-primary)]/70 tile-shimmer streak-tile-pulse"
                    : isNext
                      ? "border border-dashed border-[var(--theme-text)]/25 bg-[var(--theme-text)]/[0.03] opacity-40"
                      : isFuture
                        ? "opacity-40"
                        : ""
              }`;
              if (active) {
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={(e) => {
                      void handleCheckin(e);
                    }}
                    disabled={claimBusy}
                    aria-label="Check in today"
                    className={`${cls} cursor-pointer active:scale-95 transition-transform`}
                  >
                    {claimBusy ? <span className="text-[10px] font-black text-[var(--theme-primary)]">…</span> : inner}
                  </button>
                );
              }
              if (claimed) {
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      toast.info(`Day ${day} • Already checked-in`);
                    }}
                    aria-label={`Claimed day ${day}`}
                    className={`${cls} cursor-pointer active:scale-95 transition-transform`}
                  >
                    {inner}
                  </button>
                );
              }
              if (isNext) {
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      toast.info(`Day ${day} • Come back in ${formatClock(nextIn)}`);
                    }}
                    aria-label="Next check-in"
                    className={`${cls} cursor-pointer active:scale-95 transition-transform`}
                  >
                    {inner}
                  </button>
                );
              }
              return (
                <div key={key} className={cls}>
                  {inner}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[12px] font-sans font-medium opacity-70">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[var(--theme-primary)] shadow-[0_0_6px_var(--theme-primary)]" />Claimed</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />Missed</span>
          </div>
        </div>
      </div>
    </div>
  );
}
