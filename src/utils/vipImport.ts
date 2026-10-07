import { normalizeVipTask } from "./vip";
import type { VipTaskConfig } from "../types";

export interface VipImportTier {
  name: string;
  completionReward: number;
  taskReward: number;
  manualClaims: boolean;
  description: string;
  imageUrl: string;
}

export interface VipImportData {
  tiers: VipImportTier[];
  tasks: VipTaskConfig[];
}

type Row = Record<string, unknown>;

function keyOf(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function read(row: Row, names: string[]): unknown {
  const keys = new Set(names.map(keyOf));
  for (const [key, value] of Object.entries(row)) {
    if (keys.has(keyOf(key))) return value;
  }
  return undefined;
}

function asText(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function asAmount(value: unknown, label: string, rowNumber: number, errors: string[]) {
  if (value === undefined || value === null || String(value).trim() === "") return 0;
  const number = typeof value === "number" ? value : Number(String(value).replace(/[,_\s]/g, "").replace(/^(UGX|USD)/i, ""));
  if (!Number.isFinite(number) || number < 0) {
    errors.push(`${label} on row ${rowNumber} must be zero or a positive number.`);
    return 0;
  }
  return number;
}

function asFlag(value: unknown) {
  if (typeof value === "boolean") return value;
  return ["true", "yes", "1", "on", "manual"].includes(asText(value).toLowerCase());
}

function validUrl(value: unknown, label: string, rowNumber: number, errors: string[]) {
  const text = asText(value);
  if (text && !/^https?:\/\//i.test(text)) errors.push(`${label} on row ${rowNumber} must start with http:// or https://.`);
  return text.slice(0, 512);
}

export function parseVipImport(tierRows: Row[], taskRows: Row[]): VipImportData {
  const errors: string[] = [];
  if (!tierRows.length) errors.push("The Tiers sheet/list must contain at least one tier.");
  if (!taskRows.length) errors.push("The Tasks sheet/list must contain at least one task.");
  if (tierRows.length > 100) errors.push("Import is limited to 100 tiers at a time.");
  if (taskRows.length > 1000) errors.push("Import is limited to 1,000 tasks at a time.");

  const tiers = tierRows.slice(0, 100).map((row, index) => {
    const rowNumber = index + 2;
    const name = asText(read(row, ["Tier name", "Name", "Tier", "Category"]));
    if (!name) errors.push(`Tier row ${rowNumber} is missing a tier name.`);
    return {
      name: name.slice(0, 64),
      completionReward: asAmount(read(row, ["Completion bonus", "Completion reward", "Tier reward", "Reward"]), "Completion bonus", rowNumber, errors),
      taskReward: asAmount(read(row, ["Per-task reward", "Task reward", "Per task"]), "Per-task reward", rowNumber, errors),
      manualClaims: asFlag(read(row, ["Social verification", "Social tasks", "Manual task claims", "Manual claims", "Manual submissions", "Manual"])),
      description: asText(read(row, ["Tier description", "Description"])).slice(0, 220),
      imageUrl: validUrl(read(row, ["Tier image URL", "Image URL", "Image"]), "Tier image URL", rowNumber, errors),
    };
  });

  const tiersByName = new Map<string, VipImportTier>();
  for (const tier of tiers) {
    const key = tier.name.toLowerCase();
    if (key && tiersByName.has(key)) errors.push(`Tier name "${tier.name}" appears more than once.`);
    if (key) tiersByName.set(key, tier);
    if (tier.manualClaims && tier.taskReward <= 0) errors.push(`Social verification tier "${tier.name}" needs a per-task reward greater than zero.`);
  }

  const seenTaskKeys = new Set<string>();
  const seenTaskIds = new Set<string>();
  const tasks = taskRows.slice(0, 1000).map((row, index) => {
    const rowNumber = index + 2;
    const title = asText(read(row, ["Task title", "Title", "Task", "Name"]));
    const rawCategory = asText(read(row, ["Tier", "Tier name", "Category", "Milestone tier"]));
    if (!title) errors.push(`Task row ${rowNumber} is missing a title.`);
    if (!rawCategory) errors.push(`Task row ${rowNumber} is missing a tier.`);
    const tier = tiersByName.get(rawCategory.toLowerCase());
    if (rawCategory && !tier) errors.push(`Task row ${rowNumber} references unknown tier "${rawCategory}".`);
    const id = asText(read(row, ["Task ID", "ID"])).slice(0, 64);
    if (id && seenTaskIds.has(id)) errors.push(`Task ID "${id}" appears more than once.`);
    if (id) seenTaskIds.add(id);
    const duplicateKey = `${rawCategory.toLowerCase()}::${title.toLowerCase()}`;
    if (title && rawCategory && seenTaskKeys.has(duplicateKey)) errors.push(`Task "${title}" appears more than once in tier "${rawCategory}".`);
    if (title && rawCategory) seenTaskKeys.add(duplicateKey);

    const socialType = asText(read(row, ["Social task", "Social type", "Social action"]));
    const validSocialTypes = ["facebook_follow", "facebook_like", "facebook_comment", "facebook_share", "telegram_join", "whatsapp_join"];
    if (socialType && !validSocialTypes.includes(socialType)) errors.push(`Social task on row ${rowNumber} has an unsupported type.`);
    if (socialType && !tier?.manualClaims) errors.push(`Social task on row ${rowNumber} must belong to a tier with social verification enabled.`);
    const social = Boolean(socialType);
    const metric = social ? "manual_claim" : (asText(read(row, ["Metric", "Unlock metric", "Unlocks from"])) || "operator_points");
    const supportedMetrics = ["operator_points", "runs_started", "active_runs", "completed_runs", "collectibles_claimed", "streak_days", "lifetime_yield", "invites_count", "milestones_claimed", "account_created"];
    if (!social && !supportedMetrics.includes(metric)) errors.push(`Task metric on row ${rowNumber} is not supported.`);
    const requiredValue = read(row, ["Requirement", "Required bonus", "Required", "Threshold"]);
    const requiredBonus = social || metric === "account_created" ? 1 : asAmount(requiredValue, "Requirement", rowNumber, errors);
    if (!social && metric !== "account_created" && requiredBonus <= 0) errors.push(`Task requirement on row ${rowNumber} must be greater than zero.`);
    const activeRaw = read(row, ["Active", "Enabled", "Status"]);
    const active = activeRaw === undefined || asText(activeRaw) === "" ? true : asFlag(activeRaw);
    const actionUrl = validUrl(read(row, ["Task link", "Action URL", "URL", "Link"]), "Task link", rowNumber, errors);
    const imageUrl = validUrl(read(row, ["Task image URL", "Image URL", "Image"]), "Task image URL", rowNumber, errors);
    const task = normalizeVipTask({
      id: id || `vip_import_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      category: tier?.name || rawCategory,
      description: asText(read(row, ["Task description", "Description"])).slice(0, 500),
      metric,
      requiredBonus,
      reward: 0,
      actionUrl,
      imageUrl,
      socialType,
      active,
    });
    return task;
  });

  if (errors.length) throw new Error(errors.slice(0, 12).join("\n") + (errors.length > 12 ? `\nAnd ${errors.length - 12} more issue(s).` : ""));
  return { tiers, tasks };
}
