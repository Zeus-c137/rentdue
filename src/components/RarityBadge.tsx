/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared rarity banner chip (3D-ish gradient language).
 */

import React from "react";
import type { CollectibleRarity } from "../types";
import { RARITY_LABEL, normalizeRarity, rarityBadgeClass } from "../utils/rarity";

export default function RarityBadge({
  rarity,
  serial,
  className = "",
}: {
  rarity: CollectibleRarity | string;
  serial?: number;
  className?: string;
}) {
  const clean = normalizeRarity(rarity);
  const serialLabel = typeof serial === "number" && serial > 0 ? ` #${String(serial).padStart(3, "0")}` : "";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider shadow-md ${rarityBadgeClass(clean)} ${className}`}
    >
      {RARITY_LABEL[clean]}
      {serialLabel && <span className="opacity-70 normal-case tracking-normal">{serialLabel}</span>}
    </span>
  );
}
