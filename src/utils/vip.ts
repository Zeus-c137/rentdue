import type { VipTaskConfig, VipTask, VipTaskboard } from "../types";

export function calcVipProgress(accumulatedBonus: number, requiredBonus: number): number {
  return Math.min((accumulatedBonus / Math.max(requiredBonus, 1)) * 100, 100);
}

export function getNextVipRequirement(tasks: Pick<VipTask, "requiredBonus" | "unlocked" | "claimed">[], accumulatedBonus: number): number {
  return tasks.find((task) => !task.unlocked && !task.claimed)?.requiredBonus || accumulatedBonus || 1;
}

/** Keep admin-entered social links usable even when pasted without a scheme. */
export function normalizeVipActionUrl(value: unknown): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withScheme);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) return undefined;
    return withScheme.slice(0, 512);
  } catch {
    return undefined;
  }
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
  const ttrRaw = (raw.tierTaskRewards ?? {}) as Record<string, unknown>;
  const cleanTierTaskRewards: Record<string, number> = {};
  if (ttrRaw && typeof ttrRaw === "object" && !Array.isArray(ttrRaw)) {
    for (const [key, value] of Object.entries(ttrRaw)) {
      const name = String(key).trim();
      if (name) cleanTierTaskRewards[name] = Math.max(0, Number(value) || 0);
    }
  }
  const manualClaimCategories = Array.isArray(raw.manualClaimCategories)
    ? raw.manualClaimCategories.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  return {
    tasks: Array.isArray(raw.tasks) ? (raw.tasks as VipTask[]).map((task) => {
      const actionUrl = normalizeVipActionUrl(task.actionUrl);
      return { ...task, actionUrl };
    }) : [],
    vipLevel: Number((raw.vipLevel as number) || 0),
    stageOrder: Array.isArray(raw.stageOrder) ? (raw.stageOrder as unknown[]).map((e) => String(e)) : [],
    tierRewards: cleanTierRewards,
    tierTaskRewards: cleanTierTaskRewards,
    manualClaimCategories,
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
  const actionUrl = normalizeVipActionUrl(d.actionUrl);
  const socialType = ["facebook_follow", "facebook_like", "facebook_comment", "facebook_share", "telegram_join", "whatsapp_join"].includes(String(d.socialType || ""))
    ? String(d.socialType) as VipTaskConfig["socialType"]
    : undefined;
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
    ...(actionUrl ? { actionUrl } : {}),
    ...(socialType ? { socialType } : {}),
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
    case "collectibles_claimed": return { unit: "collectibles", isMoney: false, source: "Collectibles claimed" };
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

// Tier order mirrored from VipTasksPage's stages memo: order of first
// appearance in the task list. The journey list is the visible truth (it
// renders "{done}/{total} COMPLETE" per stage), so the header must resolve
// the current tier and the next name in that same order.
export function tierOrder(board: VipTaskboard | null | undefined): string[] {
  if (!board) return [];
  const order: string[] = [];
  for (const task of board.tasks || []) {
    const name = String(task.category || "").trim() || "Milestone";
    if (!order.includes(name)) order.push(name);
  }
  return order;
}

export interface TierProgress {
  name: string;
  metric: string;
  art: string;
  description: string;
  done: number;
  total: number;
  /** Milestones in the tier still to clear. Counted in milestones, never in
   *  summed units — days, UGX and runs are incomparable. */
  left: number;
  pct: number;
  /** Empty once the top tier is reached. */
  nextName: string;
  tierReward: number;
  readyToClaim: boolean;
  complete: boolean;
}

/** A task is complete exactly when its progress meets its requirement — the
 *  same rule VipTasksPage uses for its per-task DONE check and per-stage
 *  done/total counts. Both surfaces share this so the header ring and the
 *  journey list can never disagree. */
export function isTaskMet(task: Pick<VipTask, "progress" | "requiredBonus">): boolean {
  return Number(task.progress || 0) >= Number(task.requiredBonus || 0);
}

/** Where the operator stands: the first unclaimed tier in journey order,
 *  scored by milestones cleared inside it. Falls back to the top tier once
 *  every reward is claimed so the header always has something true to show. */
export function currentTierProgress(board: VipTaskboard | null | undefined): TierProgress | null {
  if (!board) return null;
  const order = tierOrder(board);
  if (order.length === 0) return null;
  const claimed = board.claimedTierRewards || [];
  const openIdx = order.findIndex((name) => !claimed.includes(name));
  const idx = openIdx === -1 ? order.length - 1 : openIdx;
  const name = order[idx];
  if (!name) return null;

  const tasks = (board.tasks || []).filter((task) => String(task.category || "Milestone") === name);
  const total = tasks.length;
  const done = tasks.filter(isTaskMet).length;
  const left = Math.max(0, total - done);
  const complete = total > 0 && left === 0;
  const meta = tierMetaFor(board.tierMeta, name);
  const tierReward = tierRewardFor(board.tierRewards, name);

  return {
    name,
    metric: String(tasks[0]?.metric || "operator_points"),
    art: meta.imageUrl || "",
    description: meta.description || "",
    done,
    total,
    left,
    pct: total > 0 ? (done / total) * 100 : 0,
    nextName: openIdx === -1 ? "" : order[idx + 1] || "",
    tierReward,
    readyToClaim: complete && openIdx !== -1 && tierReward > 0,
    complete,
  };
}

// Initials for the avatar: first letter of the first two name parts, so
// "DELL K" reads DK. Falls back to the last two phone digits when no
// username was ever set.
export function initialsFor(username?: string | null, phone?: string | null): string {
  const parts = String(username || "").trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length > 0) {
    const letters = parts
      .slice(0, 2)
      .map((part) => Array.from(part)[0] || "")
      .join("")
      .toUpperCase()
      .slice(0, 2);
    if (letters) return letters;
  }
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length >= 2) return digits.slice(-2);
  return "?";
}
