import type { VipTaskConfig, VipTask, VipTaskboard } from "../types";

export function calcVipProgress(accumulatedBonus: number, requiredBonus: number): number {
  return Math.min((accumulatedBonus / Math.max(requiredBonus, 1)) * 100, 100);
}

export function getNextVipRequirement(tasks: Pick<VipTask, "requiredBonus" | "unlocked" | "claimed">[], accumulatedBonus: number): number {
  return tasks.find((task) => !task.unlocked && !task.claimed)?.requiredBonus || accumulatedBonus || 1;
}

export function normalizeVipTaskboard(data: unknown): VipTaskboard {
  const raw = (data ?? {}) as Record<string, unknown>;
  const rp = ((raw.progress ?? {}) as Record<string, unknown>);
  const rr = ((raw.referralRates ?? {}) as Record<string, unknown>);
  const tr = ((raw.tierRewards ?? {}) as Record<string, unknown>);
  const cleanTierRewards: Record<string, number> = {};
  if (tr && typeof tr === "object") {
    for (const [k, v] of Object.entries(tr)) {
      const name = String(k).trim();
      if (name) cleanTierRewards[name] = Math.max(0, Number(v) || 0);
    }
  }
  const ctr = Array.isArray(raw.claimedTierRewards) ? (raw.claimedTierRewards as unknown[]).filter((e) => typeof e === "string") as string[] : [];
  const tm = normalizeTierMeta(raw.tierMeta);
  return {
    tasks: Array.isArray(raw.tasks) ? (raw.tasks as VipTask[]) : [],
    vipLevel: Number((raw.vipLevel as number) || 0),
    stageOrder: Array.isArray(raw.stageOrder) ? (raw.stageOrder as unknown[]).map((e) => String(e)) : [],
    tierRewards: cleanTierRewards,
    tierMeta: tm,
    claimedTierRewards: ctr,
    referralRates: { level1: Number(rr.level1 ?? 15), level2: Number(rr.level2 ?? 5), level3: Number(rr.level3 ?? 0), level4: Number(rr.level4 ?? 0) },
    progress: {
      level1Bonus: Number((rp.level1Bonus ?? rp.level1 ?? raw.level1Bonus ?? 0) as number),
      level2Bonus: Number((rp.level2Bonus ?? rp.level2 ?? raw.level2Bonus ?? 0) as number),
      level3Bonus: Number((rp.level3Bonus ?? rp.level3 ?? raw.level3Bonus ?? 0) as number),
      level4Bonus: Number((rp.level4Bonus ?? rp.level4 ?? raw.level4Bonus ?? 0) as number),
      accumulatedBonus: Number((rp.accumulatedBonus ?? raw.accumulatedBonus ?? 0) as number),
      totalReferralBonus: Number((rp.totalReferralBonus ?? raw.totalReferralBonus ?? 0) as number),
      operatorPoints: Number((rp.operatorPoints ?? raw.operatorPoints ?? 0) as number),
    },
  };
}

export function normalizeVipTask(raw: unknown): VipTaskConfig {
  const d = (raw ?? {}) as Record<string, unknown>;
  const imageUrl = String(d.imageUrl ?? "").trim();
  const metric = String(d.metric ?? "operator_points").trim() || "operator_points";
  return {
    id: String(d.id ?? "").trim(),
    title: String(d.title ?? "").trim(),
    description: String(d.description ?? "").trim(),
    category: String(d.category ?? "").trim(),
    metric,
    requiredBonus: Math.max(0, Number(d.requiredBonus ?? 0)),
    reward: Math.max(0, Number(d.reward ?? 0)),
    active: d.active !== false,
    ...(imageUrl ? { imageUrl } : {}),
  };
}

export function dedupeCategories(categories: string[]): string[] {
  return Array.from(new Set(categories.map((s) => String(s).trim()).filter(Boolean)));
}

// Display metadata per unlock metric. Money metrics render as currency,
// count metrics render as plain counts with a unit (5/7 days, 2/3 invites).
export function metricMeta(metric?: string): { unit: string; isMoney: boolean; source: string } {
  switch (String(metric || "operator_points")) {
    case "streak_days": return { unit: "days", isMoney: false, source: "Check-in streak" };
    case "runs_started": return { unit: "runs", isMoney: false, source: "Runs started" };
    case "active_runs": return { unit: "runs", isMoney: false, source: "Active runs" };
    case "completed_runs": return { unit: "runs", isMoney: false, source: "Runs finished" };
    case "invites_count": return { unit: "invites", isMoney: false, source: "Invites" };
    case "milestones_claimed": return { unit: "claimed", isMoney: false, source: "Milestones claimed" };
    case "account_created": return { unit: "", isMoney: false, source: "Account" };
    case "lifetime_yield": return { unit: "", isMoney: true, source: "Run earnings" };
    default: return { unit: "", isMoney: true, source: "Lifetime points" };
  }
}

// Stage (= tier) display metadata set by admin per tier: description + art.
// No hardcoded fallbacks — unset fields render as empty, never as defaults.
export interface TierMeta {
  description?: string;
  imageUrl?: string;
}

export function normalizeTierMeta(raw: unknown): Record<string, TierMeta> {
  const clean: Record<string, TierMeta> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return clean;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = String(key).trim();
    if (!name) continue;
    const v = (value ?? {}) as Record<string, unknown>;
    const description = String(v.description ?? "").trim().slice(0, 220);
    const imageUrl = String(v.imageUrl ?? "").trim();
    if (description || imageUrl) clean[name] = { ...(description ? { description } : {}), ...(imageUrl ? { imageUrl } : {}) };
  }
  return clean;
}

// Case-insensitive tier key match: admin tier names and task categories must
// resolve even when casing differs ("Rookie" vs "ROOKIE").
export function matchTierKey(keys: string[], name: string): string | null {
  const want = String(name || "").trim().toLowerCase();
  for (const key of keys) {
    if (String(key).trim().toLowerCase() === want) return key;
  }
  return null;
}

export function tierRewardFor(rewards: Record<string, number> | undefined, category: string): number {
  if (!rewards) return 0;
  const hit = matchTierKey(Object.keys(rewards), category);
  return hit ? Math.max(0, Number(rewards[hit]) || 0) : 0;
}

export function tierMetaFor(meta: Record<string, TierMeta> | undefined, category: string): TierMeta {
  if (!meta) return {};
  const hit = matchTierKey(Object.keys(meta), category);
  return hit ? meta[hit] : {};
}
