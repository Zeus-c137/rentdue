/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Rank-within-category rarity (prototype v1, confirmed).
 * Items are ranked inside their own category by `amount` (descending, stable
 * by id). Only the top of a category earns rare banners, so a 30-item
 * category never reads "PREMIUM" thirty times:
 *
 *   rank 0      -> legendary (categories with >= 5 items, else rare)
 *   rank 1–2    -> epic
 *   rank 3–6    -> rare
 *   rank 7–11   -> popular
 *   rest        -> common
 *
 * Tiny categories (< 3 items): rank 0 -> popular, rest common.
 */

import type { CollectibleRarity, SubscriptionItem } from "../types";

export const RARITY_ORDER: CollectibleRarity[] = ["common", "popular", "rare", "epic", "legendary"];

export const RARITY_LABEL: Record<CollectibleRarity, string> = {
  common: "COMMON",
  popular: "POPULAR",
  rare: "RARE",
  epic: "EPIC",
  legendary: "LEGENDARY",
};

export function normalizeRarity(value: unknown): CollectibleRarity {
  const v = String(value || "").toLowerCase().trim();
  return (RARITY_ORDER as string[]).includes(v) ? (v as CollectibleRarity) : "common";
}

/** Rank (0 = priciest) of `item` among `peers` sharing its category. */
export function rankWithinCategory(item: Pick<SubscriptionItem, "id" | "category" | "amount">, peers: Pick<SubscriptionItem, "id" | "category" | "amount">[]): number {
  const same = peers.filter((p) => String(p.category || "") === String(item.category || ""));
  const sorted = [...same].sort((a, b) => {
    const diff = Number(b.amount || 0) - Number(a.amount || 0);
    if (diff !== 0) return diff;
    return String(a.id).localeCompare(String(b.id));
  });
  const rank = sorted.findIndex((p) => String(p.id) === String(item.id));
  return rank < 0 ? sorted.length : rank;
}

export function rarityForRank(rank: number, categorySize: number): CollectibleRarity {
  if (categorySize < 3) return rank === 0 ? "popular" : "common";
  if (rank === 0) return categorySize >= 5 ? "legendary" : "rare";
  if (rank <= 2) return "epic";
  if (rank <= 6) return "rare";
  if (rank <= 11) return "popular";
  return "common";
}

/** Rarity of a catalog item given the full catalog list. */
export function rarityForItem(
  item: Pick<SubscriptionItem, "id" | "category" | "amount">,
  allItems: Pick<SubscriptionItem, "id" | "category" | "amount">[]
): CollectibleRarity {
  const same = allItems.filter((p) => String(p.category || "") === String(item.category || ""));
  return rarityForRank(rankWithinCategory(item, allItems), same.length);
}

/** Map of itemId -> rarity for a whole catalog (one pass, used by cards). */
export function rarityMapForCatalog(
  allItems: Pick<SubscriptionItem, "id" | "category" | "amount">[]
): Record<string, CollectibleRarity> {
  const map: Record<string, CollectibleRarity> = {};
  for (const item of allItems) {
    map[String(item.id)] = rarityForItem(item, allItems);
  }
  return map;
}

/** Badge colors per rarity — 3D-ish gradient banner language. */
export function rarityBadgeClass(rarity: CollectibleRarity): string {
  switch (rarity) {
    case "legendary":
      return "bg-gradient-to-r from-amber-300 via-yellow-500 to-amber-300 text-black";
    case "epic":
      return "bg-gradient-to-r from-fuchsia-500 via-purple-500 to-fuchsia-500 text-white";
    case "rare":
      return "bg-gradient-to-r from-sky-400 via-cyan-400 to-sky-400 text-black";
    case "popular":
      return "bg-gradient-to-r from-lime-400 via-[var(--theme-primary)] to-lime-400 text-black";
    default:
      return "bg-white/10 text-[var(--theme-text)] border border-white/20";
  }
}

/** Short marketing tagline per catalog item (mock: "Short cycle. Solid start."). */
export function taglineForItem(item: Pick<SubscriptionItem, "duration" | "dailyYield">): string {
  const days = Number(item.duration || 0);
  const daily = Number(item.dailyYield || 0);
  if (days > 0 && days <= 21) return "Short cycle. Solid start.";
  if (days > 21 && days <= 35) return "Build your momentum.";
  if (days > 35) return "More time. More returns.";
  return daily > 0 ? "Steady daily returns." : "Put your money in motion.";
}
