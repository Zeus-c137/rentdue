// TODO: flagged untested — add minimal src/utils/referral.test.ts and src/hooks/useClipboard.test.ts once vitest configured
import type { ReferralStat, SiteConfig } from "@/src/types";

export type LevelMetric = {
  level: 1 | 2 | 3 | 4;
  count: number;
  earned: number;
  pct: number;
};

export const LEVEL_FALLBACK_PCT: Record<number, number> = {
  1: 15,
  2: 5,
  3: 0,
  4: 0,
};

export function getLevelMetrics(
  stats: ReferralStat[],
  siteConfig: SiteConfig | null | undefined
): LevelMetric[] {
  const cfg = (siteConfig ?? {}) as Record<string, unknown>;
  return [1, 2, 3, 4].map((level) => {
    const levelStats = stats.filter((s) => Number(s.level) === level);
    const fallbackPct = LEVEL_FALLBACK_PCT[level] ?? 0;
    const configuredPct = Number(cfg[`level${level}InviteIncomePct`]);
    const pct = Number.isFinite(configuredPct) ? configuredPct : fallbackPct;
    const earned = levelStats.reduce(
      (sum, s) => sum + Number((s as { rewardAmount?: unknown }).rewardAmount || 0),
      0
    );
    return {
      level: level as LevelMetric["level"],
      count: levelStats.length,
      earned,
      pct,
    };
  });
}

export function getActiveLevelStats(
  stats: ReferralStat[],
  activeLevel: number
): ReferralStat[] {
  return stats.filter((s) => Number(s.level) === activeLevel);
}

export function buildInviteLink(
  inviteCode: string | undefined,
  origin?: string
): string {
  if (!inviteCode) return "";
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  if (!base) return `?ref=${inviteCode}`;
  const clean = base.replace(/\/$/, "");
  return `${clean}?ref=${inviteCode}`;
}

export function shouldApplyConfig(cfg: unknown): cfg is SiteConfig {
  if (!cfg) return false;
  if (typeof cfg !== "object") return false;
  if ((cfg as { error?: unknown }).error) return false;
  return true;
}

export function toReferralList(raw: unknown): ReferralStat[] {
  if (Array.isArray(raw)) return raw as ReferralStat[];
  return [];
}

export function formatPhoneMasked(phone: string): string {
  if (!phone) return "Unknown";
  if (phone.length > 6) return `${phone.slice(0, 3)}****${phone.slice(-3)}`;
  return phone;
}

export function getSuffix(phone: string): string {
  if (!phone) return "??";
  return phone.slice(-2);
}
