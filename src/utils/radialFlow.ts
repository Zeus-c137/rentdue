import { canonicalTypeOf, getWithdrawalDisplayAmounts, isSuccessfulStatus } from "./transactionMeta";

export interface RadialSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface Group {
  key: string;
  label: string;
  color: string;
  canon: string[];
}

/**
 * The groups the money-flow chart reports. The ledger has no separate "base"
 * bonus row — check-in base/increment are one `daily_checkin_bonus` amount — so
 * invite signups and referral level income stay distinct instead.
 * Edit this table to re-group the chart; nothing else needs to change.
 */
export const RADIAL_GROUPS: Group[] = [
  { key: "deposits", label: "Deposits", color: "#A3E635", canon: ["deposit"] },
  { key: "withdrawals", label: "Withdrawals", color: "#FB7185", canon: ["withdrawal"] },
  { key: "earnings", label: "Trade income", color: "#60A5FA", canon: ["daily_yield"] },
  { key: "registration", label: "Registration", color: "#FDE047", canon: ["registration_bonus"] },
  { key: "checkin", label: "Daily check-in", color: "#C084FC", canon: ["daily_checkin_bonus"] },
  { key: "invite", label: "Invite bonus", color: "#34D399", canon: ["referral_signup_bonus"] },
  { key: "referral", label: "Referral income", color: "#22D3EE", canon: ["referral_level_income"] },
  { key: "milestones", label: "Milestones", color: "#F59E0B", canon: ["vip_task"] },
  { key: "gift", label: "Gift code", color: "#F472B6", canon: ["gift_code"] },
];

/** Sum successful ledger rows into the chart's slices. Zero slices are dropped. */
export function buildRadialSlices(transactions: any[]): RadialSlice[] {
  if (!Array.isArray(transactions)) return [];
  const sums = new Map<string, number>();

  for (const tx of transactions) {
    if (!tx) continue;
    const status = String(tx.status || "");
    if (status && !isSuccessfulStatus(status)) continue;
    const canon = canonicalTypeOf(String(tx.type || ""), tx.metadata) as string;
    const group = RADIAL_GROUPS.find((g) => g.canon.includes(canon));
    if (!group) continue;
    const raw = canon === "withdrawal"
      ? getWithdrawalDisplayAmounts(tx).payout
      : Number(tx.amount) || 0;
    if (!Number.isFinite(raw) || raw <= 0) continue;
    sums.set(group.key, (sums.get(group.key) || 0) + raw);
  }

  return RADIAL_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    color: group.color,
    value: sums.get(group.key) || 0,
  }));
}

/** History tab id → the chart groups it covers. Empty means "show everything". */
export const FILTER_TO_RADIAL_KEYS: Record<string, string[]> = {
  all: [],
  deposit: ["deposits"],
  withdraw: ["withdrawals"],
  yield: ["earnings"],
  referral: ["invite", "referral"],
  checkin: ["checkin"],
  voucher: ["gift"],
  vip_task: ["milestones"],
  registration_bonus: ["registration"],
  referral_bonus: ["invite"],
  referral_level: ["referral"],
  product: [],
};
