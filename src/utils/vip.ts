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
  return {
    tasks: Array.isArray(raw.tasks) ? (raw.tasks as VipTask[]) : [],
    vipLevel: Number((raw.vipLevel as number) || 0),
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
