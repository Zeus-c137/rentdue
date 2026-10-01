import React, { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Users, ArrowLeft, Check, Link2 } from "lucide-react";
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
import InviteTeamView from "@/src/components/InviteTeamView";
import { motion, AnimatePresence } from "motion/react";
import { POLL_INTERVAL_MS, getViewMotion } from "@/src/utils/motion";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import type { ReferralStat, SiteConfig, UserProfile } from "@/src/types";

type Props = {
  userProfile: UserProfile;
  siteConfig?: SiteConfig | null;
  onBack?: () => void;
  initialView?: View;
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

/* ---------------------------------- hero ---------------------------------- */

type HeroProps = {
  inviteCode: string;
  inviteLink: string;
  copiedLink: boolean;
  onCopyLink: () => void;
  copiedCode: boolean;
  onCopyCode: () => void;
  topPct: number;
};

function InviteHero({ inviteCode, inviteLink, copiedLink, onCopyLink, copiedCode, onCopyCode, topPct }: HeroProps) {
  return (
    <div className="relative space-y-4">
        <div className="space-y-1.5">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-[var(--theme-primary)]/12 border border-[var(--theme-primary)]/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-primary)]">
            <Users className="w-3 h-3" /> Referral program
          </p>
          <h2 className="font-display font-black text-[26px] leading-[1.05] tracking-tight">
            Invite friends.<br />Earn together.
          </h2>
          <p className="text-xs font-semibold opacity-60 leading-relaxed">
            Earn up to {topPct}% team income every time your network claims, paid across 4 levels.
          </p>
        </div>

        {/* invite code */}
        <button
          onClick={onCopyCode}
          className="w-full flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--theme-primary)]/40 bg-[var(--theme-card-bg)]/70 px-4 py-3 cursor-pointer hover:border-[var(--theme-primary)] transition-colors group"
        >
          <span className="shrink-0 w-9 h-9 rounded-full bg-[var(--theme-primary)]/12 border border-[var(--theme-primary)]/20 flex items-center justify-center text-[var(--theme-primary)]">
            <Link2 className="w-4 h-4" />
          </span>
          <span className="min-w-0 text-left flex-1">
            <span className="block text-[10px] font-black uppercase tracking-[0.14em] opacity-50">Your invite code</span>
            <span className="block font-mono font-black text-xl tracking-[0.2em] truncate">{inviteCode || "N/A"}</span>
          </span>
          <span className="shrink-0 w-9 h-9 rounded-full bg-[var(--theme-primary)]/12 border border-[var(--theme-primary)]/20 flex items-center justify-center text-[var(--theme-primary)] group-hover:bg-[var(--theme-primary)]/20 transition-colors">
            {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </span>
        </button>

        {/* invite link */}
        <div className="flex items-center gap-2 rounded-2xl bg-[var(--theme-card-bg)]/70 border border-[var(--theme-card-border)] pl-3 pr-1.5 py-1.5">
          <Link2 className="w-3.5 h-3.5 opacity-40 shrink-0" />
          <p className="text-[11px] font-mono opacity-70 truncate flex-1 select-text select-all">{inviteLink || "No link"}</p>
          <button
            onClick={onCopyLink}
            aria-label="Copy invite link"
            className="shrink-0 w-8 h-8 rounded-xl bg-[var(--theme-primary)]/12 border border-[var(--theme-primary)]/20 flex items-center justify-center text-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/20 transition-colors cursor-pointer"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

      </div>
  );
}

/* ------------------------------ earnings + levels -------------------------- */

function EarningsHeader({
  amount,
  isLoading,
  onViewTeam,
}: {
  amount: number;
  isLoading: boolean;
  onViewTeam: () => void;
}) {
  const { formatCurrency } = useCurrency();
  const [intro, setIntro] = useState(true);
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <p onAnimationEnd={() => setIntro(false)} className={`text-[10px] font-black uppercase tracking-[0.14em] opacity-50${intro ? " animate-shimmer-slow" : ""}`}>
          Team income
        </p>
        {isLoading ? (
          <div className="h-8 w-36 bg-[var(--theme-card-border)]/40 rounded-xl animate-pulse mt-1.5" />
        ) : (
          <strong onAnimationEnd={() => setIntro(false)} className={`block font-display font-black text-[30px] leading-none tracking-tight text-[var(--theme-primary)] mt-1${intro ? " animate-shimmer-slow" : ""}`}>
            {formatCurrency(Number(amount || 0))}
          </strong>
        )}
      </div>
      <Button variant="primary" size="sm" onClick={onViewTeam} className="shrink-0">
        <Users className="w-4 h-4" /> View Team
      </Button>
    </div>
  );
}

function LevelGrid({
  metrics,
  isLoading,
}: {
  metrics: ReturnType<typeof getLevelMetrics>;
  isLoading: boolean;
}) {
  const { formatCurrency } = useCurrency();
  // One-shot intro shimmer on the level amounts. Latched to first data arrival
  // (not mount) so the sweep isn't wasted on the loading skeleton, and never
  // replays on background polls.
  const [intro, setIntro] = useState(false);
  const latched = useRef(false);
  useEffect(() => {
    if (!isLoading && !latched.current) {
      latched.current = true;
      setIntro(true);
    }
  }, [isLoading]);
  return (
    <div>
      <h3 className="font-display font-black text-[11px] uppercase tracking-[0.14em] opacity-50 mb-2.5">
        Commission by level
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {metrics.map((m) => {
          const live = m.pct > 0;
          return (
            <div
              key={m.level}
              style={{ transform: "translateZ(0)" }}
              className={`relative overflow-hidden rounded-2xl p-3.5 min-h-[118px] flex flex-col justify-between isolate bg-[var(--theme-card-bg)] border transition-colors ${live ? "border-[var(--theme-primary)]/25" : "border-[var(--theme-card-border)] opacity-70"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-display uppercase tracking-[0.12em] font-black opacity-60">
                  Level {m.level}
                </span>
                <span className={`text-[10px] font-mono font-black px-2 py-0.5 rounded-full border ${live ? "bg-[var(--theme-primary)]/12 text-[var(--theme-primary)] border-[var(--theme-primary)]/30" : "opacity-40 border-[var(--theme-card-border)]"}`}>
                  {m.pct}%
                </span>
              </div>
              <div className="space-y-1">
                {isLoading ? (
                  <div className="h-6 w-24 bg-[var(--theme-card-border)]/40 rounded-lg animate-pulse" />
                ) : (
                  <span onAnimationEnd={() => setIntro(false)} className={`font-display font-black text-[19px] leading-none tracking-tight select-text ${live ? "text-[var(--theme-primary)]" : ""}${intro ? " animate-shimmer-slow" : ""}`}>
                    {formatCurrency(m.earned)}
                  </span>
                )}
                <p className="text-[11px] font-bold opacity-50">
                  {m.count} {m.count === 1 ? "invite" : "invites"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type OverviewProps = {
  inviteLink: string;
  inviteCode: string;
  copiedLink: boolean;
  onCopyLink: () => void;
  copiedCode: boolean;
  onCopyCode: () => void;
  metrics: ReturnType<typeof getLevelMetrics>;
  isLoading: boolean;
  referralRewardsEarned: number;
  onViewTeam: () => void;
};

function OverviewView({ inviteLink, inviteCode, copiedLink, onCopyLink, copiedCode, onCopyCode, metrics, isLoading, referralRewardsEarned, onViewTeam }: OverviewProps) {
  const topPct = Math.max(0, ...metrics.map((m) => m.pct));
  return (
    <div className="space-y-5">
      <InviteHero
        inviteCode={inviteCode}
        inviteLink={inviteLink}
        copiedLink={copiedLink}
        onCopyLink={onCopyLink}
        copiedCode={copiedCode}
        onCopyCode={onCopyCode}
        topPct={topPct}
      />
      <div className="space-y-3">
        <EarningsHeader amount={referralRewardsEarned} isLoading={isLoading} onViewTeam={onViewTeam} />
        <LevelGrid metrics={metrics} isLoading={isLoading} />
      </div>
    </div>
  );
}

/* --------------------------------- fetching -------------------------------- */

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

export default function ReferralView({ userProfile, siteConfig, onBack, initialView = "overview" }: Props) {
  const { stats, isLoading, loadError, liveSiteConfig } = useReferralFetch(userProfile.phone, siteConfig ?? null);
  const { copied: copiedLink, copy: copyLink } = useClipboard();
  const { copied: copiedCode, copy: copyCode } = useClipboard();
  const [view, setView] = useState<View>(initialView);
  useEffect(() => { setView(initialView); }, [initialView]);
  const [activeLevel, setActiveLevel] = useState<1 | 2 | 3 | 4>(1);
  const inviteCode = userProfile.inviteCode || "";
  const inviteLink = buildInviteLink(inviteCode);
  const levelMetrics = getLevelMetrics(stats, liveSiteConfig ?? siteConfig);
  const activeLevelStats = getActiveLevelStats(stats, activeLevel);
  const reduced = useReducedMotion();
  const viewMotion = getViewMotion(reduced);
  const viewElements: Record<View, React.ReactElement> = {
    overview: <OverviewView inviteLink={inviteLink} inviteCode={inviteCode} copiedLink={copiedLink} onCopyLink={() => copyLink(inviteLink)} copiedCode={copiedCode} onCopyCode={() => copyCode(inviteCode)} metrics={levelMetrics} isLoading={isLoading} referralRewardsEarned={Number(userProfile.referralRewardsEarned || 0)} onViewTeam={() => setView("team")} />,
    team: <InviteTeamView stats={stats} isLoading={isLoading} activeLevel={activeLevel} onActiveLevelChange={setActiveLevel as (l: 1 | 2 | 3 | 4) => void} activeLevelStats={activeLevelStats} siteConfig={liveSiteConfig ?? siteConfig} />,
  };
  return (
    <div className="bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-[24px] p-4 text-[var(--theme-text)] space-y-5 pb-16">
      {(onBack || view === "team") && <button onClick={() => view === "team" ? setView("overview") : onBack?.()} className="flex items-center gap-2 text-xs font-extrabold opacity-70 hover:opacity-100 py-1.5 px-3 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] shadow-sm"><ArrowLeft className="w-3.5 h-3.5 text-[var(--theme-primary)]" /> {view === "team" ? "Invite" : "Profile"}</button>}
      <ErrorBanner msg={loadError} />
      <AnimatePresence mode="wait"><motion.div key={view} initial={viewMotion.initial} animate={viewMotion.animate} exit={viewMotion.exit} transition={viewMotion.transition}>{viewElements[view]}</motion.div></AnimatePresence>
    </div>
  );
}
