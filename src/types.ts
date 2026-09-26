/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TransactionType } from "./utils/transactionMeta";

// hut12 minimal — old presets purged 2026-09-15
export type ThemePreset = "hut12-light" | "hut12-dark";
export type ThemeMode = "light" | "dark" | "system";
export type CardStyle = "solid" | "glass";
export type ButtonStyle = "pill-gradient";
export type BorderRadiusStyle = "rounded-2xl";

export interface SiteConfig {
  adminPhone?: string;
  adminPass?: string;
  adminUsername?: string;
  whatsappLink?: string;
  telegramLink?: string;
  brandName?: string;
  logoType?: string;
  logoUrl?: string;
  logoSvg?: string;
  manifestShortName?: string;
  manifestDescription?: string;
  manifestThemeColor?: string;
  manifestBgColor?: string;
  allowAutoDeposit?: boolean;
  allowManualDeposit?: boolean;
  mtnReceiverPhone?: string;
  mtnReceiverName?: string;
  airtelReceiverPhone?: string;
  airtelReceiverName?: string;
  usdtAddress?: string;
  usdtNetwork?: string;
  usdtLogoUrl?: string;
  mtnLogoUrl?: string;
  airtelLogoUrl?: string;
  allowAutoWithdraw?: boolean;
  allowManualWithdraw?: boolean;
  registrationBonus?: number;
  inviteBonus?: number;
  level1InviteIncomePct?: number;
  level2InviteIncomePct?: number;
  level3InviteIncomePct?: number;
  level4InviteIncomePct?: number;
  vipTasks?: VipTaskConfig[];
  vipTaskCategories?: string[];
  checkinBaseBonus?: number;
  checkinIncrement?: number;
  exchangeRateUSD?: number;
  hasBeenActivatedSeeded?: boolean;
  minimumDeposit?: number;
  maximumDeposit?: number;
  minimumWithdrawal?: number;
  maximumWithdrawal?: number;
  withdrawalFeePercent?: number;
  telegramSupport?: string;
  whatsappSupport?: string;
  noticeBanner?: string;
  paymentGateways?: any;
  categories?: any;
  withdrawFee?: number;
  depositMode?: "automatic" | "manual";
  welcomeBonus?: number;
  usdtQrUrl?: string;
  usdtRate?: number;
  // Theme & Layout Customizations
  themePreset?: ThemePreset;
  themeMode?: ThemeMode;
  authBgImage?: string;
  dashboardBgImage?: string;
  cardStyle?: CardStyle;
  buttonStyle?: ButtonStyle;
  borderRadius?: BorderRadiusStyle;
  primaryColor?: string;
  accentColor?: string;
  secondaryColor?: string;
  bgColor?: string;
  cardBgColor?: string;
  fontFamily?: string;
  fontSizeScale?: "sm" | "md" | "lg" | "xl";
  textColor?: string;
}

export interface VipTaskConfig {
  id: string;
  title: string;
  description?: string;
  category: string;
  metric?: string;
  requiredBonus: number;
  reward: number;
  active?: boolean;
  imageUrl?: string;
}

export interface VipTask {
  id: string;
  title: string;
  description?: string;
  category: string;
  metric?: string;
  requiredBonus: number;
  reward: number;
  progress: number;
  unlocked: boolean;
  claimed: boolean;
  imageUrl?: string;
}

export interface VipTaskboard {
  tasks: VipTask[];
  vipLevel?: number;
  referralRates?: {
    level1: number;
    level2: number;
    level3: number;
    level4: number;
  };
  progress: {
    level1Bonus: number;
    level2Bonus: number;
    level3Bonus: number;
    level4Bonus: number;
    accumulatedBonus: number;
    totalReferralBonus: number;
    operatorPoints: number;
  };
}

export interface UserProfile {
  phone: string;
  username: string;
  password?: string;
  inviteCode: string;
  referredByCode?: string;
  operator?: string;
  points: number; // withdrawable balance in UGX (daily income, reg bonus, checkins, gift codes, rewards)
  rechargeBalance?: number; // account recharge balance in UGX (from deposits, used for buying products)
  withdrawnCash: number; // accumulated withdraw amount in UGX
  createdAt: string;
  // Referral stats
  invitesCount: number;
  referralRewardsEarned: number;
  totalDeposits?: number; // total deposits in UGX
  aiIncome?: number; // total passive yield claims built up
  claimedVipTasks?: string[]; // VIP tasks already claimed (e.g. ["vip-1"])
  locked?: boolean; // account locked status
  usdtAddress?: string;
  lastCheckinDate?: string;
  checkinStreak?: number;
  redeemedGiftCodes?: string[];
}

export interface NotificationItem {
  id: string;
  userId: string;
  category: "register" | "deposit" | "withdraw" | "system" | "rewards" | "daily accumulation" | "announcement" | "news" | string;
  title: string;
  message: string;
  amount?: number;
  timestamp: string;
  metadata?: any;
}

export interface SubscriptionItem {
  id: string;
  name: string;
  image: string; // Tailwind gradient / visual key
  amount: number; // points price
  duration: number; // in days
  dailyYield: number; // points yielded daily
  category: string; // "DS" | "D" | "G" | "E" | "F", etc.
  inviteBonusPercent: number; // custom invite bonus percentage for referrals
  imageUrl?: string; // Open-source graphic or illustration URL
  outOfStock?: boolean; // mark if node is out of stock
  disabled?: boolean; // hidden or disabled node
}

export interface SubscribedNode {
  id: string;
  userId: string;
  itemId: string;
  itemName: string;
  image: string;
  amount: number;
  duration: number;
  dailyYield: number;
  startDate: string; // ISO String
  endDate: string; // ISO String
  lastClaimedDate: string; // ISO Date YYYY-MM-DD
  totalEarned: number;
  status: "active" | "completed" | "expired";
}

export type { TransactionType } from "./utils/transactionMeta";

export interface TransactionRow {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  status: string;
  paymentMethod?: string;
  phone?: string;
  usdtAddress?: string;
  itemId?: string;
  operator?: string;
  mode?: string;
  metadata?: {
    level?: number;
    sourceItemId?: string;
    sourceItemName?: string;
    platformDate?: string;
    subscriptionId?: string;
    feeAmount?: number;
    payoutAmount?: number;
    feePercent?: number;
    requestedAmount?: number;
    externalReference?: string;
  } & Record<string, any>;
  balanceAppliedAt?: string;
  timestamp: string;
}

export interface ReferralStat {
  phone?: string;
  username?: string;
  totalDeposits?: number;
  rewardEarned?: number;
  joinedDate?: string;
  inviteePhone?: string;
  inviteeName?: string;
  itemCategory?: string;
  rewardAmount?: number;
  dateJoined?: string;
  level?: number;
  balance?: number;
  activeProductsCount?: number;
}

export interface ChatMessage {
  id: string;
  roomId: string; // "shared" or "direct_<userPhone>"
  sender: string; // userPhone or "admin" or "system"
  senderName: string;
  text: string;
  image?: string; // base64 or illustration URL
  timestamp: string; // ISO string
}

export interface SystemStats {
  totalUsers: number;
  totalSubscribedPoints: number;
  activeNodesCount: number;
  totalSharedMessages: number;
}

export interface GiftCode {
  id: string; // The unique code itself
  code: string;
  amount: number;
  maxRedemptions: number;
  currentRedemptions: number;
  expiryDate: string; // ISO String
  status: "active" | "expired" | "depleted";
  createdAt: string;
}
