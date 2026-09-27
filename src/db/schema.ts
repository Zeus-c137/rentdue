import {
  mysqlTable,
  varchar,
  text,
  int,
  double,
  boolean,
  timestamp,
  json,
  index,
  primaryKey
} from "drizzle-orm/mysql-core";

/**
 * 1:1 Drizzle ORM Schema Migration Specification
 * Designed for MySQL / MariaDB backend with high-concurrency 30k+ user scale in mind.
 */

// 1. Users Table
export const users = mysqlTable(
  "users",
  {
    phone: varchar("phone", { length: 32 }).primaryKey(),
    username: varchar("username", { length: 64 }).notNull(),
    password: varchar("password", { length: 255 }).notNull(),
    inviteCode: varchar("invite_code", { length: 32 }).notNull().unique(),
    referredByCode: varchar("referred_by_code", { length: 32 }).default(""),
    operator: varchar("operator", { length: 16 }).default("MTN"),
    points: double("points").default(0).notNull(), // Withdrawable balance (UGX)
    rechargeBalance: double("recharge_balance").default(0).notNull(), // Account deposit balance (UGX)
    withdrawnCash: double("withdrawn_cash").default(0).notNull(),
    totalDeposits: double("total_deposits").default(0).notNull(),
    aiIncome: double("ai_income").default(0).notNull(),
    invitesCount: int("invites_count").default(0).notNull(),
    referralRewardsEarned: double("referral_rewards_earned").default(0).notNull(),
    claimedVipTasks: json("claimed_vip_tasks").$type<string[]>().default([]),
    claimedTierRewards: json("claimed_tier_rewards").$type<string[]>().default([]),
    locked: boolean("locked").default(false).notNull(),
    usdtAddress: varchar("usdt_address", { length: 255 }).default(""),
    lastCheckinDate: varchar("last_checkin_date", { length: 32 }).default(""),
    checkinStreak: int("checkin_streak").default(0).notNull(),
    redeemedGiftCodes: json("redeemed_gift_codes").$type<string[]>().default([]),
    createdAt: varchar("created_at", { length: 64 }).notNull()
  },
  (table) => ({
    inviteCodeIdx: index("idx_users_invite_code").on(table.inviteCode),
    referredByIdx: index("idx_users_referred_by").on(table.referredByCode)
  })
);

// 2. Subscribed Rented Products / Active Nodes
export const subscribedNodes = mysqlTable(
  "subscribed_nodes",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 32 }).notNull(),
    itemId: varchar("item_id", { length: 64 }).notNull(),
    itemName: varchar("item_name", { length: 128 }).notNull(),
    image: varchar("image", { length: 255 }).notNull(),
    amount: double("amount").notNull(),
    duration: int("duration").notNull(),
    dailyYield: double("daily_yield").notNull(),
    startDate: varchar("start_date", { length: 64 }).notNull(),
    endDate: varchar("end_date", { length: 64 }).notNull(),
    lastClaimedDate: varchar("last_claimed_date", { length: 32 }).notNull(),
    totalEarned: double("total_earned").default(0).notNull(),
    status: varchar("status", { length: 16 }).default("active").notNull() // "active" | "completed" | "expired"
  },
  (table) => ({
    userIdIdx: index("idx_subscribed_nodes_user_id").on(table.userId),
    statusIdx: index("idx_subscribed_nodes_status").on(table.status)
  })
);

// 3. Catalog Products Table
export const catalogProducts = mysqlTable(
  "catalog_products",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    image: varchar("image", { length: 255 }).notNull(),
    imageUrl: varchar("image_url", { length: 512 }).default(""),
    amount: double("amount").notNull(),
    duration: int("duration").notNull(),
    dailyYield: double("daily_yield").notNull(),
    category: varchar("category", { length: 32 }).default("DS").notNull(),
    inviteBonusPercent: double("invite_bonus_percent").default(0).notNull(),
    outOfStock: boolean("out_of_stock").default(false).notNull(),
    disabled: boolean("disabled").default(false).notNull()
  }
);

// 4. Notifications Table
export const notifications = mysqlTable(
  "notifications",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 32 }).notNull(),
    category: varchar("category", { length: 32 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message").notNull(),
    amount: double("amount").default(0),
    timestamp: varchar("timestamp", { length: 64 }).notNull()
  },
  (table) => ({
    userNotifIdx: index("idx_notifications_user_id").on(table.userId)
  })
);

// 5. Chat Messages Table
export const chatMessages = mysqlTable(
  "chat_messages",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    roomId: varchar("room_id", { length: 64 }).notNull(),
    sender: varchar("sender", { length: 64 }).notNull(),
    senderName: varchar("sender_name", { length: 64 }).notNull(),
    text: text("text").notNull(),
    image: text("image"),
    timestamp: varchar("timestamp", { length: 64 }).notNull()
  },
  (table) => ({
    roomIdx: index("idx_chat_messages_room_id").on(table.roomId)
  })
);

// 6. Gift Codes Table
export const giftCodes = mysqlTable(
  "gift_codes",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    code: varchar("code", { length: 64 }).notNull().unique(),
    amount: double("amount").notNull(),
    maxRedemptions: int("max_redemptions").default(1).notNull(),
    currentRedemptions: int("current_redemptions").default(0).notNull(),
    expiryDate: varchar("expiry_date", { length: 64 }).notNull(),
    status: varchar("status", { length: 16 }).default("active").notNull(),
    createdAt: varchar("created_at", { length: 64 }).notNull()
  },
  (table) => ({
    codeIdx: index("idx_gift_codes_code").on(table.code)
  })
);

// 7. Site Configuration Table
export const siteConfig = mysqlTable(
  "site_config",
  {
    id: varchar("id", { length: 32 }).primaryKey().default("main"),
    configJson: json("config_json").notNull()
  }
);

// 8. Transactions Table
export const transactions = mysqlTable(
  "transactions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 32 }).notNull(),
    type: varchar("type", { length: 32 }).notNull(), // 'deposit'|'withdrawal'|'registration_bonus'|'daily_checkin_bonus'|'gift_code'|'referral_signup_bonus'|'referral_level_income'|'vip_task'|'product_activation'|'daily_yield'
    amount: double("amount").notNull(),
    currency: varchar("currency", { length: 8 }).default("UGX").notNull(),
    status: varchar("status", { length: 32 }).default("pending").notNull(), // 'pending' | 'completed' | 'failed'
    paymentMethod: varchar("payment_method", { length: 64 }),
    phone: varchar("phone", { length: 32 }),
    usdtAddress: varchar("usdt_address", { length: 255 }),
    itemId: varchar("item_id", { length: 64 }),
    operator: varchar("operator", { length: 16 }),
    mode: varchar("mode", { length: 16 }),
    metadata: json("metadata"),
    // Set exactly once when a successful deposit has been applied to the user
    // balance. This makes webhook/status retries idempotent.
    balanceAppliedAt: varchar("balance_applied_at", { length: 64 }),
    timestamp: varchar("timestamp", { length: 64 }).notNull()
  },
  (table) => ({
    userTxIdx: index("idx_transactions_user_id").on(table.userId),
    statusIdx: index("idx_transactions_status").on(table.status)
  })
);

// Backward-compatible names used by older server code. Both point to the same
// physical tables; there is no second database model to migrate.
export const subscriptions = subscribedNodes;
export const catalogItems = catalogProducts;

export const announcements = mysqlTable("announcements", {
  id: varchar("id", { length: 64 }).primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  readMoreLink: varchar("read_more_link", { length: 512 }),
  category: varchar("category", { length: 32 }),
  imageUrl: varchar("image_url", { length: 512 }),
  tag: varchar("tag", { length: 64 }),
  createdAt: varchar("created_at", { length: 64 }).notNull()
});
