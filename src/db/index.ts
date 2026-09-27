import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import * as schema from "./schema";

export type AppDb = ReturnType<typeof drizzle<typeof schema>>;

let dbInstance: AppDb | null = null;
let poolInstance: mysql.Pool | null = null;

export function getDb(): AppDb | null {
  if (dbInstance) return dbInstance;

  const dbUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;

  if (!dbUrl) {
    return null;
  }

  try {
    const urlObj = new URL(dbUrl);
    if (urlObj.protocol !== "mysql:") {
      throw new Error(`Unsupported database URL protocol: ${urlObj.protocol}`);
    }

    const database = decodeURIComponent(urlObj.pathname.replace(/^\//, ""));
    if (!database) throw new Error("DATABASE_URL must include a database name");
    
    // Build connection config object
    const config: mysql.PoolOptions = {
      host: urlObj.hostname,
      port: Number(urlObj.port || 3306),
      user: decodeURIComponent(urlObj.username),
      password: decodeURIComponent(urlObj.password),
      database,
      waitForConnections: true,
      connectionLimit: 50,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    };
    
    if (process.env.DB_SSL === "true" || process.env.SSL_MODE?.toUpperCase() === "REQUIRED") {
      config.ssl = {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true",
      };
    }
    
    if (!poolInstance) {
      poolInstance = mysql.createPool(config);
    }

    dbInstance = drizzle(poolInstance, { schema, mode: "default" });
    return dbInstance;
  } catch (e) {
    console.error("[Database] Invalid DATABASE_URL/MYSQL_URL:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Creates the application's tables without dropping or changing existing data.
 * This is intentionally provider-neutral: the connection URL selects the server,
 * and the SQL below is standard MySQL 8/MariaDB-compatible DDL.
 */
export async function ensureDatabaseSchema(): Promise<void> {
  const db = getDb();
  if (!db || !poolInstance) {
    throw new Error("DATABASE_URL or MYSQL_URL is not configured");
  }

  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      phone VARCHAR(32) NOT NULL PRIMARY KEY,
      username VARCHAR(64) NOT NULL,
      password VARCHAR(255) NOT NULL,
      invite_code VARCHAR(32) NOT NULL UNIQUE,
      referred_by_code VARCHAR(32) DEFAULT '',
      operator VARCHAR(16) DEFAULT 'MTN',
      points DOUBLE NOT NULL DEFAULT 0,
      recharge_balance DOUBLE NOT NULL DEFAULT 0,
      withdrawn_cash DOUBLE NOT NULL DEFAULT 0,
      total_deposits DOUBLE NOT NULL DEFAULT 0,
      ai_income DOUBLE NOT NULL DEFAULT 0,
      invites_count INT NOT NULL DEFAULT 0,
      referral_rewards_earned DOUBLE NOT NULL DEFAULT 0,
      claimed_vip_tasks JSON NOT NULL,
      claimed_tier_rewards JSON NULL,
      locked BOOLEAN NOT NULL DEFAULT FALSE,
      usdt_address VARCHAR(255) DEFAULT '',
      last_checkin_date VARCHAR(32) DEFAULT '',
      checkin_streak INT NOT NULL DEFAULT 0,
      redeemed_gift_codes JSON NOT NULL,
      created_at VARCHAR(64) NOT NULL,
      INDEX idx_users_invite_code (invite_code),
      INDEX idx_users_referred_by (referred_by_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS subscribed_nodes (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      user_id VARCHAR(32) NOT NULL,
      item_id VARCHAR(64) NOT NULL,
      item_name VARCHAR(128) NOT NULL,
      image VARCHAR(255) NOT NULL,
      amount DOUBLE NOT NULL,
      duration INT NOT NULL,
      daily_yield DOUBLE NOT NULL,
      start_date VARCHAR(64) NOT NULL,
      end_date VARCHAR(64) NOT NULL,
      last_claimed_date VARCHAR(32) NOT NULL,
      total_earned DOUBLE NOT NULL DEFAULT 0,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      INDEX idx_subscribed_nodes_user_id (user_id),
      INDEX idx_subscribed_nodes_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS catalog_products (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      image VARCHAR(255) NOT NULL,
      image_url VARCHAR(512) DEFAULT '',
      amount DOUBLE NOT NULL,
      duration INT NOT NULL,
      daily_yield DOUBLE NOT NULL,
      category VARCHAR(32) NOT NULL DEFAULT 'DS',
      invite_bonus_percent DOUBLE NOT NULL DEFAULT 0,
      out_of_stock BOOLEAN NOT NULL DEFAULT FALSE,
      disabled BOOLEAN NOT NULL DEFAULT FALSE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      user_id VARCHAR(32) NOT NULL,
      category VARCHAR(32) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      amount DOUBLE DEFAULT 0,
      timestamp VARCHAR(64) NOT NULL,
      INDEX idx_notifications_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS chat_messages (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      room_id VARCHAR(64) NOT NULL,
      sender VARCHAR(64) NOT NULL,
      sender_name VARCHAR(64) NOT NULL,
      text TEXT NOT NULL,
      image TEXT NULL,
      timestamp VARCHAR(64) NOT NULL,
      INDEX idx_chat_messages_room_id (room_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS gift_codes (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      code VARCHAR(64) NOT NULL UNIQUE,
      amount DOUBLE NOT NULL,
      max_redemptions INT NOT NULL DEFAULT 1,
      current_redemptions INT NOT NULL DEFAULT 0,
      expiry_date VARCHAR(64) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      created_at VARCHAR(64) NOT NULL,
      INDEX idx_gift_codes_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS site_config (
      id VARCHAR(32) NOT NULL PRIMARY KEY,
      config_json JSON NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      user_id VARCHAR(32) NOT NULL,
      type VARCHAR(32) NOT NULL,
      amount DOUBLE NOT NULL,
      currency VARCHAR(8) NOT NULL DEFAULT 'UGX',
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      payment_method VARCHAR(64) NULL,
      phone VARCHAR(32) NULL,
      usdt_address VARCHAR(255) NULL,
      item_id VARCHAR(64) NULL,
      operator VARCHAR(16) NULL,
      mode VARCHAR(16) NULL,
      metadata JSON NULL,
      balance_applied_at VARCHAR(64) NULL,
      timestamp VARCHAR(64) NOT NULL,
      INDEX idx_transactions_user_id (user_id),
      INDEX idx_transactions_status (status),
      INDEX idx_transactions_user_status_type (user_id, status, type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS announcements (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      read_more_link VARCHAR(512) NULL,
      category VARCHAR(32) NULL,
      image_url VARCHAR(512) NULL,
      tag VARCHAR(64) NULL,
      created_at VARCHAR(64) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ];

  const connection = poolInstance.promise();
  for (const statement of statements) {
    await connection.query(statement);
  }

  // CREATE TABLE IF NOT EXISTS does not alter a database created by an older
  // release. Keep this migration small and idempotent so existing deposits are
  // preserved while the settlement guard is introduced.
  try {
    await connection.query("ALTER TABLE transactions ADD COLUMN balance_applied_at VARCHAR(64) NULL");
  } catch (error: any) {
    if (!String(error?.code || "").includes("DUPLICATE") && error?.errno !== 1060) {
      throw error;
    }
  }

  // Journey stage rewards: one claim per tier, tracked per user.
  try {
    await connection.query("ALTER TABLE users ADD COLUMN claimed_tier_rewards JSON NULL");
  } catch (error: any) {
    if (!String(error?.code || "").includes("DUPLICATE") && error?.errno !== 1060) {
      throw error;
    }
  }

  // Full tx-type migration to canonical names (no users: full migrate).
  try {
    await connection.query(`UPDATE transactions SET type = CASE
      WHEN LOWER(type) IN ('balance','manual') THEN 'deposit'
      WHEN LOWER(type) = 'deposit' THEN 'deposit'
      WHEN LOWER(type) IN ('withdraw','withdrawal') THEN 'withdrawal'
      WHEN LOWER(type) IN ('gift','register','bonus','reward') THEN 'registration_bonus'
      WHEN LOWER(type) IN ('checkin','checkin_bonus') THEN 'daily_checkin_bonus'
      WHEN LOWER(type) = 'voucher' THEN 'gift_code'
      WHEN LOWER(type) = 'referral' AND JSON_EXTRACT(metadata, '$.level') IS NOT NULL AND JSON_EXTRACT(metadata, '$.level') != 'null' THEN 'referral_level_income'
      WHEN LOWER(type) = 'referral' THEN 'referral_signup_bonus'
      WHEN LOWER(type) = 'vip_task' THEN 'vip_task'
      WHEN LOWER(type) IN ('gpu','gpu_activation','subscription') THEN 'product_activation'
      WHEN LOWER(type) IN ('yield','daily','daily accumulation') THEN 'daily_yield'
      ELSE type
    END WHERE LOWER(type) IN (
      'balance','manual','withdraw','gift','register','bonus','reward',
      'checkin','checkin_bonus','voucher','referral','gpu','gpu_activation','subscription','yield','daily','daily accumulation'
    ) OR type IN ('withdrawal','deposit','vip_task')`);
  } catch (error: any) {
    if (String(error?.code || "").includes("ER_NO_SUCH_TABLE")) {
      // table just created above; nothing to migrate
    } else {
      throw error;
    }
  }

  // Backfill product_activation metadata.sourceItemName/sourceItemId from catalog/out-of-band.
  try {
    await connection.query(`UPDATE transactions t
      LEFT JOIN subscribed_nodes sn ON JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.subscriptionId')) = sn.id
      LEFT JOIN catalog_products cp ON cp.id = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.sourceItemId')), t.item_id, sn.item_id)
      SET t.metadata = JSON_SET(
        COALESCE(t.metadata, JSON_OBJECT()),
        '$.sourceItemName', COALESCE(JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.sourceItemName')), cp.name, sn.item_name, t.item_id),
        '$.sourceItemId', COALESCE(JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.sourceItemId')), t.item_id, sn.item_id, cp.id)
      )
      WHERE LOWER(t.type) = 'product_activation'
        AND (JSON_EXTRACT(t.metadata, '$.sourceItemName') IS NULL OR JSON_EXTRACT(t.metadata, '$.sourceItemId') IS NULL)`);
  } catch (error: any) {
    // best-effort backfill; ignore if catalog/subscribed_nodes missing or metadata not JSON
    if (!String(error?.code || "").includes("ER_NO_SUCH_TABLE") && !String(error?.message || "").includes("JSON")) {
      throw error;
    }
  }

  // Backfill daily_yield (Income) metadata for history product name/image without catalog fetch.
  try {
    await connection.query(`UPDATE transactions t
      LEFT JOIN subscribed_nodes sn ON JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.subscriptionId')) = sn.id
      LEFT JOIN catalog_products cp ON cp.id = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.sourceItemId')), t.item_id, sn.item_id)
      SET t.metadata = JSON_SET(
        COALESCE(t.metadata, JSON_OBJECT()),
        '$.sourceItemName', COALESCE(JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.sourceItemName')), cp.name, sn.item_name),
        '$.sourceItemId', COALESCE(JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.sourceItemId')), t.item_id, sn.item_id, cp.id),
        '$.sourceItemImage', COALESCE(JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.sourceItemImage')), cp.image_url, cp.image, sn.image)
      )
      WHERE LOWER(t.type) = 'daily_yield'
        AND (JSON_EXTRACT(t.metadata, '$.sourceItemName') IS NULL OR JSON_EXTRACT(t.metadata, '$.sourceItemId') IS NULL OR JSON_EXTRACT(t.metadata, '$.sourceItemImage') IS NULL)`);
  } catch (error: any) {
    if (!String(error?.code || "").includes("ER_NO_SUCH_TABLE") && !String(error?.message || "").includes("JSON")) {
      throw error;
    }
  }

  // Repair daily_yield rows whose sourceItemImage is a non-URL value (legacy
  // catalog `image` fields hold Tailwind gradient keys, not URLs). The
  // backfill above only covers NULLs; these rows carry an explicit gradient
  // string that browsers cannot render, so resolve them from the catalog.
  try {
    await connection.query(`UPDATE transactions t
      LEFT JOIN catalog_products cp ON cp.id = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.sourceItemId')), t.item_id)
      SET t.metadata = JSON_SET(
        t.metadata,
        '$.sourceItemImage', COALESCE(cp.image_url, cp.image)
      )
      WHERE LOWER(t.type) = 'daily_yield'
        AND JSON_EXTRACT(t.metadata, '$.sourceItemImage') IS NOT NULL
        AND JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.sourceItemImage')) NOT LIKE 'http%'
        AND JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.sourceItemImage')) NOT LIKE 'data:%'
        AND COALESCE(cp.image_url, cp.image) LIKE 'http%'`);
  } catch (error: any) {
    if (!String(error?.code || "").includes("ER_NO_SUCH_TABLE") && !String(error?.message || "").includes("JSON")) {
      throw error;
    }
  }

  try {
    await connection.query("UPDATE transactions SET status = UPPER(status) WHERE LOWER(status) IN ('completed','successful','pending','failed') AND status != UPPER(status)");
  } catch (error: any) {
    if (String(error?.code || "").includes("ER_NO_SUCH_TABLE")) {
      // table just created above; nothing to normalize
    } else {
      throw error;
    }
  }

  try {
    await connection.query("ALTER TABLE notifications ADD COLUMN amount DOUBLE DEFAULT 0");
  } catch (error: any) {
    if (!String(error?.code || "").includes("DUPLICATE") && error?.errno !== 1060) {
      throw error;
    }
  }
}

export { schema };
