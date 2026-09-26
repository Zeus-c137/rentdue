import crypto from "crypto";
import path from "path";
import { ensureDatabaseSchema, getDb, schema } from "../db/index";
import { and, eq, desc, asc, isNull, inArray, sql } from "drizzle-orm";
import { UserProfile, SubscriptionItem, SubscribedNode, ChatMessage, ReferralStat, NotificationItem, SiteConfig } from "../types";
import { sanitizeSiteConfig } from "../utils/themeTokens";
import { canonicalTypeOf } from "../utils/transactionMeta";
import { dedupeCategories, normalizeVipTask } from "../utils/vip";


export class DatabaseOperationError extends Error {
  readonly statusCode = 503;
  readonly operation: string;
  readonly cause: unknown;

  constructor(operation: string, cause?: unknown) {
    super(`We couldn't ${operation} because the account database is temporarily unavailable. Please try again shortly.`);
    this.name = "DatabaseOperationError";
    this.operation = operation;
    this.cause = cause;
  }
}

class DepositSettlementError extends Error {
  readonly statusCode = 409;
}

class SiteConfigValidationError extends Error {
  readonly statusCode = 400;
}

function rootCause(error: unknown): any {
  // Drizzle wraps the driver error (mysql2 message/code live on `cause`).
  // Walk the chain so logs show the real failure, not the wrapper.
  let current = error as any;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if (current.code || current.errno) return current;
    current = current.cause;
  }
  return error as any;
}

function databaseFailure(operation: string, error: unknown): DatabaseOperationError {
  const details = rootCause(error);
  console.error(`[Database] ${operation} failed`, {
    code: details?.code,
    errno: details?.errno,
    sqlState: details?.sqlState,
    message: details?.message || String(error)
  });
  return new DatabaseOperationError(operation, error);
}

// MariaDB reports JSON columns as LONGTEXT, so the mysql2 driver hands back
// raw strings where MySQL 8 would yield parsed values. Normalize at the read
// boundary so the rest of the code can rely on objects/arrays on both.
function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value as T;
  const text = value.trim();
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function readJsonRecord(value: unknown): Record<string, any> {
  const parsed = parseJsonField<Record<string, any>>(value, {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function readJsonStringArray(value: unknown): string[] {
  const parsed = parseJsonField<string[]>(value, []);
  return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [];
}

function requireDatabase(operation: string) {
  const drizzleDb = getDb();
  if (!drizzleDb) throw databaseFailure(operation, new Error("DATABASE_URL or MYSQL_URL is not configured"));
  return drizzleDb;
}

const SCRYPT_KEY_LEN = 64;
const SCRYPT_MAXMEM = 32 * 1024 * 1024;

export function isPasswordHashed(stored: string): boolean {
  return typeof stored === "string" && stored.startsWith("scrypt$");
}

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(plain, salt, SCRYPT_KEY_LEN, { N: 16384, r: 8, p: 1, maxmem: SCRYPT_MAXMEM });
  return `scrypt$16384$8$1$${salt.toString("hex")}:${key.toString("hex")}`;
}

export function verifyPassword(stored: string, supplied: string): { ok: boolean; needsRehash: boolean } {
  if (!stored || typeof supplied !== "string" || supplied.length === 0) return { ok: false, needsRehash: false };
  if (!isPasswordHashed(stored)) {
    const a = Buffer.from(stored, "utf8");
    const b = Buffer.from(supplied, "utf8");
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    return { ok, needsRehash: ok };
  }
  const parts = stored.split("$");
  if (parts.length !== 5) return { ok: false, needsRehash: false };
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const [saltHex, keyHex] = (parts[4] || "").split(":");
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || !saltHex || !keyHex) {
    return { ok: false, needsRehash: false };
  }
  try {
    const key = Buffer.from(keyHex, "hex");
    const derived = crypto.scryptSync(supplied, Buffer.from(saltHex, "hex"), key.length, { N, r, p, maxmem: SCRYPT_MAXMEM });
    const ok = derived.length === key.length && crypto.timingSafeEqual(derived, key);
    return { ok, needsRehash: false };
  } catch {
    return { ok: false, needsRehash: false };
  }
}

export function publicProfile<T extends { password?: unknown }>(profile: T | null | undefined): Omit<T, "password"> | null {
  if (!profile) return null;
  const { password: _dropped, ...rest } = profile;
  return rest;
}

const NUMERIC_INVITE_CODE_PATTERN = /^\d{5}$/;
const PLATFORM_TIME_ZONE = "Africa/Nairobi";

export function getPlatformDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PLATFORM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export type TransactionIdPrefix = "DEP" | "WDR" | "RNT";

// Human-readable internal IDs shared by deposits, withdrawals, and rentals.
// The date uses the platform timezone; the random suffix keeps IDs unique
// without exposing user/account data.
export function createTransactionId(prefix: TransactionIdPrefix, date = new Date()): string {
  const dateKey = getPlatformDateKey(date).replace(/-/g, "");
  const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${dateKey}-${suffix}`;
}

function addPlatformDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

const dailyYieldCatchupDates = new Map<string, string>();
const dailyYieldCatchupInFlight = new Map<string, Promise<number>>();

export async function ensureUserDailyYields(phone: string): Promise<number> {
  const normalizedPhone = String(phone || "").trim();
  if (!normalizedPhone) return 0;

  const today = getPlatformDateKey();
  if (dailyYieldCatchupDates.get(normalizedPhone) === today) return 0;

  const existingRun = dailyYieldCatchupInFlight.get(normalizedPhone);
  if (existingRun) return existingRun;

  const run = autoCollectUserYields(normalizedPhone)
    .then((total) => {
      dailyYieldCatchupDates.set(normalizedPhone, today);
      return total;
    })
    .finally(() => {
      dailyYieldCatchupInFlight.delete(normalizedPhone);
    });
  dailyYieldCatchupInFlight.set(normalizedPhone, run);
  return run;
}

async function generateUniqueInviteCode(drizzleDb: any): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = String(crypto.randomInt(10000, 100000));
    const existing = await drizzleDb.select({ phone: schema.users.phone })
      .from(schema.users)
      .where(eq(schema.users.inviteCode, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
  }
  throw new Error("Could not generate a unique five-digit invite code. The code space may be full.");
}

async function migrateLegacyInviteCodes(drizzleDb: any): Promise<void> {
  const users = await drizzleDb.select({
    phone: schema.users.phone,
    inviteCode: schema.users.inviteCode,
    referredByCode: schema.users.referredByCode
  }).from(schema.users);

  const occupiedCodes = new Set(
    users
      .map((user: any) => String(user.inviteCode || "").trim())
      .filter((code: string) => NUMERIC_INVITE_CODE_PATTERN.test(code))
  );
  const migrations = new Map<string, string>();
  const usersToUpdate: Array<{ phone: string; oldCode: string; newCode: string }> = [];

  for (const user of users) {
    const oldCode = String(user.inviteCode || "").trim();
    if (NUMERIC_INVITE_CODE_PATTERN.test(oldCode)) continue;

    let newCode = "";
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = String(crypto.randomInt(10000, 100000));
      if (!occupiedCodes.has(candidate)) {
        newCode = candidate;
        break;
      }
    }
    if (!newCode) throw new Error("Could not migrate invite codes because the five-digit code space is full.");
    occupiedCodes.add(newCode);
    if (oldCode) migrations.set(oldCode.toUpperCase(), newCode);
    usersToUpdate.push({ phone: user.phone, oldCode, newCode });
  }

  if (usersToUpdate.length === 0) return;

  for (const user of users) {
    const referredByCode = String(user.referredByCode || "").trim();
    const replacement = migrations.get(referredByCode.toUpperCase());
    if (!replacement) continue;
    await drizzleDb.update(schema.users)
      .set({ referredByCode: replacement })
      .where(eq(schema.users.phone, user.phone));
  }

  for (const user of usersToUpdate) {
    await drizzleDb.update(schema.users)
      .set({ inviteCode: user.newCode })
      .where(eq(schema.users.phone, user.phone));
  }

  console.info(`[Database] Migrated ${usersToUpdate.length} legacy invite code(s) to five-digit numeric codes.`);
}

// --- DATABASE FUNCTIONS ---

export async function seedDatabaseIfEmpty() {
  await ensureDatabaseSchema();

  const drizzleDb = requireDatabase("initialize the account database");
  await migrateLegacyInviteCodes(drizzleDb);
  await drizzleDb.insert(schema.siteConfig).values({
    id: "main",
    configJson: {}
  }).onDuplicateKeyUpdate({ set: { id: "main" } });

  // Older releases wrote successful deposit rows but did not update the
  // account balance. Reconcile in SQL, not by loading every user and every
  // transaction into Node. The update is monotonic and therefore safe to run
  // on every restart.
  const reconciliation = await drizzleDb.execute(sql`
    UPDATE users u
    JOIN (
      SELECT user_id, SUM(amount) AS successful_deposits
      FROM transactions
      WHERE type = 'deposit'
        AND UPPER(status) IN ('SUCCESSFUL', 'COMPLETED')
      GROUP BY user_id
    ) d ON d.user_id = u.phone
    SET u.recharge_balance = u.recharge_balance + GREATEST(d.successful_deposits - u.total_deposits, 0),
        u.total_deposits = GREATEST(d.successful_deposits, u.total_deposits)
    WHERE d.successful_deposits > u.total_deposits
  `) as any;

  // Historical successful rows have already been included in the monotonic
  // reconciliation above. Mark them settled so a later webhook cannot apply
  // the same deposit a second time.
  await drizzleDb.execute(sql`
    UPDATE transactions
    SET balance_applied_at = COALESCE(balance_applied_at, CURRENT_TIMESTAMP)
    WHERE type = 'deposit'
      AND UPPER(status) IN ('SUCCESSFUL', 'COMPLETED')
      AND balance_applied_at IS NULL
  `);

  const affected = Number(reconciliation?.[0]?.affectedRows || 0);
  if (affected > 0) console.warn(`[Database] Reconciled successful deposits for ${affected} account(s).`);

  // Older completed withdrawals were recorded in the ledger but did not
  // update users.withdrawn_cash. Rebuild that summary from settled ledger
  // rows, using the net payout when the transaction metadata contains it.
  const withdrawalReconciliation = await drizzleDb.execute(sql`
    UPDATE users u
    JOIN (
      SELECT user_id,
        SUM(COALESCE(
          CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.payoutAmount')) AS DECIMAL(30, 2)),
          amount
        )) AS settled_withdrawals
      FROM transactions
      WHERE type = 'withdrawal'
        AND UPPER(status) IN ('SUCCESSFUL', 'COMPLETED')
      GROUP BY user_id
    ) w ON w.user_id = u.phone
    SET u.withdrawn_cash = GREATEST(w.settled_withdrawals, u.withdrawn_cash)
    WHERE w.settled_withdrawals > u.withdrawn_cash
  `) as any;
  const withdrawalAffected = Number(withdrawalReconciliation?.[0]?.affectedRows || 0);
  if (withdrawalAffected > 0) console.warn(`[Database] Reconciled settled withdrawals for ${withdrawalAffected} account(s).`);
}

export async function getUserProfile(phone: string): Promise<UserProfile | null> {
  const drizzleDb = requireDatabase("load your account");
  try {
      const rows = await drizzleDb.select().from(schema.users).where(eq(schema.users.phone, phone)).limit(1);
      if (rows.length > 0) {
        const u = rows[0];
        const user: UserProfile = {
          phone: u.phone,
          username: u.username,
          password: u.password,
          inviteCode: u.inviteCode,
          referredByCode: u.referredByCode || "",
          operator: u.operator || "MTN",
          points: u.points,
          rechargeBalance: u.rechargeBalance,
          withdrawnCash: u.withdrawnCash,
          totalDeposits: u.totalDeposits,
          aiIncome: u.aiIncome,
          invitesCount: u.invitesCount,
          referralRewardsEarned: u.referralRewardsEarned,
          claimedVipTasks: readJsonStringArray(u.claimedVipTasks),
          locked: u.locked,
          usdtAddress: u.usdtAddress || "",
          lastCheckinDate: u.lastCheckinDate || "",
          checkinStreak: u.checkinStreak,
          redeemedGiftCodes: readJsonStringArray(u.redeemedGiftCodes),
          createdAt: u.createdAt
        };
        return user;
      }
  } catch (err) {
    throw databaseFailure("load your account", err);
  }
  return null;
}

export async function registerUserProfile(data: any): Promise<any> {
  const phone = data.phone || "";
  const drizzleDb = requireDatabase("create your account");
  // Personal invite codes are deliberately short, numeric, and easy to share.
  const personalInviteCode = await generateUniqueInviteCode(drizzleDb);
  const rawPassword = data.password || data.passwordHash || "";
  const password = rawPassword ? hashPassword(rawPassword) : "";
  const referredByCode = (data.referredByCode || (data.inviteCode && data.inviteCode !== personalInviteCode ? data.inviteCode : "")).trim();

  const config = await getSiteConfig();
  const grantRegistrationBonus = data.grantRegistrationBonus !== false;
  const regBonus = grantRegistrationBonus
    ? Number(config.registrationBonus ?? 1000)
    : 0;
  const inviteBonusAmt = (config.inviteBonus !== undefined && config.inviteBonus !== null) ? Number(config.inviteBonus) : 0;

  const newUser: UserProfile = {
    phone,
    username: String(data.username || "").trim().slice(0, 64) || "User_" + phone.slice(-4),
    password,
    inviteCode: personalInviteCode,
    referredByCode,
    operator: data.operator || "MTN",
    points: typeof data.points === "number" ? data.points : (regBonus > 0 ? regBonus : 0), // Registration bonus credited directly to withdrawable balance!
    rechargeBalance: 0,
    withdrawnCash: 0,
    totalDeposits: 0,
    aiIncome: 0,
    invitesCount: 0,
    referralRewardsEarned: 0,
    claimedVipTasks: [],
    locked: false,
    usdtAddress: "",
    lastCheckinDate: "",
    checkinStreak: 0,
    redeemedGiftCodes: [],
    createdAt: new Date().toISOString()
  };

  // Persist the account before creating any bonus/referral ledger entries.
  // The old order could return a successful registration while the user
  // insert had failed, leaving orphaned transactions and an account that
  // could never log in.
  try {
    await drizzleDb.insert(schema.users).values({
      phone: newUser.phone,
      username: newUser.username,
      password: newUser.password || "",
      inviteCode: newUser.inviteCode,
      referredByCode: newUser.referredByCode,
      operator: newUser.operator,
      points: newUser.points,
      rechargeBalance: newUser.rechargeBalance,
      withdrawnCash: newUser.withdrawnCash,
      totalDeposits: newUser.totalDeposits,
      aiIncome: newUser.aiIncome,
      invitesCount: newUser.invitesCount,
      referralRewardsEarned: newUser.referralRewardsEarned,
      claimedVipTasks: newUser.claimedVipTasks,
      locked: newUser.locked,
      usdtAddress: newUser.usdtAddress,
      lastCheckinDate: newUser.lastCheckinDate,
      checkinStreak: newUser.checkinStreak,
      redeemedGiftCodes: newUser.redeemedGiftCodes,
      createdAt: newUser.createdAt
    });
  } catch (err) {
    throw databaseFailure("create your account", err);
  }


  // If Registration Bonus configured, record transaction & alert notification for new user
  if (regBonus > 0) {
    await saveTransaction({
      id: "reg_bonus_" + crypto.randomBytes(8).toString("hex"),
      userId: phone,
      type: "registration_bonus",
      amount: regBonus,
      currency: "UGX",
      status: "SUCCESSFUL",
      paymentMethod: "REGISTRATION_BONUS",
      phone: phone,
      itemId: "welcome_bonus",
      mode: "auto",
      timestamp: new Date().toISOString()
    });

    await createNotification(
      phone,
      "Welcome Registration Bonus!",
      `🎉 Welcome to our platform! You received a registration bonus of UGX ${regBonus.toLocaleString()} credited directly to your withdrawable balance.`,
      "register"
    );
  }

  // Handle Referrer Base Invite Bonus!
  if (newUser.referredByCode) {
    const targetRefCode = newUser.referredByCode.toUpperCase();
    let referrer: UserProfile | null = null;
    
    referrer = await getUserProfile(newUser.referredByCode);
    if (!referrer) {
      const drizzleDb = getDb();
      if (drizzleDb) {
        const rows = await drizzleDb.select().from(schema.users)
          .where(eq(schema.users.inviteCode, targetRefCode)).limit(1);
        if (rows[0]) referrer = await getUserProfile(rows[0].phone);
      }
    }

    if (referrer) {
      referrer.invitesCount = (referrer.invitesCount || 0) + 1;
      
      if (inviteBonusAmt > 0) {
        referrer.points = (referrer.points || 0) + inviteBonusAmt; // Base Invite Bonus to withdrawable balance!
        referrer.referralRewardsEarned = (referrer.referralRewardsEarned || 0) + inviteBonusAmt;

        // Record transaction for referrer
        await saveTransaction({
          id: "ref_bonus_" + crypto.randomBytes(8).toString("hex"),
          userId: referrer.phone,
          type: "referral_signup_bonus",
          amount: inviteBonusAmt,
          currency: "UGX",
          status: "SUCCESSFUL",
          paymentMethod: "BASE_INVITE_BONUS",
          phone: referrer.phone,
          itemId: newUser.phone,
          mode: "auto",
          timestamp: new Date().toISOString()
        });

        // Create notification alert for referrer
        await createNotification(
          referrer.phone,
          "New Referral Signup Bonus!",
          `🎉 User ${newUser.phone} registered using your invite code (${newUser.referredByCode})! Base Invite Bonus of UGX ${inviteBonusAmt.toLocaleString()} has been credited to your withdrawable balance!`,
          "rewards"
        );
      }

      await updateUserProfile(referrer.phone, {
        invitesCount: referrer.invitesCount,
        points: referrer.points,
        referralRewardsEarned: referrer.referralRewardsEarned
      });
    }
  }

  return { success: true, profile: newUser, ...newUser };
}

export async function loginUser(phone: string, pass: string): Promise<UserProfile | null> {
  const user = await getUserProfile(phone);
  if (!user) return null;
  const { ok, needsRehash } = verifyPassword(user.password || "", pass);
  if (!ok) return null;
  if (user.locked) {
    throw new Error("Account locked. Please contact support.");
  }
  if (needsRehash) {
    try {
      const drizzleDb = getDb();
      if (drizzleDb) {
        await drizzleDb.update(schema.users).set({ password: hashPassword(pass) }).where(eq(schema.users.phone, phone));
      }
    } catch (err) {
      console.warn("[Database] transparent password rehash failed for", phone);
    }
  }
  return user;
}

export async function updateUserProfile(
  phone: string,
  updatesOrUsername: any,
  operator?: string,
  customPhone?: string,
  newPassword?: string,
  usdtAddress?: string
): Promise<UserProfile> {
  let updates: Partial<UserProfile> = {};
  if (typeof updatesOrUsername === "object" && updatesOrUsername !== null) {
    updates = updatesOrUsername;
  } else {
    updates = {
      username: updatesOrUsername,
      operator: operator as any,
      usdtAddress: usdtAddress || undefined
    };
    if (newPassword) updates.password = newPassword;
  }

  if (updates.password && !isPasswordHashed(updates.password)) {
    updates.password = hashPassword(updates.password);
  }

  const existing = (await getUserProfile(phone)) || {
    phone,
    username: "",
    password: "",
    inviteCode: "",
    referredByCode: "",
    operator: "MTN",
    points: 0,
    rechargeBalance: 0,
    withdrawnCash: 0,
    totalDeposits: 0,
    aiIncome: 0,
    invitesCount: 0,
    referralRewardsEarned: 0,
    claimedVipTasks: [],
    locked: false,
    usdtAddress: "",
    lastCheckinDate: "",
    checkinStreak: 0,
    redeemedGiftCodes: [],
    createdAt: new Date().toISOString()
  };

  const updated: UserProfile = { ...existing, ...updates };

  const drizzleDb = requireDatabase("save your account changes");
  try {
      await drizzleDb.update(schema.users).set({
        username: updated.username,
        password: updated.password || "",
        operator: updated.operator,
        points: updated.points,
        rechargeBalance: updated.rechargeBalance,
        withdrawnCash: updated.withdrawnCash,
        totalDeposits: updated.totalDeposits,
        aiIncome: updated.aiIncome,
        invitesCount: updated.invitesCount,
        referralRewardsEarned: updated.referralRewardsEarned,
        claimedVipTasks: updated.claimedVipTasks,
        locked: updated.locked,
        usdtAddress: updated.usdtAddress,
        lastCheckinDate: updated.lastCheckinDate,
        checkinStreak: updated.checkinStreak,
        redeemedGiftCodes: updated.redeemedGiftCodes
      }).where(eq(schema.users.phone, phone));
  } catch (err) {
    throw databaseFailure("save your account changes", err);
  }

  return updated;
}

export async function getSubscriptionItems(): Promise<SubscriptionItem[]> {
  const drizzleDb = getDb();
  if (drizzleDb) {
    try {
      const rows = await drizzleDb.select().from(schema.catalogProducts);
      if (rows.length > 0) {
        return rows.map(r => ({
          id: r.id,
          name: r.name,
          image: r.image,
          imageUrl: r.imageUrl || r.image,
          amount: r.amount,
          duration: r.duration,
          dailyYield: r.dailyYield,
          category: r.category as any,
          inviteBonusPercent: r.inviteBonusPercent,
          outOfStock: r.outOfStock,
          disabled: r.disabled
        }));
      }
    } catch (err) {
      console.warn("[Database] getSubscriptionItems error:", err);
    }
  }
  return [];
}

export async function subscribeToItem(phone: string, itemId: string): Promise<SubscribedNode> {
  const user = await getUserProfile(phone);
  if (!user) throw new Error("User not found");

  const catalog = await getSubscriptionItems();
  const item = catalog.find(c => c.id === itemId);
  if (!item) throw new Error("Subscription package not found");

  if ((user.rechargeBalance || 0) < item.amount) {
    throw new Error("Insufficient recharge balance. Please deposit funds first.");
  }

  // Deduct rental cost from recharge balance
  user.rechargeBalance = (user.rechargeBalance || 0) - item.amount;
  
  // IMMEDIATELY auto-credit 1st day daily yield to withdrawable balance (points)!
  const immediateYield = item.dailyYield || 0;
  user.points = (user.points || 0) + immediateYield;
  user.aiIncome = (user.aiIncome || 0) + immediateYield;

  await updateUserProfile(phone, {
    rechargeBalance: user.rechargeBalance,
    points: user.points,
    aiIncome: user.aiIncome
  });

  const now = new Date();
  const endDate = new Date(now.getTime() + item.duration * 24 * 60 * 60 * 1000);

  const node: SubscribedNode = {
    id: "sub_" + crypto.randomBytes(8).toString("hex"),
    userId: phone,
    itemId: item.id,
    itemName: item.name,
    // Store a renderable image URL on the node. `item.image` is historically
    // a Tailwind gradient key (not a URL) — claims copy sub.image into the
    // ledger, so a gradient here poisons every future daily_yield row.
    image: item.imageUrl || item.image,
    amount: item.amount,
    duration: item.duration,
    dailyYield: item.dailyYield,
    startDate: now.toISOString(),
    endDate: endDate.toISOString(),
    lastClaimedDate: getPlatformDateKey(now),
    totalEarned: immediateYield,
    status: "active"
  };


  // Record node activation rental transaction
  await saveTransaction({
    id: createTransactionId("RNT", now),
    userId: phone,
    type: "product_activation",
    amount: item.amount,
    currency: "UGX",
    status: "SUCCESSFUL",
    paymentMethod: "RECHARGE_BALANCE",
    phone: phone,
    itemId: item.id,
    mode: "auto",
    metadata: { sourceItemId: item.id, sourceItemName: item.name },
    timestamp: now.toISOString()
  });

  // Record immediate initial yield payout transaction
  if (immediateYield > 0) {
    await saveTransaction({
      id: "yield_init_" + crypto.randomBytes(8).toString("hex"),
      userId: phone,
      type: "daily_yield",
      amount: immediateYield,
      currency: "UGX",
      status: "SUCCESSFUL",
      paymentMethod: "DAY_1_IMMEDIATE_YIELD",
      phone: phone,
      itemId: item.id,
      mode: "auto",
      metadata: { sourceItemId: item.id, sourceItemName: item.name, sourceItemImage: item.imageUrl || item.image },
      timestamp: now.toISOString()
    });
  }

  // Create alert/notification for renting the product!
  await createNotification(
    phone,
    "Product Activated!",
    `🎉 Congratulations! You successfully rented "${item.name}". Your product is active and Day 1 yield of UGX ${immediateYield.toLocaleString()} has been immediately credited to your withdrawable balance.`,
    "rewards"
  );

  const drizzleDb = getDb();
  if (drizzleDb) {
    try {
      await drizzleDb.insert(schema.subscribedNodes).values({
        id: node.id,
        userId: node.userId,
        itemId: node.itemId,
        itemName: node.itemName,
        image: node.image,
        amount: node.amount,
        duration: node.duration,
        dailyYield: node.dailyYield,
        startDate: node.startDate,
        endDate: node.endDate,
        lastClaimedDate: node.lastClaimedDate,
        totalEarned: node.totalEarned,
        status: node.status
      });
    } catch (err) {
      console.warn("[Database] subscribeToItem error:", err);
    }
  }

  if (user.referredByCode) {
    // Referral earnings use the four commission levels configured in Site
    // Config. Keeping this calculation in the same path as the VIP board
    // prevents product-level defaults from making progress disagree with the
    // bonus a user actually earns.
    await distributeReferralBonus(user.referredByCode, item.amount, undefined, {
      sourceUserPhone: user.phone,
      sourceItemId: item.id,
      sourceItemName: item.name
    });
  }

  await sendChatMessage({
    roomId: "shared",
    sender: "system",
    senderName: "SYSTEM BROADCAST",
    text: `User ${phone.slice(0, 4)}*** rented "${item.name}"!`
  });

  return node;
}

export async function distributeReferralBonus(
  referrerCodeOrPhone: string,
  amountOrItemId?: any,
  percent?: number,
  context?: { sourceUserPhone?: string; sourceItemId?: string; sourceItemName?: string }
) {
  const siteConfig = await getSiteConfig();
  const commissionPcts = [
    percent !== undefined ? Number(percent) : Number(siteConfig.level1InviteIncomePct ?? 15),
    Number(siteConfig.level2InviteIncomePct ?? 5),
    Number(siteConfig.level3InviteIncomePct ?? 0),
    Number(siteConfig.level4InviteIncomePct ?? 0)
  ];

  if (typeof amountOrItemId !== "number") return;

  const drizzleDb = getDb();
  if (!drizzleDb) return;
  const allUsers = await drizzleDb.select().from(schema.users);
  const byReference = new Map<string, typeof allUsers[number]>();
  for (const candidate of allUsers) {
    byReference.set(candidate.phone.trim().toUpperCase(), candidate);
    if (candidate.inviteCode) byReference.set(candidate.inviteCode.trim().toUpperCase(), candidate);
  }

  let current = byReference.get(String(referrerCodeOrPhone).trim().toUpperCase());
  for (let level = 0; level < 4 && current; level += 1) {
    const commissionPct = commissionPcts[level];
    if (commissionPct > 0) {
      const bonus = (Number(amountOrItemId) * commissionPct) / 100;
      await drizzleDb.update(schema.users).set({
        points: sql`${schema.users.points} + ${bonus}`,
        referralRewardsEarned: sql`${schema.users.referralRewardsEarned} + ${bonus}`
      }).where(eq(schema.users.phone, current.phone));

      const referralLevel = level + 1;
      const sourceUserPhone = context?.sourceUserPhone || "";
      await saveTransaction({
        id: "ref_income_" + crypto.randomBytes(8).toString("hex"),
        userId: current.phone,
        type: "referral_level_income",
        amount: bonus,
        currency: "UGX",
        status: "SUCCESSFUL",
        paymentMethod: `LEVEL_${referralLevel}_REFERRAL_BONUS`,
        phone: current.phone,
        itemId: context?.sourceItemId || sourceUserPhone,
        mode: "auto",
        metadata: {
          kind: "product_purchase",
          level: referralLevel,
          commissionPct,
          sourceUserPhone,
          sourceItemId: context?.sourceItemId || "",
          sourceItemName: context?.sourceItemName || "",
          sourceAmount: Number(amountOrItemId)
        },
        timestamp: new Date().toISOString()
      });

      await createNotification(
        current.phone,
        `Level ${level} Referral Bonus`,
        `🎉 User ${sourceUserPhone || "your referral"} activated "${context?.sourceItemName || "a server machine"}". You earned UGX ${bonus.toLocaleString()} (${commissionPct}% Level ${referralLevel} referral income).`,
        "rewards"
      );
    }
    current = current.referredByCode ? byReference.get(current.referredByCode.trim().toUpperCase()) : undefined;
  }
}

export async function getUserSubscriptions(phone: string): Promise<SubscribedNode[]> {
  const drizzleDb = getDb();
  if (drizzleDb) {
    try {
      const rows = await drizzleDb.select().from(schema.subscribedNodes).where(eq(schema.subscribedNodes.userId, phone));
      if (rows.length > 0) {
        return rows.map(r => ({
          id: r.id,
          userId: r.userId,
          itemId: r.itemId,
          itemName: r.itemName,
          image: r.image,
          amount: r.amount,
          duration: r.duration,
          dailyYield: r.dailyYield,
          startDate: r.startDate,
          endDate: r.endDate,
          lastClaimedDate: r.lastClaimedDate,
          totalEarned: r.totalEarned,
          status: r.status as any
        }));
      }
    } catch (err) {
      console.warn("[Database] getUserSubscriptions error:", err);
    }
  }
  return [];
}

export async function getUserTransactions(phone: string): Promise<any[]> {
  let list: any[] = [];
  const drizzleDb = getDb();
  if (drizzleDb) {
    try {
      list = await drizzleDb.select().from(schema.transactions).where(eq(schema.transactions.userId, phone));
    } catch (err) {
      console.warn("[Database] getUserTransactions error:", err);
    }
  }
  return list.sort((a, b) => {
    const tA = new Date(a.timestamp || a.createdAt || a.date || 0).getTime();
    const tB = new Date(b.timestamp || b.createdAt || b.date || 0).getTime();
    return tB - tA; // Newest first
  });
}

/**
 * Browsers can only render URL-like image sources. Catalog `image` values
 * are historically Tailwind gradient keys (e.g. "from-blue-600 ..."), so
 * anything written into transaction metadata must pass this check first.
 */
function isUrlLikeImage(value: unknown): boolean {
  const v = String(value || "").trim().toLowerCase();
  return v.startsWith("http://") || v.startsWith("https://") || v.startsWith("data:") || v.startsWith("/") || v.startsWith("blob:");
}

export async function claimDailyReward(arg1: string, arg2: string): Promise<{ success: boolean; reward: number }> {
  let subId = arg1;
  let phone = arg2;
  if (!arg1.startsWith("sub_") && arg2.startsWith("sub_")) {
    phone = arg1;
    subId = arg2;
  }

  const drizzleDb = requireDatabase("credit the daily product yield");
  const today = getPlatformDateKey();
  let reward = 0;
  let userId = phone;
  let itemName = "your product";

  await drizzleDb.transaction(async (tx) => {
    // Lock the node before checking its date. This makes a cron run and a
    // user-triggered retry mutually exclusive, so the same node cannot pay
    // twice for one platform day.
    const nodeRows = await tx.select().from(schema.subscribedNodes)
      .where(and(
        eq(schema.subscribedNodes.id, subId),
        eq(schema.subscribedNodes.userId, phone)
      ))
      .limit(1)
      .for("update");
    const sub = nodeRows[0];
    if (!sub) throw new Error("Subscription node not found");
    if (String(sub.status).toLowerCase() !== "active") {
      throw new Error("This product is no longer active.");
    }
    // Duration is counted in platform calendar days, including the immediate
    // Day 1 yield paid at activation. This prevents a product activated late
    // at night from receiving an extra yield after its stated duration.
    const activationDate = getPlatformDateKey(new Date(sub.startDate));
    const finalEarnDate = addPlatformDays(activationDate, Math.max(0, Number(sub.duration || 1) - 1));
    if (today > finalEarnDate) {
      await tx.update(schema.subscribedNodes)
        .set({ status: "expired" })
        .where(eq(schema.subscribedNodes.id, sub.id));
      throw new Error("This product subscription has expired.");
    }
    if (sub.lastClaimedDate === today) {
      throw new Error("Daily yield already collected today.");
    }

    const userRows = await tx.select().from(schema.users)
      .where(eq(schema.users.phone, phone))
      .limit(1)
      .for("update");
    const user = userRows[0];
    if (!user) throw new Error("User not found");

    reward = Number(sub.dailyYield || 0);
    userId = user.phone;
    itemName = sub.itemName || itemName;
    const transactionId = `yield_${crypto.createHash("sha256").update(`${sub.id}:${today}`).digest("hex").slice(0, 56)}`;
    const creditedAt = new Date().toISOString();

    await tx.update(schema.users).set({
      points: sql`${schema.users.points} + ${reward}`,
      aiIncome: sql`${schema.users.aiIncome} + ${reward}`
    }).where(eq(schema.users.phone, user.phone));

    await tx.update(schema.subscribedNodes).set({
      lastClaimedDate: today,
      totalEarned: sql`${schema.subscribedNodes.totalEarned} + ${reward}`
    }).where(eq(schema.subscribedNodes.id, sub.id));

    // Resolve a renderable image for the ledger row. sub.image historically
    // holds a Tailwind gradient key, so prefer the live catalog imageUrl and
    // only fall back to sub.image when it is URL-like. Never store a gradient.
    let claimImage = "";
    try {
      const catalogRows = await tx.select().from(schema.catalogProducts)
        .where(eq(schema.catalogProducts.id, sub.itemId))
        .limit(1);
      const catalogImage = String(catalogRows[0]?.imageUrl || catalogRows[0]?.image || "");
      if (isUrlLikeImage(catalogImage)) claimImage = catalogImage;
      else if (isUrlLikeImage(sub.image)) claimImage = String(sub.image);
    } catch {
      if (isUrlLikeImage(sub.image)) claimImage = String(sub.image);
    }

    await tx.insert(schema.transactions).values({
      id: transactionId,
      userId: user.phone,
      type: "daily_yield",
      amount: reward,
      currency: "UGX",
      status: "SUCCESSFUL",
      paymentMethod: "DAILY_PRODUCT_YIELD",
      phone: user.phone,
      itemId: sub.itemId,
      mode: "auto",
      metadata: { platformDate: today, subscriptionId: sub.id, sourceItemId: sub.itemId, sourceItemName: itemName, sourceItemImage: claimImage },
      timestamp: creditedAt
    });
  });

  if (reward > 0) {
    await createNotification(
      userId,
      "Daily Income Credited",
      `Your daily yield of UGX ${reward.toLocaleString()} from ${itemName} was credited to your withdrawable balance for ${today}.`,
      "daily accumulation",
      reward
    );
  }

  return { success: true, reward };
}

export function getConfiguredWithdrawMode(config: SiteConfig): "automatic" | "manual" {
  // The existing auto-payout switch is the selector. The admin UI keeps the
  // manual switch mutually exclusive with it, so no extra mode field is
  // required.
  return config.allowAutoWithdraw === false ? "manual" : "automatic";
}

export function getMinimumDepositAmount(config: SiteConfig): number {
  const configured = Number(config.minimumDeposit);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 20_000;
}

function getConfiguredMaximum(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const configured = Number(value);
  if (!Number.isFinite(configured) || configured <= 0) return 0;
  return Math.floor(configured);
}

export function getMaximumDepositAmount(config: SiteConfig): number {
  // A zero value means no maximum. Deposits had no upper bound before this
  // setting existed, so the backwards-compatible default is unlimited.
  return getConfiguredMaximum(config.maximumDeposit, 0);
}

export function getMinimumWithdrawalAmount(config: SiteConfig): number {
  const configured = Number(config.minimumWithdrawal);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 10_000;
}

export function getMaximumWithdrawalAmount(config: SiteConfig): number {
  // Preserve the existing five-million-UGX UI ceiling unless an administrator
  // explicitly changes it. Setting zero clears the ceiling.
  return getConfiguredMaximum(config.maximumWithdrawal, 5_000_000);
}

function usdtLabel(ugxAmount: number, usdtRate?: number): string {
  const rate = Number(usdtRate) > 0 ? Number(usdtRate) : 3700;
  return `≈ $${(Number(ugxAmount) / rate).toFixed(2)} USDT`;
}

export async function requestCashout(phone: string, amount: number, paymentMethodOrTransId?: string, mode?: string, withdrawPhone?: string, operator?: string, extraMetadata?: any): Promise<any> {
  const siteConfig = await getSiteConfig();
  const minimumWithdrawal = getMinimumWithdrawalAmount(siteConfig);
  const maximumWithdrawal = getMaximumWithdrawalAmount(siteConfig);
  if (!Number.isFinite(amount) || amount < minimumWithdrawal) {
    throw new Error(`Minimum withdrawal is UGX ${minimumWithdrawal.toLocaleString()}.`);
  }
  if (maximumWithdrawal > 0 && amount > maximumWithdrawal) {
    throw new Error(`Maximum withdrawal is UGX ${maximumWithdrawal.toLocaleString()}.`);
  }
  const currentWithdrawMode = mode === "automatic" || mode === "manual"
    ? mode
    : getConfiguredWithdrawMode(siteConfig);
  const withdrawFeePercent = Number(siteConfig.withdrawFee ?? 0);
  const feeAmount = extraMetadata?.feeAmount !== undefined
    ? Number(extraMetadata.feeAmount)
    : Math.max(0, Math.floor(amount * (withdrawFeePercent / 100)));
  const payoutAmount = extraMetadata?.payoutAmount !== undefined
    ? Number(extraMetadata.payoutAmount)
    : Math.max(0, amount - feeAmount);
  const txId = paymentMethodOrTransId || createTransactionId("WDR");
  const timestamp = new Date().toISOString();
  const paymentMethod = operator || "MTN";
  const metadata = {
    requestedAmount: amount,
    feePercent: withdrawFeePercent,
    feeAmount,
    payoutAmount,
    ...extraMetadata
  };
  const drizzleDb = requireDatabase("record the withdrawal request");

  // Reserve points and create the pending transaction atomically. This keeps
  // the wallet and transaction ledger consistent under retries/concurrency.
  await drizzleDb.transaction(async (tx) => {
    const rows = await tx.select().from(schema.users)
      .where(eq(schema.users.phone, phone))
      .limit(1)
      .for("update");
    const user = rows[0];
    if (!user) throw new Error("User not found");
    if (Number(user.points || 0) < amount) {
      throw new Error(`Insufficient withdrawable balance. Available: UGX ${Number(user.points || 0).toLocaleString()}.`);
    }

    await tx.update(schema.users)
      .set({ points: sql`${schema.users.points} - ${amount}` })
      .where(eq(schema.users.phone, phone));

    await tx.insert(schema.transactions).values({
      id: txId,
      userId: phone,
      type: "withdrawal",
      amount,
      currency: "UGX",
      status: "PENDING",
      paymentMethod,
      phone: withdrawPhone || phone,
      usdtAddress: operator === "USDT" ? (withdrawPhone || "") : "",
      operator: operator || "",
      mode: currentWithdrawMode,
      metadata,
      timestamp
    });
  });

  const updatedProfile = await getUserProfile(phone);
  if (!updatedProfile) throw new Error("Withdrawal was recorded, but the account could not be reloaded.");

  const isAutomatic = currentWithdrawMode === "automatic";
  const isUsdt = operator === "USDT";
  const usdtRate = Number(siteConfig.usdtRate) > 0 ? Number(siteConfig.usdtRate) : 3700;
  const requestedLabel = isUsdt
    ? `${usdtLabel(payoutAmount, usdtRate)} (UGX ${amount.toLocaleString()} requested)`
    : `UGX ${amount.toLocaleString()}`;
  await createNotification(
    phone,
    "Withdrawal Submitted",
    isAutomatic
      ? `Your withdrawal request of UGX ${amount.toLocaleString()} (${paymentMethod}) was received and is pending confirmation.`
      : `Your withdrawal request of ${requestedLabel} (${paymentMethod}) was received and is pending approval.`,
    "withdraw"
  );
  return {
    id: txId,
    userId: phone,
    type: "withdrawal",
    amount,
    currency: "UGX",
    status: "PENDING",
    paymentMethod,
    phone: withdrawPhone || phone,
    usdtAddress: operator === "USDT" ? (withdrawPhone || "") : "",
    operator: operator || "",
    mode: currentWithdrawMode,
    metadata,
    timestamp,
    profile: updatedProfile
  };
}

export async function getReferreeStatsList(phoneOrCode: string): Promise<ReferralStat[]> {
  const drizzleDb = getDb();
  if (!drizzleDb) return [];
  
  const userRows = await drizzleDb.select().from(schema.users).where(eq(schema.users.phone, phoneOrCode));
  if (userRows.length === 0) {
    const userRowsCode = await drizzleDb.select().from(schema.users).where(eq(schema.users.inviteCode, phoneOrCode));
    if (userRowsCode.length === 0) return [];
    phoneOrCode = userRowsCode[0].phone;
  }
  
  const user = (await drizzleDb.select().from(schema.users).where(eq(schema.users.phone, phoneOrCode)))[0];
  const descendants: Array<{ user: typeof user; level: number }> = [];
  let frontier = [user];
  const visited = new Set<string>([user.phone]);
  for (let level = 1; level <= 4; level += 1) {
    const parentReferences = Array.from(new Set(frontier.flatMap((parent) => [parent.phone, parent.inviteCode].filter(Boolean) as string[])));
    if (parentReferences.length === 0) break;
    const normalizedReferences = parentReferences.map((reference) => reference.toUpperCase());
    const referenceList = sql.join(normalizedReferences.map((reference) => sql`${reference}`), sql`, `);
    const nextLevelRows = await drizzleDb.select().from(schema.users)
      .where(sql`upper(trim(${schema.users.referredByCode})) in (${referenceList})`);
    const nextLevel = nextLevelRows.filter((candidate) => !visited.has(candidate.phone));
    for (const candidate of nextLevel) {
      visited.add(candidate.phone);
      descendants.push({ user: candidate, level });
    }
    frontier = nextLevel;
    if (frontier.length === 0) break;
  }

  const descendantPhones = descendants.map((entry) => entry.user.phone);
  const allSubs = descendantPhones.length > 0
    ? await drizzleDb.select().from(schema.subscriptions).where(inArray(schema.subscriptions.userId, descendantPhones))
    : [];
  const subsByUser = new Map<string, typeof allSubs>();
  for (const sub of allSubs) {
    const current = subsByUser.get(sub.userId) || [];
    current.push(sub);
    subsByUser.set(sub.userId, current);
  }

  // Referral reporting must show income that was actually credited, not the
  // referred user's product spend multiplied by today's Site Config rates.
  // Purchase referral payouts are ledgered with their source user and level;
  // the signup bonus uses the referred user's phone as the legacy itemId.
  const incomeByUser = new Map<string, number>();
  let ledgerTotal = 0;
  const descendantByPhone = new Map(descendants.map((entry) => [entry.user.phone.toUpperCase(), entry]));
  const referralTransactions = await drizzleDb.select().from(schema.transactions)
    .where(eq(schema.transactions.userId, user.phone));
  for (const transaction of referralTransactions) {
    const canon = canonicalTypeOf(String(transaction.type), transaction.metadata) as string;
    if (!["referral_signup_bonus", "referral_level_income"].includes(canon) || !["SUCCESSFUL", "COMPLETED"].includes(String(transaction.status).toUpperCase())) continue;
    const metadata = readJsonRecord(transaction.metadata);
    const sourceUserPhone = String(metadata.sourceUserPhone || transaction.itemId || "").trim();
    const source = descendantByPhone.get(sourceUserPhone.toUpperCase());
    if (!source) continue;
    const amount = Number(transaction.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    incomeByUser.set(source.user.phone, (incomeByUser.get(source.user.phone) || 0) + amount);
    ledgerTotal += amount;
  }

  // Older purchase payouts updated referralRewardsEarned but were not written
  // to the transaction ledger. Keep those already-collected funds visible and
  // avoid replacing them with the referred user's full purchase amount.
  const actualReferralIncome = Math.max(0, Number(user.referralRewardsEarned || 0));
  const legacyUnallocated = Math.max(0, actualReferralIncome - ledgerTotal);
  if (legacyUnallocated > 0) {
    const fallbackRecipient = descendants.find((entry) => entry.level === 1) || descendants[0];
    if (fallbackRecipient) {
      incomeByUser.set(
        fallbackRecipient.user.phone,
        (incomeByUser.get(fallbackRecipient.user.phone) || 0) + legacyUnallocated
      );
    }
  }

  const stats: ReferralStat[] = [];
  for (const { user: candidate, level } of descendants) {
    const userSubs = subsByUser.get(candidate.phone) || [];
    const activeProducts = userSubs.filter((sub) => sub.status === "active");
    stats.push({
      phone: candidate.phone,
      level,
      joinedDate: candidate.createdAt || "",
      rewardAmount: incomeByUser.get(candidate.phone) || 0,
      activeProductsCount: activeProducts.length
    });
  }
  return stats;
}


export async function getChatMessages(roomId: string = "global"): Promise<ChatMessage[]> {
  const drizzleDb = getDb();
  if (drizzleDb) {
    try {
      const rows = await drizzleDb.select().from(schema.chatMessages).where(eq(schema.chatMessages.roomId, roomId)).orderBy(asc(schema.chatMessages.timestamp)).limit(500);
      if (rows.length > 0) {
        return rows.map(r => ({
          id: r.id,
          roomId: r.roomId,
          sender: r.sender,
          senderName: r.senderName,
          text: r.text,
          image: r.image || undefined,
          timestamp: r.timestamp
        }));
      }
    } catch (err) {
      console.warn("[Database] getChatMessages error:", err);
    }
  }
  return [];
}

export async function sendChatMessage(roomIdOrMsg: any, sender?: string, senderName?: string, text?: string, image?: string): Promise<ChatMessage> {
  let msg: ChatMessage;
  if (typeof roomIdOrMsg === "object" && roomIdOrMsg !== null) {
    msg = {
      id: "msg_" + crypto.randomBytes(8).toString("hex"),
      roomId: roomIdOrMsg.roomId || "global",
      sender: roomIdOrMsg.sender,
      senderName: roomIdOrMsg.senderName,
      text: roomIdOrMsg.text || "",
      image: roomIdOrMsg.image,
      timestamp: new Date().toISOString()
    };
  } else {
    msg = {
      id: "msg_" + crypto.randomBytes(8).toString("hex"),
      roomId: roomIdOrMsg || "global",
      sender: sender || "",
      senderName: senderName || "",
      text: text || "",
      image,
      timestamp: new Date().toISOString()
    };
  }


  const drizzleDb = getDb();
  if (drizzleDb) {
    try {
      await drizzleDb.insert(schema.chatMessages).values({
        id: msg.id,
        roomId: msg.roomId,
        sender: msg.sender,
        senderName: msg.senderName,
        text: msg.text,
        image: msg.image || null,
        timestamp: msg.timestamp
      });
    } catch (err) {
      console.warn("[Database] sendChatMessage error:", err);
    }
  }

  return msg;
}


export async function fetchSystemDashboardStats() {
  const drizzleDb = requireDatabase("load dashboard statistics");
  try {
    const [userCount, nodeCount, depositTotals, withdrawalTotals] = await Promise.all([
      drizzleDb.select({ count: sql<number>`count(*)` }).from(schema.users),
      drizzleDb.select({ count: sql<number>`count(*)` }).from(schema.subscribedNodes).where(eq(schema.subscribedNodes.status, "active")),
      drizzleDb.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(schema.transactions)
        .where(sql`type = 'deposit' and upper(status) in ('SUCCESSFUL', 'COMPLETED')`),
      drizzleDb.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(schema.transactions)
        .where(sql`type = 'withdrawal' and upper(status) in ('SUCCESSFUL', 'COMPLETED')`)
    ]);

    return {
      totalUsers: Number(userCount[0]?.count || 0),
      totalDeposits: Number(depositTotals[0]?.total || 0),
      totalWithdrawals: Number(withdrawalTotals[0]?.total || 0),
      activeNodes: Number(nodeCount[0]?.count || 0),
      onlineUsers: 0
    };
  } catch (err) {
    throw databaseFailure("load dashboard statistics", err);
  }
}


export async function createNotification(
  phone: string,
  title: string,
  message: string,
  category: string = "system",
  amount?: number
) {
  const notif: NotificationItem = {
    id: "notif_" + crypto.randomBytes(8).toString("hex"),
    userId: phone,
    title,
    message,
    category,
    timestamp: new Date().toISOString()
  };
  if (amount !== undefined) notif.amount = amount;

  const drizzleDb = getDb();
  if (drizzleDb) {
    try {
      await drizzleDb.insert(schema.notifications).values({
        id: notif.id,
        userId: notif.userId,
        title: notif.title,
        message: notif.message,
        category: notif.category,
        amount: notif.amount ?? 0,
        timestamp: notif.timestamp
      });
    } catch (err) {
      console.warn("[Database] createNotification error:", err);
    }
  }
  return notif;
}

export async function getUserNotifications(phone: string): Promise<NotificationItem[]> {
  const drizzleDb = getDb();
  if (drizzleDb) {
    const notifs = await drizzleDb.select().from(schema.notifications).where(eq(schema.notifications.userId, phone)).orderBy(desc(schema.notifications.timestamp));
    const ancs = await drizzleDb.select().from(schema.announcements).orderBy(desc(schema.announcements.createdAt));
    
    const directLogs = notifs.map(n => ({
      id: n.id,
      userId: n.userId,
      title: n.title,
      message: n.message,
      category: n.category,
      amount: n.amount || undefined,
      timestamp: n.timestamp,
      read: false
    }));

    const announcementsList = ancs.map(anc => ({
      id: anc.id,
      userId: phone,
      title: anc.title,
      message: anc.message,
      category: anc.category || "news",
      timestamp: anc.createdAt || new Date().toISOString(),
      read: false,
      metadata: {
        tag: anc.tag || "ANNOUNCEMENT",
        imageUrl: anc.imageUrl,
        link: anc.readMoreLink,
        alertUsers: true
      }
    }));

    const combined = [...directLogs, ...announcementsList];
    return combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
  return [];
}

export async function processDeposit(phone: string, amount: number, operator?: string, depositPhone?: string): Promise<UserProfile> {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Deposit amount must be greater than zero.");
  const siteConfig = await getSiteConfig();
  const minimumDeposit = getMinimumDepositAmount(siteConfig);
  const maximumDeposit = getMaximumDepositAmount(siteConfig);
  if (amount < minimumDeposit) {
    throw new Error(`Minimum deposit is UGX ${minimumDeposit.toLocaleString()}.`);
  }
  if (maximumDeposit > 0 && amount > maximumDeposit) {
    throw new Error(`Maximum deposit is UGX ${maximumDeposit.toLocaleString()}.`);
  }
  const user = await getUserProfile(phone);
  if (!user) throw new Error("The account for this deposit could not be found.");
  const transactionId = createTransactionId("DEP");

  // Direct/legacy deposits still go through the same ledger-first settlement
  // path as gateway webhooks. There is deliberately no read-modify-write of
  // the user row here: concurrent requests must be serialized by MySQL.
  await saveTransaction({
    id: transactionId,
    userId: phone,
    type: "deposit",
    amount,
    currency: "UGX",
    status: "SUCCESSFUL",
    paymentMethod: operator || "MTN",
    phone: depositPhone || phone,
    operator: operator || "",
    mode: "direct",
    timestamp: new Date().toISOString()
  });

  return completeSuccessfulDeposit(phone, amount, depositPhone, operator, transactionId);
}

export async function saveTransaction(
  txOrId: any,
  phone?: string,
  amount?: number,
  type?: string,
  depositPhone?: string,
  operator?: string,
  itemId?: string,
  mode?: string
) {
  let tx: any;
  if (typeof txOrId === "object" && txOrId !== null) {
    tx = txOrId;
    // Canonicalize legacy types on write (full migration, no users: always canonical)
    try {
      const { canonicalTypeOf } = await import("../utils/transactionMeta");
      tx.type = canonicalTypeOf(String(tx.type || "deposit"), tx.metadata) as string;
    } catch {}
  } else {
    let canonType = String(type || "deposit");
    try {
      const { canonicalTypeOf: c } = await import("../utils/transactionMeta");
      canonType = c(canonType, undefined) as string;
      if (!canonType || typeof canonType !== "string") canonType = "deposit";
    } catch {}
    tx = {
      id: txOrId,
      userId: phone || "",
      type: canonType,
      amount: amount || 0,
      currency: "UGX",
      status: "pending",
      paymentMethod: operator || "MTN",
      phone: depositPhone || phone || "",
      itemId: itemId || "",
      mode: mode || "online",
      timestamp: new Date().toISOString()
    };
  }

  const drizzleDb = requireDatabase("save the transaction");
  try {
      await drizzleDb.insert(schema.transactions).values({
        id: tx.id,
        userId: tx.userId,
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency || "UGX",
        status: tx.status || "pending",
        paymentMethod: tx.paymentMethod || "",
        phone: tx.phone || "",
        usdtAddress: tx.usdtAddress || "",
        itemId: tx.itemId || "",
        operator: tx.operator || "",
        mode: tx.mode || "",
        metadata: tx.metadata || null,
        balanceAppliedAt: tx.balanceAppliedAt || null,
        timestamp: tx.timestamp || new Date().toISOString()
      });
  } catch (err) {
    throw databaseFailure("save the transaction", err);
  }
}

export async function getTransaction(txId: string) {
  const drizzleDb = requireDatabase("load the transaction");
  try {
    const rows = await drizzleDb.select().from(schema.transactions)
      .where(eq(schema.transactions.id, txId)).limit(1);
    return rows[0] || null;
  } catch (err) {
    throw databaseFailure("load the transaction", err);
  }
}

export async function getTransactionByExternalReference(reference: string) {
  const normalizedReference = String(reference || "").trim();
  if (!normalizedReference) return null;
  const drizzleDb = requireDatabase("find the external transaction reference");
  try {
    const rows = await drizzleDb.select().from(schema.transactions)
      .where(sql`JSON_UNQUOTE(JSON_EXTRACT(${schema.transactions.metadata}, '$.externalReference')) = ${normalizedReference}`)
      .limit(1);
    return rows[0] || null;
  } catch (err) {
    throw databaseFailure("find the external transaction reference", err);
  }
}

export async function completeSuccessfulDeposit(
  userIdOrTxId: string,
  amount?: number,
  phone?: string,
  operator?: string,
  transId?: string
): Promise<UserProfile> {
  const transactionId = transId || userIdOrTxId;
  const drizzleDb = requireDatabase("settle the deposit");
  let settled = false;

  try {
    await drizzleDb.transaction(async (tx) => {
      const rows = await tx.select().from(schema.transactions)
        .where(eq(schema.transactions.id, transactionId))
        .limit(1)
        .for("update");
      const transaction = rows[0];
      if (!transaction) throw new DepositSettlementError("Payment transaction was not found. It may not have been recorded yet.");
      if (transaction.type !== "deposit") throw new DepositSettlementError("The transaction is not a deposit.");
      if (String(transaction.status).toUpperCase() === "FAILED") throw new DepositSettlementError("This deposit was already rejected.");

      // balanceAppliedAt is the idempotency key. A webhook, status poll, or
      // admin click can safely repeat this function without double-crediting.
      if (!transaction.balanceAppliedAt) {
        const userRows = await tx.select().from(schema.users)
          .where(eq(schema.users.phone, transaction.userId))
          .limit(1)
          .for("update");
        const user = userRows[0];
        if (!user) throw new DepositSettlementError("The account for this deposit no longer exists.");

        await tx.update(schema.users).set({
          rechargeBalance: sql`${schema.users.rechargeBalance} + ${transaction.amount}`,
          totalDeposits: sql`${schema.users.totalDeposits} + ${transaction.amount}`
        }).where(eq(schema.users.phone, user.phone));

        await tx.update(schema.transactions).set({
          status: "SUCCESSFUL",
          balanceAppliedAt: new Date().toISOString()
        }).where(and(
          eq(schema.transactions.id, transaction.id),
          isNull(schema.transactions.balanceAppliedAt)
        ));
        settled = true;
      } else if (String(transaction.status).toUpperCase() !== "SUCCESSFUL") {
        await tx.update(schema.transactions).set({ status: "SUCCESSFUL" })
          .where(eq(schema.transactions.id, transaction.id));
        settled = true;
      }
    });
  } catch (err: any) {
    if (err instanceof DatabaseOperationError || err instanceof DepositSettlementError) throw err;
    throw databaseFailure("settle the deposit", err);
  }

  const settledTransaction = await getTransaction(transactionId);
  const settledUser = await getUserProfile(settledTransaction?.userId || userIdOrTxId);
  if (!settledUser) throw new Error("Deposit was settled, but the account could not be reloaded.");
  if (settled && settledTransaction) {
    const settledAmount = Number(settledTransaction.amount);
    const isUsdtDeposit = String((settledTransaction as any).operator || "").toUpperCase() === "USDT";
    const depConfig = isUsdtDeposit ? await getSiteConfig().catch(() => null) : null;
    const depositLabel = isUsdtDeposit
      ? `${usdtLabel(settledAmount, Number((depConfig as any)?.usdtRate) || 3700)} (UGX ${settledAmount.toLocaleString()})`
      : `UGX ${settledAmount.toLocaleString()}`;
    await createNotification(
      settledTransaction.userId,
      "Deposit Successful",
      `Your deposit of ${depositLabel} has been confirmed and credited to your recharge balance. Reference: ${transactionId}.`,
      "deposit",
      settledAmount
    );
    await sendChatMessage({
      roomId: "shared",
      sender: "system",
      senderName: "SYSTEM BROADCAST",
      text: `User ${settledTransaction.userId.slice(0, 4)}*** topped up ${depositLabel}!`
    });
  }
  return settledUser;
}


export async function completeSuccessfulWithdrawal(txId: string): Promise<any> {
  const drizzleDb = requireDatabase("settle the withdrawal");
  let settled = false;
  let userId = "";
  let settledPayoutAmount = 0;

  await drizzleDb.transaction(async (tx) => {
    const rows = await tx.select().from(schema.transactions)
      .where(eq(schema.transactions.id, txId))
      .limit(1)
      .for("update");
    const transaction = rows[0];
    if (!transaction) throw new Error("Transaction not found.");

    const currentStatus = String(transaction.status || "").toUpperCase();
    userId = transaction.userId;
    if (currentStatus === "SUCCESSFUL" || currentStatus === "COMPLETED") return;
    if (currentStatus === "FAILED" || currentStatus === "REJECTED") {
      throw new Error("This withdrawal was already rejected.");
    }
    if (transaction.type !== "withdrawal") {
      throw new Error("The transaction is not a withdrawal.");
    }

    const metadata = readJsonRecord(transaction.metadata);
    const payoutAmount = Math.max(0, Number(metadata.payoutAmount ?? transaction.amount));
    settledPayoutAmount = payoutAmount;
    const userRows = await tx.select().from(schema.users)
      .where(eq(schema.users.phone, transaction.userId))
      .limit(1)
      .for("update");
    if (!userRows[0]) throw new Error("The account for this withdrawal no longer exists.");
    await tx.update(schema.users)
      .set({ withdrawnCash: sql`${schema.users.withdrawnCash} + ${payoutAmount}` })
      .where(eq(schema.users.phone, transaction.userId));
    await tx.update(schema.transactions)
      .set({ status: "SUCCESSFUL" })
      .where(eq(schema.transactions.id, txId));
    settled = true;
  });

  const profile = await getUserProfile(userId);
  if (settled && profile) {
    const settledTx = await getTransaction(txId);
    const isUsdtSettle = String((settledTx as any)?.operator || "").toUpperCase() === "USDT";
    const settleConfig = isUsdtSettle ? await getSiteConfig().catch(() => null) : null;
    const settledLabel = isUsdtSettle
      ? `${usdtLabel(settledPayoutAmount, Number((settleConfig as any)?.usdtRate) || 3700)}`
      : `UGX ${settledPayoutAmount.toLocaleString()}`;
    await createNotification(
      userId,
      "Withdrawal Approved",
      `Your withdrawal request has been approved and ${settledLabel} is marked as settled. Reference: ${txId}.`,
      "withdraw",
      settledPayoutAmount
    );
    await sendChatMessage({
      roomId: "shared",
      sender: "system",
      senderName: "SYSTEM BROADCAST",
      text: `User ${userId.slice(0, 4)}*** received ${settledLabel}!`
    });
  }
  return { status: "SUCCESSFUL", profile };
}


export async function completeSuccessfulGpuActivation(
  userId: string,
  itemId?: string,
  transId?: string,
  phone?: string,
  operator?: string,
  amount?: number
): Promise<SubscribedNode> {
  const targetUser = phone || userId;
  const targetItem = itemId || "ds_node_1";
  return await subscribeToItem(targetUser, targetItem);
}


export async function completeFailedTransaction(txId: string) {
  const drizzleDb = requireDatabase("reject the transaction");
  let refunded = false;
  let userId = "";
  let transactionAmount = 0;
  let transactionType = "";

  await drizzleDb.transaction(async (dbTx) => {
    const rows = await dbTx.select().from(schema.transactions)
      .where(eq(schema.transactions.id, txId))
      .limit(1)
      .for("update");
    const transaction = rows[0];
    if (!transaction) throw new Error("Transaction not found.");

    const currentStatus = String(transaction.status || "").toUpperCase();
    userId = transaction.userId;
    transactionAmount = Number(transaction.amount || 0);
    transactionType = String(transaction.type || "").toLowerCase();
    if (currentStatus === "FAILED" || currentStatus === "REJECTED") return;
    if (currentStatus === "SUCCESSFUL" || currentStatus === "COMPLETED") {
      throw new Error("This transaction was already completed.");
    }

    if (transaction.type === "withdrawal") {
      const metadata = transaction.metadata && typeof transaction.metadata === "object"
        ? transaction.metadata as Record<string, any>
        : {};
      const refundAmount = Number(metadata.requestedAmount ?? transaction.amount);
      const userRows = await dbTx.select().from(schema.users)
        .where(eq(schema.users.phone, transaction.userId))
        .limit(1)
        .for("update");
      if (!userRows[0]) throw new Error("The account for this withdrawal no longer exists.");
      await dbTx.update(schema.users)
        .set({ points: sql`${schema.users.points} + ${refundAmount}` })
        .where(eq(schema.users.phone, transaction.userId));
      refunded = true;
    }
    await dbTx.update(schema.transactions)
      .set({ status: "FAILED" })
      .where(eq(schema.transactions.id, txId));
  });

  if (refunded) {
    await createNotification(
      userId,
      "Withdrawal Failed",
      `Your withdrawal of UGX ${transactionAmount.toLocaleString()} could not be completed. The requested amount has been returned to your withdrawable balance. Reference: ${txId}.`,
      "withdraw",
      transactionAmount
    );
  } else if (transactionType === "deposit") {
    await createNotification(
      userId,
      "Deposit Failed",
      `Your deposit of UGX ${transactionAmount.toLocaleString()} could not be confirmed. Reference: ${txId}.`,
      "deposit",
      transactionAmount
    );
  }
  return { status: "FAILED" };
}


export async function autoCollectUserYields(phone: string) {
  const subs = await getUserSubscriptions(phone);
  let totalClaimed = 0;
  for (const sub of subs) {
    try {
      const res = await claimDailyReward(phone, sub.id);
      if (res.success) totalClaimed += res.reward;
    } catch (e) {
      // already claimed today
    }
  }
  return totalClaimed;
}

export async function flushDatabase(): Promise<{ success: boolean; deletedCount: number }> {
  const drizzleDb = getDb();
  if (!drizzleDb) throw new Error("Database not connected");
  const tables = [
    schema.notifications,
    schema.chatMessages,
    schema.transactions,
    schema.subscribedNodes,
    schema.giftCodes,
    schema.catalogProducts,
    schema.announcements,
    schema.users
  ];
  let deletedCount = 0;
  for (const table of tables) {
    const rows = await drizzleDb.select().from(table);
    deletedCount += rows.length;
    await drizzleDb.delete(table);
  }
  await seedDatabaseIfEmpty();
  return { success: true, deletedCount };
}

export async function adminGetAllUsers(): Promise<UserProfile[]> {
  let list: UserProfile[] = [];
  const drizzleDb = getDb();
  if (drizzleDb) {
    try {
      const rows = await drizzleDb.select().from(schema.users);
      if (rows.length > 0) {
        list = rows.map(u => ({
          phone: u.phone,
          username: u.username,
          inviteCode: u.inviteCode,
          referredByCode: u.referredByCode || "",
          operator: u.operator || "MTN",
          points: u.points,
          rechargeBalance: u.rechargeBalance,
          withdrawnCash: u.withdrawnCash,
          totalDeposits: u.totalDeposits,
          aiIncome: u.aiIncome,
          invitesCount: u.invitesCount,
          referralRewardsEarned: u.referralRewardsEarned,
          claimedVipTasks: readJsonStringArray(u.claimedVipTasks),
          locked: u.locked,
          usdtAddress: u.usdtAddress || "",
          lastCheckinDate: u.lastCheckinDate || "",
          checkinStreak: u.checkinStreak,
          redeemedGiftCodes: readJsonStringArray(u.redeemedGiftCodes),
          createdAt: u.createdAt
        }));
      }
    } catch (err) {
      console.warn("[Database] adminGetAllUsers error:", err);
    }
  }

  // Attach accurate active products count for every user profile
  const allSubs = drizzleDb
    ? await drizzleDb.select().from(schema.subscribedNodes)
    : [];
  const subsByUser = new Map<string, typeof allSubs>();
  for (const sub of allSubs) {
    const current = subsByUser.get(sub.userId);
    if (current) current.push(sub);
    else subsByUser.set(sub.userId, [sub]);
  }
  return list.map(u => {
    const userActiveSubs = (subsByUser.get(u.phone) || []).filter(s => s.status === "active");
    return {
      ...u,
      activeNodesCount: userActiveSubs.length,
      activeProductsCount: userActiveSubs.length,
      activeSubscriptions: userActiveSubs
    } as any;
  });
}

export async function adminOverridePassword(phone: string, newPass: string) {
  return await updateUserProfile(phone, { password: newPass });
}

export async function adminGetAllTransactions(): Promise<any[]> {
  let list: any[] = [];
  const drizzleDb = getDb();
  if (drizzleDb) {
    try {
      list = await drizzleDb.select().from(schema.transactions);
    } catch (err) {
      console.warn("[Database] adminGetAllTransactions error:", err);
    }
  }
  return list.sort((a, b) => {
    const tA = new Date(a.timestamp || a.createdAt || a.date || 0).getTime();
    const tB = new Date(b.timestamp || b.createdAt || b.date || 0).getTime();
    return tB - tA; // Newest first
  });
}


export async function adminUpdateTransactionStatus(txId: string, status: string) {
  const normalizedStatus = String(status || "").toUpperCase();
  if (!["PENDING", "SUCCESSFUL", "COMPLETED", "FAILED"].includes(normalizedStatus)) {
    throw new Error("Unsupported transaction status.");
  }
  const transaction = await getTransaction(txId);
  if (!transaction) throw new Error("Transaction was not found.");

  const isWithdrawal = transaction.type === "withdrawal";
  const isAutomaticWithdrawal = isWithdrawal && String(transaction.mode || "").toLowerCase() === "automatic";
  if (isAutomaticWithdrawal && normalizedStatus !== "PENDING") {
    throw new Error("This withdrawal is settled only by the payment-provider webhook.");
  }

  if (normalizedStatus === "SUCCESSFUL" || normalizedStatus === "COMPLETED") {
    if (transaction.type === "deposit") {
      await completeSuccessfulDeposit(transaction.userId, transaction.amount, transaction.phone || undefined, transaction.operator || undefined, transaction.id);
      return { status: "SUCCESSFUL" };
    }
    if (isWithdrawal) return await completeSuccessfulWithdrawal(txId);
    throw new Error("Only deposits and withdrawals can be settled from the transaction table.");
  }

  if (normalizedStatus === "FAILED") {
    return await completeFailedTransaction(txId);
  }

  const drizzleDb = requireDatabase("update the transaction status");
  try {
    await drizzleDb.update(schema.transactions)
      .set({ status: "PENDING" })
      .where(eq(schema.transactions.id, txId));
    return { status: "PENDING" };
  } catch (err) {
    throw databaseFailure("update the transaction status", err);
  }
}


export async function adminGetCatalogItems() {
  const items = await getSubscriptionItems();
  const drizzleDb = getDb();
  const allSubs = drizzleDb ? await drizzleDb.select().from(schema.subscribedNodes) : [];

  // Attach activeSubscribers count to each product item
  return items.map(item => {
    const activeSubCount = allSubs.filter(s => s.itemId === item.id && s.status === "active").length;
    return {
      ...item,
      activeSubscribers: activeSubCount
    };
  });
}

export async function adminSaveCatalogItem(item: SubscriptionItem) {
  const drizzleDb = requireDatabase("save the catalog product");
  try {
    await drizzleDb.insert(schema.catalogProducts).values({
      id: item.id,
      name: item.name,
      image: item.image || item.imageUrl || "",
      imageUrl: item.imageUrl || item.image || "",
      amount: item.amount,
      duration: item.duration,
      dailyYield: item.dailyYield,
      category: item.category || "DS",
      inviteBonusPercent: Number(item.inviteBonusPercent || 0),
      outOfStock: item.outOfStock === true,
      disabled: item.disabled === true
    }).onDuplicateKeyUpdate({ set: {
      name: item.name,
      image: item.image || item.imageUrl || "",
      imageUrl: item.imageUrl || item.image || "",
      amount: item.amount,
      duration: item.duration,
      dailyYield: item.dailyYield,
      category: item.category || "DS",
      inviteBonusPercent: Number(item.inviteBonusPercent || 0),
      outOfStock: item.outOfStock === true,
      disabled: item.disabled === true
    } });
  } catch (err) {
    throw databaseFailure("save the catalog product", err);
  }
}

export async function adminDeleteCatalogItem(itemId: string) {
  const drizzleDb = getDb();
  if (drizzleDb) {
    try {
      await drizzleDb.delete(schema.catalogProducts).where(eq(schema.catalogProducts.id, itemId));
    } catch (err) {
      console.warn("[Database] adminDeleteCatalogItem error:", err);
    }
  }
}


export async function adminDeleteAllCatalogItems(): Promise<{ count: number }> {
  const drizzleDb = getDb();
  if (drizzleDb) {
    const rows = await drizzleDb.select().from(schema.catalogProducts);
    await drizzleDb.delete(schema.catalogProducts);
    return { count: rows.length };
  }
  return { count: 0 };
}


export async function adminCreateGiftCode(code: string, amount: number, maxRedemptions: number = 1, expiryDate?: string) {
  const gift = {
    id: "gift_" + crypto.randomBytes(6).toString("hex"),
    code: code.toUpperCase(),
    amount,
    maxRedemptions,
    currentRedemptions: 0,
    expiryDate: expiryDate || new Date(Date.now() + 30 * 86400000).toISOString(),
    status: "active",
    createdAt: new Date().toISOString()
  };

  const drizzleDb = getDb();
  if (drizzleDb) {
    try {
      await drizzleDb.insert(schema.giftCodes).values({
        id: gift.id,
        code: gift.code,
        amount: gift.amount,
        maxRedemptions: gift.maxRedemptions,
        currentRedemptions: gift.currentRedemptions,
        expiryDate: gift.expiryDate,
        status: gift.status,
        createdAt: gift.createdAt
      });
    } catch (err) {
      console.warn("[Database] adminCreateGiftCode error:", err);
    }
  }
  return gift;
}

export async function adminGetGiftCodes() {
  const drizzleDb = getDb();
  if (!drizzleDb) return [];
  return drizzleDb.select().from(schema.giftCodes).orderBy(desc(schema.giftCodes.createdAt));
}

export async function adminDeleteGiftCode(code: string) {
  const drizzleDb = getDb();
  if (drizzleDb) {
    await drizzleDb.delete(schema.giftCodes).where(eq(schema.giftCodes.code, code.trim().toUpperCase()));
  }
}


export async function redeemGiftCode(phone: string, code: string) {
  const drizzleDb = getDb();
  if (drizzleDb) {
    const cleanCode = code.trim().toUpperCase();
    const gifts = await drizzleDb.select().from(schema.giftCodes).where(eq(schema.giftCodes.code, cleanCode));
    if (gifts.length === 0) throw new Error("Invalid or expired gift code.");
    const gift = gifts[0];
    const userRows = await drizzleDb.select().from(schema.users).where(eq(schema.users.phone, phone));
    if (userRows.length === 0) throw new Error("User not found");
    const user = userRows[0];
    const redeemed = (user.redeemedGiftCodes as string[]) || [];
    if (redeemed.includes(cleanCode)) throw new Error("You have already redeemed this code.");
    
    redeemed.push(cleanCode);
    const newPoints = (user.points || 0) + gift.amount;
    await drizzleDb.update(schema.users).set({ points: newPoints, redeemedGiftCodes: redeemed }).where(eq(schema.users.phone, phone));

    const newTxId = "tx_" + Date.now();
    await drizzleDb.insert(schema.transactions).values({
      id: newTxId,
      userId: phone,
      type: "gift_code",
      amount: gift.amount,
      status: "SUCCESSFUL",
      currency: "UGX",
      paymentMethod: "GIFT_CODE",
      mode: "auto",
      timestamp: new Date().toISOString()
    });
    return { amount: gift.amount };
  }
  throw new Error("DB not connected");
}


export async function dailyCheckin(phone: string) {
  const user = await getUserProfile(phone);
  if (!user) throw new Error("User not found");

  const today = new Date().toISOString().split("T")[0];
  if (user.lastCheckinDate === today) {
    throw new Error("You have already checked in today.");
  }

  const config = await getSiteConfig();
  const base = (config.checkinBaseBonus !== undefined && config.checkinBaseBonus !== null) ? config.checkinBaseBonus : 1000;
  const inc = (config.checkinIncrement !== undefined && config.checkinIncrement !== null) ? config.checkinIncrement : 100;
  // A streak is consecutive days only: claiming after a missed day restarts
  // at 1 instead of inflating forever. The calendar UI renders this same
  // rule, so previews and payouts can never disagree.
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const previousStreak = Number(user.checkinStreak || 0);
  const streakKept = user.lastCheckinDate === yesterday;
  const currentStreak = streakKept ? previousStreak + 1 : 1;
  const bonus = base + ((currentStreak - 1) * inc);

  // Credit directly to withdrawable balance (points)!
  user.points = (user.points || 0) + bonus;
  user.lastCheckinDate = today;
  user.checkinStreak = currentStreak;
  await updateUserProfile(phone, { points: user.points, lastCheckinDate: today, checkinStreak: user.checkinStreak });

  // Record transaction in history
  await saveTransaction({
    id: "chk_" + crypto.randomBytes(8).toString("hex"),
    userId: phone,
    type: "daily_checkin_bonus",
    amount: bonus,
    currency: "UGX",
    status: "SUCCESSFUL",
    paymentMethod: "CHECKIN",
    phone: phone,
    itemId: `day_${currentStreak}`,
    mode: "auto",
    timestamp: new Date().toISOString()
  });

  // Create notification alert
  await createNotification(
    phone,
    "Daily Check-in Reward",
    `You checked in successfully for Day ${currentStreak} and earned UGX ${bonus.toLocaleString()} credited to your withdrawable balance!`,
    "checkin"
  );

  return { amount: bonus, bonus, streak: user.checkinStreak, reset: !streakKept && previousStreak > 1 };
}

export async function getVipTaskboard(phone: string) {
  const user = await getUserProfile(phone);
  if (!user) throw new Error("User not found");

  const config = await getSiteConfig();
  const configuredTasks = Array.isArray(config.vipTasks) ? config.vipTasks : [];
  const referrals = await getReferreeStatsList(phone);
  const rawLevel1Bonus = referrals.filter((ref) => Number(ref.level) === 1).reduce((sum, ref) => sum + Number(ref.rewardAmount || 0), 0);
  const level2Bonus = referrals.filter((ref) => Number(ref.level) === 2).reduce((sum, ref) => sum + Number(ref.rewardAmount || 0), 0);
  const level3Bonus = referrals.filter((ref) => Number(ref.level) === 3).reduce((sum, ref) => sum + Number(ref.rewardAmount || 0), 0);
  const level4Bonus = referrals.filter((ref) => Number(ref.level) === 4).reduce((sum, ref) => sum + Number(ref.rewardAmount || 0), 0);
  const reportedReferralIncome = Math.max(0, Number(user.referralRewardsEarned || 0));
  const reportedByLevel = rawLevel1Bonus + level2Bonus + level3Bonus + level4Bonus;
  const legacyUnallocated = Math.max(0, reportedReferralIncome - reportedByLevel);
  const level1Bonus = rawLevel1Bonus + legacyUnallocated;
  const totalReferralBonus = Math.max(reportedReferralIncome, rawLevel1Bonus + level2Bonus + level3Bonus + level4Bonus);
  // Milestones qualify on operator lifetime points: gross credited ledger
  // income across every type that pays withdrawable balance (yields,
  // referrals, check-ins, gifts, milestones, registration). requiredBonus is
  // the points threshold. Keep accumulatedBonus populated for compatibility.
  const accumulatedBonus = totalReferralBonus;
  const drizzleDb = requireDatabase("total operator points");
  const opResult: any = await drizzleDb.execute(sql`SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE user_id = ${phone} AND type IN ('daily_yield', 'referral_signup_bonus', 'referral_level_income', 'daily_checkin_bonus', 'gift_code', 'vip_task', 'registration_bonus') AND UPPER(status) IN ('SUCCESSFUL', 'COMPLETED')`);
  const opRows = Array.isArray(opResult?.[0]) ? opResult[0] : [];
  const operatorPoints = Math.max(0, Number(opRows?.[0]?.total ?? 0));
  const claimed = user.claimedVipTasks || [];

  // Per-milestone event metrics for the mockup one-shots (First Run,
  // 7-Day Streak, First 100K, Clean Exit, Still Running). Tasks created
  // before metrics existed carry no `metric` key and keep the legacy
  // operator-points ladder behaviour, so existing rows keep working.
  const streakDays = Math.max(0, Number((user as any).checkinStreak || 0));
  let runsStarted = 0, activeRuns = 0, completedRuns = 0, lifetimeYield = 0;
  try {
    const statRows: any[] = await drizzleDb.select({
      started: sql`count(*)`,
      active: sql`COALESCE(SUM(CASE WHEN UPPER(${schema.subscribedNodes.status}) = 'ACTIVE' THEN 1 ELSE 0 END), 0)`,
      completed: sql`COALESCE(SUM(CASE WHEN UPPER(${schema.subscribedNodes.status}) = 'COMPLETED' THEN 1 ELSE 0 END), 0)`,
      earned: sql`COALESCE(SUM(${schema.subscribedNodes.totalEarned}), 0)`
    }).from(schema.subscribedNodes).where(eq(schema.subscribedNodes.userId, phone));
    const stats = statRows?.[0] || {};
    runsStarted = Number(stats.started || 0);
    activeRuns = Number(stats.active || 0);
    completedRuns = Number(stats.completed || 0);
    lifetimeYield = Math.max(0, Number(stats.earned || 0));
  } catch {
    // Metrics default to zero; the points ladder still works.
  }
  const metricValue = (metric: string): number => {
    switch (metric) {
      case "runs_started": return runsStarted;
      case "active_runs": return activeRuns;
      case "completed_runs": return completedRuns;
      case "streak_days": return streakDays;
      case "lifetime_yield": return lifetimeYield;
      default: return operatorPoints;
    }
  };

  const tasks = configuredTasks
    .filter((task: any) => task && task.active !== false)
    .map((task: any) => {
      const threshold = Math.max(0, Number(task.requiredBonus || 0));
      const metric = String(task.metric || "operator_points");
      const progress = metricValue(metric);
      const art = String(task.imageUrl || "").trim();
      return {
        id: String(task.id),
        title: String(task.title || "Milestone Task"),
        description: String(task.description || "Unlock this reward with operator points."),
        category: String(task.category || "Milestone"),
        metric,
        requiredBonus: threshold,
        reward: Math.max(0, Number(task.reward || 0)),
        ...(art ? { imageUrl: art } : {}),
        progress,
        unlocked: progress >= threshold,
        claimed: claimed.includes(String(task.id))
      };
    })
    .sort((a, b) => a.requiredBonus - b.requiredBonus);

  // VIP rank follows the published task ladder, not referral-count guesses or
  // task-id parsing. A user reaches the highest task that their server-side
  // Combined Level 1–4 bonus has unlocked or that they have already claimed.
  // If categories are labeled 0..N (e.g. VIP 0 → VIP 4), respect the numeric
  // category value so a user with 4 unlocked 0..3 shows VIP 3 not VIP 4.
  const vipLevel = tasks.reduce((highest, task) => {
    if (!(task.unlocked || task.claimed)) return highest;
    const raw = String(task.category || "");
    const parsed = parseInt(raw.replace(/\D/g, ""), 10);
    const level = Number.isFinite(parsed) && raw.replace(/\D/g, "") !== "" ? parsed : tasks.indexOf(task) + 1;
    return Math.max(highest, level);
  }, 0);

  return {
    tasks,
    vipLevel,
    referralRates: {
      level1: Number(config.level1InviteIncomePct ?? 15),
      level2: Number(config.level2InviteIncomePct ?? 5),
      level3: Number(config.level3InviteIncomePct ?? 0),
      level4: Number(config.level4InviteIncomePct ?? 0)
    },
    progress: {
      level1Bonus,
      level2Bonus,
      level3Bonus,
      level4Bonus,
      accumulatedBonus,
      totalReferralBonus,
      operatorPoints
    }
  };
}

export async function claimVipTask(phone: string, taskId: string) {
  const board = await getVipTaskboard(phone);
  const task = board.tasks.find((candidate) => candidate.id === taskId);
  if (!task) throw new Error("This milestone is not currently available.");
  if (!task.unlocked) throw new Error("Keep earning operator points to unlock this milestone.");
  if (task.claimed) throw new Error("Milestone reward already claimed.");

  const drizzleDb = requireDatabase("claim the VIP task");
  let claimedVipTasks: string[] = [];
  await drizzleDb.transaction(async (tx) => {
    const userRows = await tx.select().from(schema.users)
      .where(eq(schema.users.phone, phone))
      .limit(1)
      .for("update");
    const user = userRows[0];
    if (!user) throw new Error("User not found");
    claimedVipTasks = readJsonStringArray(user.claimedVipTasks);
    if (claimedVipTasks.includes(task.id)) throw new Error("Milestone reward already claimed.");
    claimedVipTasks.push(task.id);

    // Credit directly to withdrawable balance (points)! The reward and
    // requirement come from server-side site configuration, never the client.
    await tx.update(schema.users).set({
      points: sql`${schema.users.points} + ${task.reward}`,
      claimedVipTasks
    }).where(eq(schema.users.phone, phone));
  });

  // Record transaction in history
  await saveTransaction({
    id: "vip_" + crypto.randomBytes(8).toString("hex"),
    userId: phone,
    type: "vip_task",
    amount: task.reward,
    currency: "UGX",
    status: "SUCCESSFUL",
    paymentMethod: "VIP_TASK",
    phone: phone,
    itemId: taskId,
    mode: "auto",
    timestamp: new Date().toISOString()
  });

  // Create notification alert
  await createNotification(
    phone,
    "Milestone Reward Claimed",
    `Successfully claimed milestone reward of UGX ${task.reward.toLocaleString()} credited to your withdrawable balance!`,
    "rewards"
  );

  await sendChatMessage({
    roomId: "shared",
    sender: "system",
    senderName: "SYSTEM BROADCAST",
    text: `User ${phone.slice(0, 4)}*** claimed a milestone reward of UGX ${task.reward.toLocaleString()}!`
  });

  return { bonus: task.reward, claimedVipTasks };
}

export async function adminUpdateUserLockStatus(phone: string, locked: boolean) {
  return await updateUserProfile(phone, { locked });
}

export async function adminCreateAnnouncement(title: string, message: string, readMoreLink?: string, category?: string, imageUrl?: string, tag?: string) {
  const anc = {
    id: "anc_" + crypto.randomBytes(6).toString("hex"),
    title,
    message,
    readMoreLink,
    category,
    imageUrl,
    tag,
    createdAt: new Date().toISOString()
  };
  const drizzleDb = getDb();
  if (drizzleDb) {
    await drizzleDb.insert(schema.announcements).values(anc);
  }
  return anc;
}


export async function adminUpdateAnnouncement(id: string, title: string, message: string, readMoreLink?: string, category?: string, imageUrl?: string, tag?: string) {
  const drizzleDb = getDb();
  if (drizzleDb) {
    await drizzleDb.update(schema.announcements).set({ title, message, readMoreLink, category, imageUrl, tag }).where(eq(schema.announcements.id, id));
  }
}

export async function adminGetAnnouncements() {
  const drizzleDb = getDb();
  if (drizzleDb) {
    return drizzleDb.select().from(schema.announcements).orderBy(desc(schema.announcements.createdAt));
  }
  return [];
}

export async function adminDeleteAnnouncement(id: string) {
  const drizzleDb = getDb();
  if (drizzleDb) {
    await drizzleDb.delete(schema.announcements).where(eq(schema.announcements.id, id));
  }
}

export async function adminGetChatConversations() {
  const drizzleDb = getDb();
  if (drizzleDb) {
    const rows = await drizzleDb.select().from(schema.chatMessages);
    const directMsgs = rows.filter(m => m.roomId && m.roomId.startsWith("direct_"));
    const convoMap = new Map<string, { roomId: string; userPhone: string; userName: string; lastMessage: string; lastTimestamp: string }>();

    for (const msg of directMsgs) {
      const userPhone = msg.roomId.replace("direct_", "");
      const existing = convoMap.get(msg.roomId);
      if (!existing || new Date(msg.timestamp).getTime() > new Date(existing.lastTimestamp).getTime()) {
        convoMap.set(msg.roomId, {
          roomId: msg.roomId,
          userPhone,
          userName: msg.senderName || userPhone,
          lastMessage: msg.text || (msg.image ? "[Attachment Image]" : ""),
          lastTimestamp: msg.timestamp
        });
      }
    }
    return Array.from(convoMap.values()).sort((a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime());
  }
  return [];
}

export async function getSiteConfig(): Promise<SiteConfig> {
  const drizzleDb = requireDatabase("load site configuration");
  try {
    const rows = await drizzleDb.select().from(schema.siteConfig).where(eq(schema.siteConfig.id, "main")).limit(1);
    if (rows.length > 0 && rows[0].configJson) {
      const parsed = parseJsonField<Record<string, any>>(rows[0].configJson, {});
      // Drop numeric keys left by a legacy string-spread write so a repaired
      // config never carries char-index garbage alongside real settings.
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const key of Object.keys(parsed)) {
          if (key !== "" && Number.isInteger(Number(key))) delete (parsed as any)[key];
        }
        return parsed as SiteConfig;
      }
    }
    return {};
  } catch (err) {
    throw databaseFailure("load site configuration", err);
  }
}

export async function updateSiteConfig(newConfig: Partial<SiteConfig>): Promise<SiteConfig> {
  const drizzleDb = requireDatabase("save site configuration");
  try {
    const rawCurrent = await getSiteConfig().catch(() => ({}));
    // Never spread a raw driver string: on MariaDB the JSON column reads back
    // as text, and spreading it writes char-index garbage ("0","1",... keys).
    const current = (rawCurrent && typeof rawCurrent === "object" && !Array.isArray(rawCurrent))
      ? rawCurrent
      : {};
    // hut12 tokens — sanitize merged config to heal stale presets
    const mergedRaw = { ...current, ...newConfig } as SiteConfig & Record<string, any>;
    const sanitizedTokens = sanitizeSiteConfig(mergedRaw);
    const updated = { ...mergedRaw, ...sanitizedTokens } as SiteConfig & Record<string, any>;

    if ("adminPass" in newConfig) {
      const incoming = (newConfig as any).adminPass;
      if (typeof incoming === "string" && incoming.length > 0) {
        updated.adminPass = isPasswordHashed(incoming) ? incoming : hashPassword(incoming);
      } else {
        updated.adminPass = (current as any).adminPass || "";
      }
    }

    if (Array.isArray(updated.vipTaskCategories)) {
      updated.vipTaskCategories = dedupeCategories(updated.vipTaskCategories);
    }

    if (Array.isArray(updated.vipTasks)) {
      updated.vipTasks = updated.vipTasks
        .filter((task: any) => task && String(task.id || "").trim() && String(task.title || "").trim())
        .map((task: any) => normalizeVipTask(task));
    }

    updated.minimumDeposit = getMinimumDepositAmount(updated);
    updated.maximumDeposit = getMaximumDepositAmount(updated);
    updated.minimumWithdrawal = getMinimumWithdrawalAmount(updated);
    updated.maximumWithdrawal = getMaximumWithdrawalAmount(updated);

    if (updated.maximumDeposit > 0 && updated.maximumDeposit < updated.minimumDeposit) {
      throw new SiteConfigValidationError("Maximum deposit cannot be lower than minimum deposit.");
    }
    if (updated.maximumWithdrawal > 0 && updated.maximumWithdrawal < updated.minimumWithdrawal) {
      throw new SiteConfigValidationError("Maximum withdrawal cannot be lower than minimum withdrawal.");
    }

    await drizzleDb.insert(schema.siteConfig).values({ id: "main", configJson: updated }).onDuplicateKeyUpdate({ set: { configJson: updated } });
    return updated;
  } catch (err) {
    if (err instanceof SiteConfigValidationError) throw err;
    throw databaseFailure("save site configuration", err);
  }
}
