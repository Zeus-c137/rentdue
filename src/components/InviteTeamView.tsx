import { motion, AnimatePresence } from "motion/react";
import { useCurrency } from "@/src/currency";
import type { LevelMetric } from "@/src/utils/referral";
import { formatPhoneMasked, getSuffix } from "@/src/utils/referral";
import type { ReferralStat } from "@/src/types";
import { Loader2, ArrowLeft } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { APPLE_SPRING, getDrag, getInitial, getExit, getSpring } from "@/src/utils/motion";
import link3d from "@/src/assets/3d/3dicons-link-iso-premium.png";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";

type Props = {
  stats: ReferralStat[];
  isLoading: boolean;
  activeLevel: 1 | 2 | 3 | 4;
  onActiveLevelChange: (l: 1 | 2 | 3 | 4) => void;
  levelMetrics: LevelMetric[];
  activeLevelStats: ReferralStat[];
  onBack?: () => void;
};

function formatJoinedDate(v?: string): string {
  if (!v) return "Recently";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return v;
  }
}

function TeamSummary({
  stats,
  levelMetrics,
  activeLevel,
}: {
  stats: ReferralStat[];
  levelMetrics: LevelMetric[];
  activeLevel: number;
}) {
  const { formatCurrency } = useCurrency();
  const total = stats.reduce((s, r) => s + Number((r as { rewardAmount?: unknown }).rewardAmount || 0), 0);
  const m = levelMetrics.find((x) => x.level === activeLevel);
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-xs font-black text-[var(--theme-text)]">Level {activeLevel} · {m.count} invites</p>
        <p className="text-[11px] opacity-60">{m ? `${formatCurrency(m.earned)} earned` : ""}</p>
      </div>
      <strong className="text-sm font-black text-[var(--theme-primary)]">{formatCurrency(total)}</strong>
    </div>
  );
}

function ActiveIndicator() {
  return (
    <motion.div layoutId="activeLevelTab" transition={APPLE_SPRING} className="absolute inset-0 rounded-full bg-[var(--theme-primary)]" />
  );
}

function TabButton({ lvl, active, onChange }: { lvl: number; active: boolean; onChange: (l: 1 | 2 | 3 | 4) => void; key?: unknown }) {
  return (
    <button onClick={() => onChange(lvl as 1 | 2 | 3 | 4)} className={twMerge(clsx("relative flex-1 py-2 text-xs font-black uppercase rounded-full", active ? "text-white" : "text-[var(--theme-text)] opacity-70"))}>
      {active && <ActiveIndicator />}
      <span className="relative z-10">Level {lvl}</span>
    </button>
  );
}

function LevelTabs({
  activeLevel,
  onChange,
}: {
  activeLevel: number;
  onChange: (l: 1 | 2 | 3 | 4) => void;
}) {
  return (
    <div className="flex justify-center gap-1 overflow-x-auto scrollbar-none pb-1 px-1 border-b border-[var(--theme-card-border)]">
      {[1, 2, 3, 4].map((lvl) => (
        <button
          key={lvl}
          onClick={() => onChange(lvl as 1 | 2 | 3 | 4)}
          className={`px-4 py-2.5 relative text-xs font-black uppercase tracking-wider shrink-0 transition-colors cursor-pointer ${activeLevel === lvl ? "text-[var(--theme-text)]" : "text-[var(--theme-text)] opacity-50 hover:opacity-100"}`}
        >
          Level {lvl}
          {activeLevel === lvl && <span className="absolute bottom-0 left-2 right-2 h-[2.5px] bg-[var(--theme-primary)] rounded-full" />}
        </button>
      ))}
    </div>
  );
}

function MemberRow({ stat }: { stat: ReferralStat; key?: unknown }) {
  const { formatCurrency } = useCurrency();
  const phone = stat.phone ?? "";
  const masked = formatPhoneMasked(phone);
  const suffix = getSuffix(phone);
  return (
    <div className="rounded-[20px] border-0 p-3.5 flex items-center justify-between gap-3 bg-transparent text-xs">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-white bg-[var(--theme-primary)] shrink-0">{suffix}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold truncate">{masked}</span>
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase bg-[var(--theme-primary)]/15 text-[var(--theme-primary)]">Level {stat.level}</span>
          </div>
          <span className="text-[10px] opacity-50 block">Joined {formatJoinedDate(stat.joinedDate)}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <span className="font-bold font-mono text-[var(--theme-primary)] block">{formatCurrency(Number((stat as { rewardAmount?: unknown }).rewardAmount || 0))}</span>
        <span className="text-[10px] opacity-60">{(stat as { activeProductsCount?: unknown }).activeProductsCount as number || 0} active</span>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[64px] rounded-[var(--theme-radius)] bg-[var(--theme-card-border)]/30 animate-pulse border border-[var(--theme-card-border)]"
        />
      ))}
    </div>
  );
}

function EmptyState({ level }: { level: number }) {
  return (
    <div className="min-h-[300px] flex flex-col items-center justify-center text-center py-8">
      <img src={link3d} alt="" loading="lazy" decoding="async" className="w-16 h-16 object-contain opacity-80" />
      <p className="text-xs font-semibold tracking-wide mt-3">No invites · Level {level}</p>
      <p className="text-[11px] opacity-50 mt-1">Share invite link</p>
    </div>
  );
}

function FilteredList({
  isLoading,
  filtered,
  activeLevel,
}: {
  isLoading: boolean;
  filtered: ReferralStat[];
  activeLevel: number;
}) {
  if (isLoading) return <ListSkeleton />;
  if (filtered.length === 0) return <EmptyState level={activeLevel} />;
  return (
    <div className="space-y-2">
      {filtered.map((s, idx) => (
        <MemberRow key={`${s.phone ?? idx}-${idx}`} stat={s} />
      ))}
    </div>
  );
}

function BackNav({ onBack }: { onBack?: () => void }) {
  if (!onBack) return null;
  return (
    <button
      onClick={onBack}
      className="flex items-center gap-1.5 text-xs font-black opacity-70 hover:opacity-100"
    >
      <ArrowLeft className="w-3.5 h-3.5 text-[var(--theme-primary)]" /> Back
    </button>
  );
}

function TeamTitle({ count, isLoading }: { count: number; isLoading: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-black uppercase">Team · {count}</h3>
      {isLoading && <Loader2 className="w-4 h-4 animate-spin text-[var(--theme-primary)]" />}
    </div>
  );
}

export default function InviteTeamView({ stats, isLoading, activeLevel, onActiveLevelChange, levelMetrics, activeLevelStats }: Props) {
  const reduced = useReducedMotion();
  const spring = getSpring(reduced);
  return (
    <div className="w-full flex-1 flex flex-col min-h-0 bg-transparent p-1 text-[var(--theme-text)] space-y-4">
      <div className="flex items-center justify-center py-2 relative">
        <h3 className="font-display font-black text-sm uppercase tracking-wider text-center">Team Income</h3>
        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-[var(--theme-primary)] absolute right-0" />}
      </div>
      <LevelTabs activeLevel={activeLevel} onChange={onActiveLevelChange} />
      <motion.div drag={getDrag(reduced)} dragElastic={0.2} dragConstraints={{ top: 0, bottom: 0 }} className="flex-1 overflow-y-auto overscroll-contain space-y-2 pb-8 scrollbar-none min-h-[300px] select-text" transition={spring}>
        <AnimatePresence mode="wait"><motion.div key={`level-${activeLevel}-${String(isLoading)}`} initial={getInitial(reduced)} animate={{ opacity: 1, y: 0 }} exit={getExit(reduced)} transition={spring} className="space-y-2"><FilteredList isLoading={isLoading} filtered={activeLevelStats} activeLevel={activeLevel} /></motion.div></AnimatePresence>
      </motion.div>
    </div>
  );
}
