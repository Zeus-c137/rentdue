import React, { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Users, ArrowLeft, Check, Share2 } from "lucide-react";
import { useCurrency } from "@/src/currency";
import { Button } from "@/src/components/ui/button";
import {
  getLevelMetrics,
  getActiveLevelStats,
  buildInviteLink,
  shouldApplyConfig,
  toReferralList,
} from "@/src/utils/referral";
import { useClipboard } from "@/src/hooks/useClipboard";
import { useAbortSignal, useGatedInterval } from "@/src/hooks/useGatedInterval";
import { fetchJsonWithSignal } from "@/src/utils/api";
import { useTheme } from "@/src/context/ThemeContext";
import InviteTeamView from "@/src/components/InviteTeamView";
import { motion, AnimatePresence } from "motion/react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { CARD_VARIANTS, POLL_INTERVAL_MS, getViewMotion } from "@/src/utils/motion";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import type { ReferralStat, SiteConfig, UserProfile } from "@/src/types";

type Props = {
  userProfile: UserProfile;
  siteConfig?: SiteConfig | null;
  onBack?: () => void;
};

type View = "overview" | "team";

function ErrorBanner({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="rounded-[var(--theme-radius)] border border-amber-500/20 bg-[var(--theme-card-bg)] px-4 py-3 text-xs font-semibold text-[var(--theme-text)]">
      {msg}
    </div>
  );
}

function CodePill({ inviteCode, onCopyCode, copiedCode }: { inviteCode: string; onCopyCode: () => void; copiedCode: boolean }) {
  return (
    <button onClick={onCopyCode} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--theme-primary)]/12 border border-[var(--theme-primary)]/18 px-3 py-1 text-[10px] font-black tracking-widest text-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/20 transition-colors cursor-pointer">
      CODE: {inviteCode || "N/A"}
      {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3 opacity-60" />}
    </button>
  );
}

function CopyLinkButton({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  return (
    <Button variant="gold-glossy" size="sm" onClick={onCopy} className="shrink-0 !min-w-0 !px-3" glow={false}>
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    </Button>
  );
}

function ShareLinkBox({ inviteLink, inviteCode, copied, onCopy, copiedCode, onCopyCode }: { inviteLink: string; inviteCode: string; copied: boolean; onCopy: () => void; copiedCode: boolean; onCopyCode: () => void }) {
  const { cardStyle } = useTheme();
  const cardCls = twMerge(clsx("theme-card p-4 rounded-[var(--theme-radius)] space-y-3", CARD_VARIANTS[cardStyle]));
  // One-shot intro shimmer on the referral link — plays once per view mount.
  const [intro, setIntro] = useState(true);
  return (
    <div className={cardCls}>
      <CodePill inviteCode={inviteCode} copiedCode={copiedCode} onCopyCode={onCopyCode} />
      <div className="flex items-center gap-2">
        <p onAnimationEnd={() => setIntro(false)} className={`text-xs font-mono opacity-80 truncate flex-1 select-text select-all${intro ? " animate-shimmer-slow" : ""}`}>{inviteLink || "No link"}</p>
        <button onClick={onCopy} className="p-1.5 rounded-lg bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] hover:border-[var(--theme-primary)]/30 transition-colors shrink-0">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 opacity-60" />}
        </button>
      </div>
    </div>
  );
}

function HeroMetrics({
  metrics,
  isLoading,
}: {
  metrics: ReturnType<typeof getLevelMetrics>;
  isLoading: boolean;
}) {
  const { formatCurrency } = useCurrency();
  const { cardStyle } = useTheme();
  const cardCls =
    cardStyle === "glass"
      ? "bg-[var(--theme-card-bg)]/60 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 shadow-sm"
      : "bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] shadow-sm";
  // One-shot intro shimmer on the four level amounts. Latched to first data
  // arrival (not mount) so the sweep isn't wasted on the loading skeleton,
  // and never replays on background polls.
  const [intro, setIntro] = useState(false);
  const latched = useRef(false);
  useEffect(() => {
    if (!isLoading && !latched.current) {
      latched.current = true;
      setIntro(true);
    }
  }, [isLoading]);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {metrics.map((m) => (
        <div
          key={m.level}
          style={{ transform: "translateZ(0)" }}
          className={`relative overflow-hidden theme-card rounded-[var(--theme-radius)] p-3.5 h-[112px] flex flex-col justify-between isolate ${cardCls}`}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-[10.5px] font-display uppercase tracking-[0.12em] font-black text-[var(--theme-text)] opacity-60">Level {m.level}</span>
            <span className="text-[10px] font-mono font-black px-2 py-0.5 rounded-full bg-transparent text-[var(--theme-primary)] border border-[var(--theme-primary)]">
              {m.pct}%
            </span>
          </div>
          <div className="space-y-0.5">
            {isLoading ? (
              <div className="h-6 w-28 bg-[var(--theme-card-border)]/40 rounded-xl animate-pulse" />
            ) : (
              <span onAnimationEnd={() => setIntro(false)} className={`font-display font-black text-[18px] leading-none tracking-tight select-text text-[var(--theme-primary)]${intro ? " animate-shimmer-slow" : ""}`}>{formatCurrency(m.earned)}</span>
            )}
            <p className="text-[11px] font-bold opacity-50">{m.count} invites</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function CollectedRow({ amount }: { amount: number }) {
  const { formatCurrency } = useCurrency();
  // One-shot intro shimmer on the Team income title + value.
  const [intro, setIntro] = useState(true);
  return (
    <div className="flex flex-col gap-0.5">
      <p onAnimationEnd={() => setIntro(false)} className={`text-[10px] font-black uppercase tracking-wider opacity-60${intro ? " animate-shimmer-slow" : ""}`}>Team income</p>
      <strong onAnimationEnd={() => setIntro(false)} className={`text-lg font-black text-[var(--theme-primary)] whitespace-nowrap leading-none${intro ? " animate-shimmer-slow" : ""}`}>
        {formatCurrency(Number(amount || 0))}
      </strong>
    </div>
  );
}

function LevelsCard({ metrics }: { metrics: ReturnType<typeof getLevelMetrics> }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-[var(--theme-card-border)] pb-2">
        <h3 className="font-display font-black text-xs uppercase tracking-wider flex items-center gap-2">
          <Users className="w-4 h-4 text-[var(--theme-primary)]" />
          Team Levels
        </h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {metrics.map((m) => (
          <div
            key={m.level}
            className="rounded-[20px] border-0 p-3.5 flex items-center gap-3 bg-transparent"
          >
            <div className="w-11 h-11 rounded-2xl bg-[var(--theme-primary)]/10 border border-[var(--theme-primary)]/15 flex items-center justify-center shrink-0">
              <span className="text-xs font-black text-[var(--theme-primary)]">L{m.level}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black">Level {m.level} · {m.pct}%</span>
                <span className="text-[10px] font-mono font-black text-[var(--theme-primary)] bg-[var(--theme-primary)]/10 px-1.5 py-0.5 rounded-full border border-[var(--theme-primary)]/15">{m.pct}%</span>
              </div>
              <p className="text-[11px] opacity-60 mt-0.5">{m.level === 1 ? "Direct" : "Network"} · {m.pct}% bonus</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type HeroCardProps = {
  metrics: ReturnType<typeof getLevelMetrics>;
  isLoading: boolean;
  amount: number;
  onViewTeam: () => void;
};

function HeroCard({ metrics, isLoading, amount, onViewTeam }: HeroCardProps & { onViewTeam: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <CollectedRow amount={amount} />
        <ViewTeamButton onViewTeam={onViewTeam} />
      </div>
      <HeroMetrics metrics={metrics} isLoading={isLoading} />
    </div>
  );
}

function ViewTeamButton({ onViewTeam }: { onViewTeam: () => void }) {
  return (
    <div className="flex justify-end">
      <Button variant="gold-glossy" size="sm" onClick={onViewTeam} glow={false}>
        <Users className="w-4 h-4" /> View Team
      </Button>
    </div>
  );
}

type OverviewProps = {
  inviteLink: string;
  inviteCode: string;
  copied: boolean;
  onCopy: () => void;
  copiedCode: boolean;
  onCopyCode: () => void;
  metrics: ReturnType<typeof getLevelMetrics>;
  isLoading: boolean;
  referralRewardsEarned: number;
  onViewTeam: () => void;
};

function OverviewView({ inviteLink, inviteCode, copied, onCopy, copiedCode, onCopyCode, metrics, isLoading, referralRewardsEarned, onViewTeam }: OverviewProps) {
  return (
    <div className="space-y-4">
      <ShareLinkBox inviteLink={inviteLink} inviteCode={inviteCode} copied={copied} onCopy={onCopy} copiedCode={copiedCode} onCopyCode={onCopyCode} />
      <HeroCard metrics={metrics} isLoading={isLoading} amount={referralRewardsEarned} onViewTeam={onViewTeam} />
    </div>
  );
}

function useReferralFetch(phone: string, initialConfig?: SiteConfig | null) {
  const [stats, setStats] = useState<ReferralStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [liveSiteConfig, setLiveSiteConfig] = useState<SiteConfig | null>(initialConfig ?? null);
  const { renew } = useAbortSignal();
  const load = useCallback(async () => {
    const sig = renew(); setIsLoading(true);
    try {
      const ref = await fetchJsonWithSignal<ReferralStat[]>(`/api/profile/referrals/${phone}`, sig);
      const cfg = await fetchJsonWithSignal<SiteConfig>("/api/config/site", sig);
      if (sig.aborted) return;
      setStats(toReferralList(ref));
      if (shouldApplyConfig(cfg)) setLiveSiteConfig(cfg);
      setLoadError("");
    } catch (e) {
      const err = e as Error;
      if (err?.name !== "AbortError") setLoadError(err.message || "Referral data unavailable.");
    } finally { if (!sig.aborted) setIsLoading(false); }
  }, [phone, renew]);
  useEffect(() => { void load(); }, [load]);
  useGatedInterval(load, POLL_INTERVAL_MS, { enabled: !!phone, visibilityGate: true, runOnVisible: true });
  return { stats, isLoading, loadError, liveSiteConfig };
}

export default function ReferralView({ userProfile, siteConfig, onBack }: Props) {
  const { stats, isLoading, loadError, liveSiteConfig } = useReferralFetch(userProfile.phone, siteConfig ?? null);
  const { copied: copiedLink, copy: copyLink } = useClipboard();
  const { copied: copiedCode, copy: copyCode } = useClipboard();
  const [view, setView] = useState<View>("overview");
  const [activeLevel, setActiveLevel] = useState<1 | 2 | 3 | 4>(1);
  const inviteLink = buildInviteLink(userProfile.inviteCode);
  const levelMetrics = getLevelMetrics(stats, liveSiteConfig ?? siteConfig);
  const activeLevelStats = getActiveLevelStats(stats, activeLevel);
  const reduced = useReducedMotion();
  const viewMotion = getViewMotion(reduced);
  const viewElements: Record<View, React.ReactElement> = {
    overview: <OverviewView inviteLink={inviteLink} inviteCode={userProfile.inviteCode || ""} copied={copiedLink} onCopy={() => copyLink(inviteLink)} copiedCode={copiedCode} onCopyCode={() => copyCode(userProfile.inviteCode || "")} metrics={levelMetrics} isLoading={isLoading} referralRewardsEarned={Number(userProfile.referralRewardsEarned || 0)} onViewTeam={() => setView("team")} />,
    team: <InviteTeamView stats={stats} isLoading={isLoading} activeLevel={activeLevel} onActiveLevelChange={setActiveLevel as (l: 1 | 2 | 3 | 4) => void} levelMetrics={levelMetrics} activeLevelStats={activeLevelStats} />,
  };
  return (
    <div className="bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-[24px] p-4 text-[var(--theme-text)] space-y-5 pb-16">
      {(onBack || view === "team") && <button onClick={() => view === "team" ? setView("overview") : onBack?.()} className="flex items-center gap-2 text-xs font-extrabold opacity-70 hover:opacity-100 py-1.5 px-3 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] shadow-sm"><ArrowLeft className="w-3.5 h-3.5 text-[var(--theme-primary)]" /> {view === "team" ? "Invite" : "Profile"}</button>}
      <ErrorBanner msg={loadError} />
      <AnimatePresence mode="wait"><motion.div key={view} initial={viewMotion.initial} animate={viewMotion.animate} exit={viewMotion.exit} transition={viewMotion.transition}>{viewElements[view]}</motion.div></AnimatePresence>
    </div>
  );
}
