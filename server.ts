/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import { createHmac, timingSafeEqual } from "crypto";
import path from "path";
import fs from "fs";
import cron from "node-cron";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import {
  seedDatabaseIfEmpty,
  registerUserProfile,
  loginUser,
  getUserProfile,
  updateUserProfile,
  getSubscriptionItems,
  subscribeToItem,
  getUserSubscriptions,
  getUserCollectibles,
  claimCollectible,
  getUserTransactions,
  claimDailyReward,
  requestCashout,
  createNotification,
  getReferreeStatsList,
  getChatMessages,
  sendChatMessage,
  fetchSystemDashboardStats,
  getUserNotifications,
  processDeposit,
  saveTransaction,
  getTransaction,
  completeSuccessfulDeposit,
  completeSuccessfulWithdrawal,
  completeSuccessfulGpuActivation,
  completeFailedTransaction,
  autoCollectUserYields,
  ensureUserDailyYields,
  flushDatabase,
  adminGetAllUsers,
  adminOverridePassword,
  adminGetAllTransactions,
  adminUpdateTransactionStatus,
  adminSaveCatalogItem,
  adminDeleteCatalogItem,
  adminDeleteAllCatalogItems,
  adminCreateGiftCode,
  adminGetGiftCodes,
  adminDeleteGiftCode,
  getAvailableGiftCodeCount,
  redeemGiftCode,
  dailyCheckin,
  adminGetCatalogItems,
  getVipTaskboard,
  claimTierReward,
  submitVipTaskClaim,
  listPendingVipTaskClaims,
  reviewVipTaskClaim,
  adminUpdateUserLockStatus,
  adminAdjustBalance,
  adminCreateAnnouncement,
  adminUpdateAnnouncement,
  adminGetAnnouncements,
  adminDeleteAnnouncement,
  adminGetChatConversations,
  getSiteConfig,
  updateSiteConfig,
  getConfiguredWithdrawMode,
  getMinimumDepositAmount,
  getMaximumDepositAmount,
  getMinimumWithdrawalAmount,
  getMaximumWithdrawalAmount,
  getPlatformDateKey,
  createTransactionId,
  getTransactionByExternalReference,
  publicProfile,
  verifyPassword,
  linkTelegramAccount,
  getUserProfileByTelegramId
} from "./src/server/db";
import { verifyTelegramIdToken } from "./src/server/telegramAuth";
import { migratePreset as migratePresetServer, migrateCardStyle as migrateCardStyleServer, migrateFontFamily as migrateFontFamilyServer, sanitizeSiteConfig as sanitizeSiteConfigServer } from "./src/utils/themeTokens";

// Ensure .env is loaded robustly in production iisnode and custom hosting environments (like SmarterASP)
const envFiles = [".env", "env.txt", "env", ".env.local"];
const searchPaths: string[] = [];

// 1. Process CWD paths
envFiles.forEach(f => searchPaths.push(path.resolve(process.cwd(), f)));

// 2. Relative to __dirname
if (typeof __dirname !== "undefined") {
  envFiles.forEach(f => {
    searchPaths.push(path.resolve(__dirname, f));
    searchPaths.push(path.resolve(__dirname, "..", f));
    searchPaths.push(path.resolve(__dirname, "../..", f));
  });

  // 3. Traversing up parent folders (up to 5 levels)
  let currentDir = __dirname;
  for (let i = 0; i < 5; i++) {
    envFiles.forEach(f => {
      const p = path.resolve(currentDir, f);
      if (!searchPaths.includes(p)) {
        searchPaths.push(p);
      }
    });
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
}

let loadedEnv = false;
let appliedEnvPath = "";

for (const p of searchPaths) {
  try {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      console.log(`[Env Loader] Found and loaded environment variables from: ${p}`);
      appliedEnvPath = p;
      loadedEnv = true;
      break;
    }
  } catch (err) {
    console.warn(`[Env Loader] Error checking path ${p}:`, err);
  }
}

if (!loadedEnv) {
  console.warn(`[Env Loader] WARNING: No environment configuration file found in any searched locations: ${JSON.stringify(searchPaths.slice(0, 10))}...`);
}

const app = express();
// IISNode provides PORT (often a named pipe). Keep 3000 only for local development.
const PORT = process.env.PORT || 3000;
let databaseReady = false;
type DailyCreditRunResult = {
  status: "completed" | "already-ran";
  platformDate: string;
  processed?: number;
};
let dailyCreditRunner: ((reason: string) => Promise<DailyCreditRunResult>) | null = null;
const processStartedAt = Date.now();
const PAYMENT_GATEWAY_URL = process.env.PAYMENT_GATEWAY_URL?.replace(/\/$/, "") || "https://zulupay.org";
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 12_000);

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = UPSTREAM_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// NOTE: no www<->apex canonical redirect lives here on purpose. The host
// redirects apex -> www upstream, so this server must serve the app on
// whatever host it receives — a redirect here would loop against it
// (apex -> www -> apex) and surface in browsers as CORS-blocked 301s.
// Keep BotFather Allowed URLs in sync with the exact page URL instead
// (see .env.example).
// Middleware
app.use(express.json({ limit: "15mb" })); // allow larger payload for base64 chat screenshot uploads!

// Runtime uploads (site logo etc.) go to Cloudinary — required on hosts with
// ephemeral disks (Render). There is no local-disk fallback.
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "rentdue";
const cloudinaryConfigured = Boolean(
  (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) ||
    process.env.CLOUDINARY_URL
);
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}
// Otherwise the SDK picks up CLOUDINARY_URL from env on its own.
if (!cloudinaryConfigured) {
  console.error("[Uploads] No Cloudinary keys — /api/admin/upload will refuse uploads until CLOUDINARY_* is set.");
}

// ---------- Site-art lifecycle ----------
// Uploads never destroy anything. Replaced art is retired only after the new
// config is successfully saved (see PUT /api/admin/config); abandoned uploads
// age out via collectImageOrphans(). This ordering makes "upload then don't
// save" and "failed upload" incapable of 404ing the live site.
function cloudinaryPublicId(url: string): string | null {
  if (typeof url !== "string" || !url.includes("res.cloudinary.com")) return null;
  const afterUpload = url.split("?")[0].split("/upload/")[1];
  if (!afterUpload) return null;
  // Our uploads always carry a version segment (secure_url includes /vNNN/),
  // which unambiguously anchors the public_id even when transformation
  // segments precede it. Without a version we fall back to the full path —
  // a wrong guess only fails a destroy (asset kept), never deletes wrong art.
  const versioned = afterUpload.match(/(?:^|\/)v\d+\/(.+)\.[a-z0-9]+$/i);
  if (versioned) return versioned[1];
  const bare = afterUpload.match(/^(.+)\.[a-z0-9]+$/i);
  return bare ? bare[1] : null;
}

function collectCloudinaryIds(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    const id = cloudinaryPublicId(value);
    if (id) into.add(id);
  } else if (Array.isArray(value)) {
    for (const entry of value) collectCloudinaryIds(entry, into);
  } else if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectCloudinaryIds(entry, into);
  }
  return into;
}

async function destroyPublicIds(ids: Iterable<string>): Promise<void> {
  for (const id of ids) {
    try {
      await cloudinary.uploader.destroy(id, { resource_type: "image", invalidate: true });
    } catch {
      // best effort — a failed destroy must never break saves or uploads
    }
  }
}

const IMAGE_ORPHAN_GRACE_MS = 24 * 3600 * 1000;
const IMAGE_ORPHAN_PAGE_SIZE = 200;

// Destroys unreferenced site art older than the grace period so abandoned
// uploads can't accumulate forever. Fresh drafts and everything referenced by
// the saved config are always kept.
async function collectImageOrphans(): Promise<void> {
  if (!cloudinaryConfigured) return;
  try {
    const config = await getSiteConfig().catch(() => ({} as any));
    const live = collectCloudinaryIds(config);
    const cutoff = Date.now() - IMAGE_ORPHAN_GRACE_MS;
    let nextCursor: string | undefined = undefined;
    do {
      const params: Record<string, unknown> = {
        type: "upload",
        prefix: `${CLOUDINARY_FOLDER}/`,
        max_results: IMAGE_ORPHAN_PAGE_SIZE,
      };
      if (nextCursor) params.next_cursor = nextCursor;
      const page: any = await cloudinary.api.resources(params);
      for (const asset of page.resources || []) {
        const id = String(asset.public_id || "");
        if (!id || live.has(id)) continue;
        const created = new Date(asset.created_at || 0).getTime();
        if (Number.isFinite(created) && created <= cutoff) {
          try {
            await cloudinary.uploader.destroy(id, { resource_type: "image", invalidate: true });
          } catch {
            // keep sweeping the rest
          }
        }
      }
      nextCursor = page.next_cursor;
    } while (nextCursor);
  } catch (err) {
    console.warn("[Uploads] orphan sweep failed:", err);
  }
}
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "referral-mining-server", uptimeSeconds: Math.floor(process.uptime()) });
});

app.get("/readyz", (_req, res) => {
  if (!databaseReady) return res.status(503).json({ ok: false, ready: false, message: "Database initialization is still in progress." });
  res.json({ ok: true, ready: true });
});

// ================= PUBLIC SEO =================
// The main app (/) is a login-walled SPA, so bots see an empty shell.
// These lightweight server-rendered pages give search engines indexable
// content. They are registered before the SPA fallback, so they work in
// both dev (Vite middleware) and production (dist + SPA fallback).
// Keep the authenticated product catalog out of public SEO pages and sitemap.
const SEO_PUBLIC_PATHS = ["/welcome", "/faq"];

const SEO_KEYWORDS = "RentDue, virtual machine rentals, daily returns, referral rewards, mobile money withdrawals, USDT withdrawals";
const SEO_DESCRIPTION = "Rent virtual machines with RentDue and track daily returns. Complete tasks, earn referral rewards, and withdraw eligible earnings via mobile money or USDT.";
const SEO_SHARE_IMAGE = "/seo-share-image";

function seoTitle(brand: string): string {
  return `${brand} | Virtual machine rentals and daily returns`;
}

function getPublicBaseUrl(req: express.Request): string {
  const configured = String(process.env.APP_URL || process.env.VITE_APP_URL || "").trim().replace(/\/$/, "");
  if (/^https?:\/\//i.test(configured) && !/MY_APP_URL/i.test(configured)) return configured;
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim() || "https";
  return `${proto}://${req.get("host") || "localhost:3000"}`.replace(/\/$/, "");
}

function escapeSeoHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatSeoUgx(_value: unknown): string {
  return "0";
}

async function getSeoData(): Promise<{ brand: string; description: string; items: any[]; config: any }> {
  try {
    const config = await getSiteConfig().catch(() => ({} as any));
    const brand = String((config as any)?.brandName || "").trim() || "RENTDUE";
    // Placeholder format: fixed corporate description until final copy lands.
    // Products stay hidden behind auth — no catalog fetch here by design.
    const description = String(config?.seoDescription || "").trim() || SEO_DESCRIPTION;
    return { brand, description, items: [], config: config || {} };
  } catch {
    return {
      brand: "RENTDUE",
      description: SEO_DESCRIPTION,
      items: [],
      config: {},
    };
  }
}

function seoShell(opts: {
  brand: string;
  title: string;
  description: string;
  canonical: string;
  image: string;
  jsonLd?: unknown;
  body: string;
  activePath: string;
}): string {
  const nav = (path: string, label: string) =>
    `<a href="${path}"${path === opts.activePath ? ' aria-current="page"' : ""}>${label}</a>`;
  const jsonLdTag = opts.jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(opts.jsonLd).replace(/</g, "\\u003c")}</script>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeSeoHtml(opts.title)}</title>
<meta name="description" content="${escapeSeoHtml(opts.description)}" />
<meta name="keywords" content="${escapeSeoHtml(SEO_KEYWORDS)}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${escapeSeoHtml(opts.canonical)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${escapeSeoHtml(opts.canonical)}" />
<meta property="og:site_name" content="${escapeSeoHtml(opts.brand)}" />
<meta property="og:title" content="${escapeSeoHtml(opts.title)}" />
<meta property="og:description" content="${escapeSeoHtml(opts.description)}" />
<meta property="og:image" content="${escapeSeoHtml(opts.image)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeSeoHtml(opts.title)}" />
<meta name="twitter:description" content="${escapeSeoHtml(opts.description)}" />
<meta name="twitter:image" content="${escapeSeoHtml(opts.image)}" />
${jsonLdTag}
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;color:#0f172a;background:#f8fafc}a{color:#0e7490}header,footer{background:#020617;color:#e2e8f0}header a,footer a{color:#e2e8f0}.wrap{max-width:760px;margin:0 auto;padding:20px 16px}nav{display:flex;gap:14px;flex-wrap:wrap;font-size:14px}nav a[aria-current=page]{font-weight:700;text-decoration:underline}.card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin:12px 0}h1{font-size:28px;line-height:1.2}h2{font-size:20px;margin-top:26px}.muted{color:#475569}.cta{display:inline-block;background:#0e7490;color:#fff!important;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:700}details.card summary{cursor:pointer;font-weight:600}ul.tick{padding-left:18px}</style>
</head>
<body>
<header><div class="wrap"><nav>${nav("/welcome", "About")}${nav("/faq", "FAQ")}<a href="/">Open app</a></nav></div></header>
<main class="wrap">${opts.body}</main>
<footer><div class="wrap"><p class="muted" style="color:#94a3b8">${escapeSeoHtml(opts.brand)}: ${escapeSeoHtml(SEO_DESCRIPTION)}</p><nav><a href="/welcome">About</a><a href="/faq">FAQ</a><a href="/">Open app</a></nav></div></footer>
</body>
</html>`;
}

const SEO_FAQS: Array<{ q: string; a: string }> = [
  { q: "How does Rentdue work?", a: "Deposit funds into your rechargeable balance, use that balance to rent a product, and each product earns daily income into your withdrawable balance for the length of its cycle." },
  { q: "How do withdrawals work?", a: "Withdrawals come from the withdrawable balance only, require at least one product, and are paid to MTN, Airtel or USDT. Fees and minimums are shown in the app before you confirm." },
  { q: "How do referrals earn?", a: "Share your invite link. You earn Level 1–4 commissions when invitees activate products, paid while the invitee keeps an active product." },
  { q: "What is the daily check-in?", a: "Open the app every day to claim a check-in bonus into your withdrawable balance. Longer streaks unlock bigger rewards." },
  { q: "Do I need the app installed?", a: "No — the app works in the browser. You can also install it from your phone browser for faster access." },
];

// Private surfaces must never be indexed.
app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/admin")) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  next();
});

app.get("/robots.txt", (req, res) => {
  const base = getPublicBaseUrl(req);
  res.type("text/plain").send(
    ["User-agent: *", "Allow: /welcome", "Allow: /faq", "Disallow: /api/", "Disallow: /admin/", "Disallow: /products", "Disallow: /product/", "", `Sitemap: ${base}/sitemap.xml`, ""].join("\n")
  );
});

app.get("/sitemap.xml", async (req, res) => {
  try {
    const base = getPublicBaseUrl(req);
    const today = new Date().toISOString().split("T")[0];
    // Catalog intentionally excluded — products live behind authentication.
    const urls = SEO_PUBLIC_PATHS.map((p) => ({ loc: `${base}${p}`, changefreq: "weekly", priority: p === "/welcome" ? "0.9" : "0.7" }));
    res.type("application/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${escapeSeoHtml(u.loc)}</loc><lastmod>${today}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join("")}</urlset>`
    );
  } catch (err) {
    logError("[SEO] sitemap failed:", err);
    res.status(500).type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`);
  }
});

// Link previews use the current configured logo. Keep the public endpoint
// stable so social platforms can re-fetch it when the admin updates branding.
app.get("/seo-share-image", async (req, res) => {
  const base = getPublicBaseUrl(req);
  try {
    const config = await getSiteConfig();
    const logo = String(config.logoUrl || "").trim();
    if (!logo) return res.redirect(302, `${base}/social-share.png`);

    if (/^<svg\b/i.test(logo)) {
      return res.redirect(302, `${base}/social-share.png`);
    }

    let target: URL;
    try {
      const normalizedLogo = logo
        .replace("github.com/", "raw.githubusercontent.com/")
        .replace("/blob/", "/");
      target = new URL(normalizedLogo, base);
      if (target.hostname === "res.cloudinary.com" && target.pathname.includes("/upload/")) {
        target.pathname = target.pathname.replace("/upload/", "/upload/f_png,w_1200,h_630,c_pad,b_rgb:071321/");
      } else if (target.pathname.toLowerCase().endsWith(".svg")) {
        return res.redirect(302, `${base}/social-share.png`);
      }
    } catch {
      return res.redirect(302, `${base}/social-share.png`);
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return res.redirect(302, `${base}/social-share.png`);
    }
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.redirect(302, target.toString());
  } catch {
    return res.redirect(302, `${base}/social-share.png`);
  }
});

app.get("/welcome", async (req, res) => {
  const base = getPublicBaseUrl(req);
  const { brand, description, config } = await getSeoData();
  const signupBonus = Number(config?.registrationBonus ?? 0);
  const body = `
<h1>${escapeSeoHtml(brand)} virtual machine rentals</h1>
<p>${escapeSeoHtml(description)}</p>
<ul class="tick">
  <li>Check in daily to collect your login bonus.</li>
  <li>Complete tasks to unlock new challenges and higher rewards.</li>
  <li>Earn referral commissions on eligible activity across up to four levels.</li>
  <li>Withdraw eligible returns through supported mobile money or USDT.</li>
  <li>Collect shareable artwork when a rental cycle is complete.</li>
</ul>
${signupBonus > 0 ? `<p><strong>Sign up to receive a UGX ${escapeSeoHtml(signupBonus.toLocaleString("en-UG"))} welcome bonus. Offer terms apply.</strong></p>` : ""}
<p><a class="cta" href="/">Open the app</a></p>
<h2>Virtual rentals and rewards</h2>
<p>Manage rentals, daily earnings, referrals, milestones, and withdrawals from one account.</p>
<p><a href="/faq">Read frequently asked questions</a></p>`;
  res.send(seoShell({
    brand,
    title: seoTitle(brand),
    description,
    image: `${base}${SEO_SHARE_IMAGE}`,
    canonical: `${base}/welcome`,
    activePath: "/welcome",
    jsonLd: { "@context": "https://schema.org", "@type": "WebSite", name: brand, description, inLanguage: "en", url: `${base}/welcome` },
    body,
  }));
});

// Former public catalog URLs now redirect here — products live behind auth.
app.get(["/products", "/product/:id"], (_req, res) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.redirect(301, "/welcome");
});

// Former how-it-works URL redirects to FAQ — the app has no standalone
// how-it-works page, only the in-dashboard guide/FAQ.
app.get("/how-it-works", (_req, res) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.redirect(301, "/faq");
});

app.get("/faq", async (req, res) => {
  const base = getPublicBaseUrl(req);
  const { brand } = await getSeoData();
  const body = `<h1>Frequently asked questions</h1>` +
    SEO_FAQS.map((f) => `<details class="card"><summary>${escapeSeoHtml(f.q)}</summary><p>${escapeSeoHtml(f.a)}</p></details>`).join("") +
    `<p><a class="cta" href="/">Open the app</a></p>`;
  res.send(seoShell({
    brand,
    title: `${brand} FAQs | Rentals, returns, and rewards`,
    description: `Learn how RentDue rentals, daily returns, check-ins, referrals, withdrawals, and app access work.`,
    image: `${base}${SEO_SHARE_IMAGE}`,
    canonical: `${base}/faq`,
    activePath: "/faq",
    jsonLd: { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: SEO_FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    body,
  }));
});

function isValidDailyCreditJobRequest(req: express.Request): boolean {
  const expected = String(process.env.DAILY_CREDIT_JOB_SECRET || "");
  const provided = String(req.query.key || req.headers["x-daily-credit-secret"] || "");
  if (!expected || !provided) return false;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

// Optional hosting scheduler hook. It is protected and idempotent, so a host
// can call it periodically without relying on the Node process staying alive
// at exactly midnight.
app.get("/api/jobs/daily-credit", async (req, res) => {
  if (!isValidDailyCreditJobRequest(req)) {
    return res.status(401).json({ error: "Invalid daily credit job secret." });
  }
  if (!dailyCreditRunner) {
    return res.status(503).json({ error: "Daily credit worker is not ready." });
  }
  try {
    res.json(await dailyCreditRunner("External"));
  } catch (error: any) {
    logError("[Daily Credit Job] External run failed:", error);
    res.status(500).json({ error: "Daily credit job failed." });
  }
});

const PHONE_PATTERN = /^\d{9,10}$/;
const MAX_PASSWORD_LENGTH = 128;

function normalizePhone(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, "").trim() : "";
}

function logError(label: string, err: unknown) {
  const msg = (err as any)?.message || String(err);
  console.error(`[${label}] ${msg}`);
}

function sanitizeErrorMessage(err: unknown, fallback: string): string {
  const msg = String((err as any)?.message || fallback).toLowerCase();
  if (msg.includes("db is not connected") || msg.includes("database") || msg.includes("econnrefused") || msg.includes("timeout")) {
    return "Service temporarily unavailable. Please try again.";
  }
  if (msg.includes("duplicate") || msg.includes("already exists") || msg.includes("unique")) {
    return "An account with this information already exists.";
  }
  if (msg.includes("not found") || msg.includes("no record")) {
    return "Record not found.";
  }
  return fallback;
}

function errorResponse(error: unknown, fallback: string, defaultStatus = 500) {
  const err = error as any;
  const status = Number.isInteger(err?.statusCode) ? err.statusCode : defaultStatus;
  return {
    status,
    body: { error: sanitizeErrorMessage(err, fallback) }
  };
}

const ADMIN_SESSION_COOKIE = "referral_admin_session";
const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;
const USER_SESSION_COOKIE = "referral_user_session";
const USER_SESSION_TTL_SECONDS = 24 * 60 * 60;

function getCookieValue(req: express.Request, name: string): string | null {
  const cookies = String(req.headers.cookie || "").split(";");
  const entry = cookies.find((cookie) => cookie.trim().startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.trim().slice(name.length + 1)) : null;
}

function adminSessionSecret(config: any): string {
  // Reuse the existing administrator secret; no additional environment
  // variable is required for the session cookie.
  return config.adminPass || process.env.ADMIN_PASSWORD || process.env.ADMIN_PASS || "";
}

function signAdminSession(phone: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ phone, exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function validAdminSignature(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function signUserSession(phone: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ phone, exp: Math.floor(Date.now() / 1000) + USER_SESSION_TTL_SECONDS })).toString("base64url");
  const signature = createHmac("sha256", secret).update(`user:${payload}`).digest("base64url");
  return `${payload}.${signature}`;
}

async function getAuthenticatedUserPhone(req: express.Request): Promise<string | null> {
  const token = getCookieValue(req, USER_SESSION_COOKIE);
  if (!token) return null;
  try {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const config = await getSiteConfig();
    const secret = adminSessionSecret(config);
    const expected = createHmac("sha256", secret).update(`user:${payload}`).digest();
    const received = Buffer.from(signature, "base64url");
    if (!secret || received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    if (typeof session.phone !== "string" || Number(session.exp) < Math.floor(Date.now() / 1000)) return null;
    return session.phone;
  } catch {
    return null;
  }
}

// Admin API calls are same-origin and use this HttpOnly cookie. This closes the
// previous gap where every admin data/mutation endpoint was publicly callable.
app.use("/api/admin", async (req, res, next) => {
  if (req.path === "/login" || req.path === "/access/activate") return next();
  try {
    const token = getCookieValue(req, ADMIN_SESSION_COOKIE) || String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return res.status(401).json({ error: "Admin sign-in is required." });
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const config = await getSiteConfig();
    const secret = adminSessionSecret(config);
    if (!secret || session.phone !== config.adminPhone || Number(session.exp) < Math.floor(Date.now() / 1000) || !validAdminSignature(payload, signature, secret)) {
      return res.status(401).json({ error: "Admin session expired. Please sign in again." });
    }
    next();
  } catch (error) {
    logError("[Admin Auth] session validation failed:", error);
    res.status(401).json({ error: "Admin sign-in is required." });
  }
});

// AI provider is OpenRouter (free route). No startup client needed — per-request fetch with rotation.

// ================= AUTH ENDPOINTS =================

app.get("/api/auth/telegram/widget-config", (_req, res) => {
  const clientId = process.env.TELEGRAM_CLIENT_ID || "";
  if (!/^\d+$/.test(clientId)) return res.status(503).json({ error: "Telegram sign-in is unavailable." });
  res.json({ clientId });
});

app.get("/api/auth/telegram/status", async (req, res) => {
  const phone = await getAuthenticatedUserPhone(req);
  if (!phone) return res.status(401).json({ error: "Sign in to manage Telegram linking." });
  try {
    const [profile, config] = await Promise.all([getUserProfile(phone), getSiteConfig()]);
    if (!profile) return res.status(401).json({ error: "Sign in to manage Telegram linking." });
    const isAdmin = phone === config.adminPhone;
    res.json({ linked: Boolean(profile.telegramId), isAdmin });
  } catch {
    res.status(503).json({ error: "Telegram status is unavailable." });
  }
});

app.post("/api/auth/telegram/link", async (req, res) => {
  const phone = await getAuthenticatedUserPhone(req);
  if (!phone) return res.status(401).json({ error: "Sign in before linking Telegram." });
  const clientId = process.env.TELEGRAM_CLIENT_ID || "";
  if (!clientId) return res.status(503).json({ error: "Telegram linking is unavailable." });
  try {
    const config = await getSiteConfig();
    if (phone === config.adminPhone) return res.status(403).json({ error: "Telegram linking is unavailable for admin accounts." });
    const profile = await getUserProfile(phone);
    if (!profile || profile.locked) return res.status(403).json({ error: "This account cannot link Telegram." });
    const identity = await verifyTelegramIdToken(req.body?.id_token, clientId);
    const result = await linkTelegramAccount(phone, identity.id);
    if (result === "conflict") return res.status(409).json({ error: "This account or Telegram profile is already linked." });
    res.json({ success: true, linked: true });
  } catch (error: any) {
    const status = Number(error?.statusCode) || 400;
    res.status(status).json({ error: status === 503 ? "Telegram linking is unavailable." : error.message || "Telegram link could not be verified." });
  }
});

app.post("/api/auth/telegram/login", async (req, res) => {
  const clientId = process.env.TELEGRAM_CLIENT_ID || "";
  if (!clientId) return res.status(503).json({ error: "Telegram sign-in is unavailable." });
  try {
    const identity = await verifyTelegramIdToken(req.body?.id_token, clientId);
    const profile = await getUserProfileByTelegramId(identity.id);
    if (!profile || profile.locked) return res.status(401).json({ error: "Please create an account first." });
    const config = await getSiteConfig();
    if (profile.phone === config.adminPhone) return res.status(403).json({ error: "Telegram sign-in is unavailable for admin accounts." });
    const secret = adminSessionSecret(config);
    if (!secret) return res.status(503).json({ error: "Sign-in is temporarily unavailable." });
    res.setHeader("Set-Cookie", `${USER_SESSION_COOKIE}=${encodeURIComponent(signUserSession(profile.phone, secret))}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${USER_SESSION_TTL_SECONDS}`);
    res.json({ success: true, profile: publicProfile(profile) });
  } catch (error: any) {
    const status = Number(error?.statusCode) || 400;
    res.status(status).json({ error: status === 503 ? "Telegram sign-in is unavailable." : error.message || "Telegram sign-in could not be verified." });
  }
});

// Restore the signed HttpOnly user session after a browser refresh. The
// client never needs to persist the profile or the session token itself.
app.get("/api/auth/session", async (req, res) => {
  try {
    const phone = await getAuthenticatedUserPhone(req);
    if (!phone) return res.status(401).json({ authenticated: false });
    const profile = await getUserProfile(phone);
    if (!profile) return res.status(401).json({ authenticated: false });
    res.json({ authenticated: true, profile: publicProfile(profile) });
  } catch (error: any) {
    logError("[Auth] Session restore failed:", error);
    res.status(401).json({ authenticated: false });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  res.setHeader("Set-Cookie", `${USER_SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
  res.json({ success: true });
});

// Registration
app.post("/api/auth/register", async (req, res) => {
  const { phone, password, confirmPassword, inviteCode } = req.body;
  const normalizedPhone = normalizePhone(phone);
  const displayName = typeof req.body?.username === "string" ? req.body.username.trim().slice(0, 64) : "";

  if (!normalizedPhone || typeof password !== "string") {
    return res.status(400).json({ error: "Phone number and password are required." });
  }

  if (!PHONE_PATTERN.test(normalizedPhone)) {
    return res.status(400).json({ error: "Phone number must contain 9 or 10 digits." });
  }

  if (password.length < 8 || password.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({ error: "Password must be between 8 and 128 characters." });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match." });
  }

  if (inviteCode !== undefined && (typeof inviteCode !== "string" || inviteCode.trim().length > 32)) {
    return res.status(400).json({ error: "The referral code is invalid." });
  }

  // Optional Telegram binding: the register pill hands over the OIDC id_token
  // it collected. Verified here server-side; never trusted from the client.
  let telegramId: string | null = null;
  const idToken = (req.body as any)?.id_token;
  if (idToken !== undefined && idToken !== null && idToken !== "") {
    const clientId = process.env.TELEGRAM_CLIENT_ID || "";
    if (!/^\d+$/.test(clientId)) return res.status(503).json({ error: "Telegram sign-in is unavailable." });
    try {
      const identity = await verifyTelegramIdToken(idToken, clientId);
      telegramId = identity.id;
    } catch (error: any) {
      const detail = String(error?.message || "").toLowerCase();
      if (detail.includes("expired")) return res.status(400).json({ error: "Telegram verification expired. Tap the pill to reconnect." });
      return res.status(400).json({ error: "Telegram verification failed. Please try again." });
    }
  }

  try {
    if (telegramId) {
      const config = await getSiteConfig();
      if (normalizedPhone === config.adminPhone) return res.status(403).json({ error: "Telegram sign-in is unavailable for admin accounts." });
      // Check A — Telegram ID: catches the same-Telegram-different-phones
      // edge case (only the Telegram owner can trigger this).
      const telegramTaken = await getUserProfileByTelegramId(telegramId);
      if (telegramTaken) return res.status(409).json({ error: "This Telegram account is already connected. Please log in." });
      // Check B — phone: the user typed this number themselves, so naming it
      // discloses nothing.
      const phoneTaken = await getUserProfile(normalizedPhone);
      if (phoneTaken) return res.status(409).json({ error: "An account with this phone number already exists. Please log in." });
    }
    const { success, profile } = await registerUserProfile({
      phone: normalizedPhone,
      passwordHash: password, // Store password safely for live demo validation
      username: displayName || undefined, // blank falls back to auto User_XXXX
      referredByCode: inviteCode ? inviteCode.trim() : "",
      telegramId: telegramId || undefined
    });
    res.json({ success, profile: publicProfile(profile) });
  } catch (error: any) {
    logError("Register Error:", error);
    // Race backstop: a concurrent request may have claimed the phone or the
    // Telegram ID after the pre-checks. Reword to the same two messages so
    // the unique-index key name never leaks.
    const detail = String(error?.message || "");
    if (error?.name === "DuplicateEntryError" || Number(error?.statusCode) === 409) {
      if (detail.includes("uq_users_telegram_id")) {
        return res.status(409).json({ error: "This Telegram account is already connected. Please log in." });
      }
      return res.status(409).json({ error: "An account with this phone number already exists. Please log in." });
    }
    const response = errorResponse(error, "Registration could not be completed.", 400);
    res.status(response.status).json(response.body);
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  const { phone, password } = req.body;
  const normalizedPhone = normalizePhone(phone);
  
  if (!normalizedPhone || typeof password !== "string" || password.length === 0) {
    return res.status(400).json({ error: "Enter your phone number and password." });
  }

  if (!PHONE_PATTERN.test(normalizedPhone)) {
    return res.status(400).json({ error: "Phone number must contain 9 or 10 digits." });
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({ error: "Password is too long." });
  }

  try {
    const profile = await loginUser(normalizedPhone, password);
    if (!profile) {
      return res.status(401).json({ success: false, error: "Phone number or password is incorrect." });
    }
    const config = await getSiteConfig();
    const secret = adminSessionSecret(config);
    if (!secret) {
      return res.status(503).json({ error: "Sign-in is temporarily unavailable because secure session configuration is missing." });
    }
    res.setHeader("Set-Cookie", `${USER_SESSION_COOKIE}=${encodeURIComponent(signUserSession(normalizedPhone, secret))}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${USER_SESSION_TTL_SECONDS}`);
    res.json({ success: true, profile: publicProfile(profile) });
  } catch (error: any) {
    logError("Login Error:", error);
    const response = errorResponse(error, "We could not sign you in right now. Please try again.", 500);
    res.status(response.status).json(response.body);
  }
});

// Update Profile
app.post("/api/auth/profile", async (req, res) => {
  const { phone, username, operator, customPhone, usdtAddress, newPassword } = req.body;

  if (!phone || !username || !operator || !customPhone) {
    return res.status(400).json({ error: "Missing updated profile parameters." });
  }

  try {
    const profile = await updateUserProfile(
      phone.trim(),
      username.trim(),
      operator,
      customPhone.trim(),
      newPassword,
      usdtAddress
    );
    res.json({ success: true, profile: publicProfile(profile) });
  } catch (error: any) {
    logError("Profile Edit Error:", error);
    res.status(400).json({ error: error.message });
  }
});

// Fetch Profile details
app.get("/api/profile/:phone", async (req, res) => {
  try {
    await ensureUserDailyYields(req.params.phone);
    const profile = await getUserProfile(req.params.phone);
    res.json(publicProfile(profile));
  } catch (error: any) {
    logError("Profile Fetch Error:", error);
    res.status(404).json({ error: error.message });
  }
});

// ================= ITEMS & SUBSCRIPTIONS ENDPOINTS =================

// Get catalog subscription items
app.get("/api/items", async (req, res) => {
  try {
    const items = await getSubscriptionItems();
    res.json(items);
  } catch (error: any) {
    logError("Get items error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get user active subscriptions nodes
app.get("/api/subscriptions/:phone", async (req, res) => {
  try {
    await ensureUserDailyYields(req.params.phone);
    const list = await getUserSubscriptions(req.params.phone);
    res.json(list);
  } catch (error: any) {
    logError("Get subs error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Activate / purchase subscription item
app.post("/api/items/subscribe", async (req, res) => {
  const { phone, itemId } = req.body;

  if (!phone || !itemId) {
    return res.status(400).json({ error: "Missing subscription values phone and itemId." });
  }

  try {
    const subNode = await subscribeToItem(phone, itemId);
    
    res.json({ success: true, subscription: subNode });
  } catch (error: any) {
    logError("Subscription purchase error:", error);
    res.status(400).json({ error: error.message });
  }
});

// Claim accumulated mining points
app.post("/api/subscriptions/claim", async (req, res) => {
  const { subId, phone } = req.body;

  if (!subId || !phone) {
    return res.status(400).json({ error: "Missing subId and user phone metadata parameters." });
  }

  try {
    const result = await claimDailyReward(subId, phone);
    res.json(result);
  } catch (error: any) {
    logError("Claim reward error:", error);
    res.status(400).json({ error: error.message });
  }
});

// ================= COLLECTIBLES (virtual, off-chain) =================

// Virtual gallery: every finished run owns one keepsake row.
app.get("/api/collectibles/:phone", async (req, res) => {
  try {
    const list = await getUserCollectibles(req.params.phone);
    res.json(list);
  } catch (error: any) {
    logError("Get collectibles error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Autocredit runs till the cycle is done — this tap completes ownership.
app.post("/api/collectibles/claim", async (req, res) => {
  const { phone, subscriptionId } = req.body;

  if (!phone || !subscriptionId) {
    return res.status(400).json({ error: "Missing phone and subscriptionId parameters." });
  }

  try {
    const result = await claimCollectible(phone, subscriptionId);
    res.json(result);
  } catch (error: any) {
    logError("Claim collectible error:", error);
    res.status(400).json({ error: error.message });
  }
});

// Cashout Point conversion
app.post("/api/profile/withdraw", async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const points = req.body?.points;
  const numPoints = parseInt(points);

  if (!phone || isNaN(numPoints) || numPoints <= 0) {
    return res.status(400).json({ error: "Specify a valid non-zero points amount for withdrawal." });
  }
  const authenticatedPhone = await getAuthenticatedUserPhone(req);
  if (!authenticatedPhone || authenticatedPhone !== phone) {
    return res.status(401).json({ error: "Please sign in again before requesting a withdrawal." });
  }

  try {
    // This legacy endpoint has no payment-provider payload/callback wiring.
    // Do not let it create an automatic withdrawal that can never receive a
    // webhook; current clients must use /api/payment/withdraw.
    const config = await getSiteConfig();
    if (getConfiguredWithdrawMode(config) === "automatic") {
      return res.status(409).json({ error: "Withdrawals must be submitted through the payment flow." });
    }

    const result = await requestCashout(phone, numPoints, undefined, "manual");
    const { profile, ...transaction } = result;
    res.json({ ...transaction, profile: publicProfile(profile) });
  } catch (error: any) {
    logError("Cashout request error:", error);
    res.status(400).json({ error: error.message });
  }
});

// Milestone board endpoints (routes keep the vip-tasks path for compatibility).
// Progress and rewards are calculated server-side; both endpoints require the
// signed user session created during login.
app.get("/api/profile/vip-tasks/:phone", async (req, res) => {
  const authenticatedPhone = await getAuthenticatedUserPhone(req);
  if (!authenticatedPhone || authenticatedPhone !== normalizePhone(req.params.phone)) {
    return res.status(401).json({ error: "Please sign in again to view your milestones." });
  }
  try {
    const board = await getVipTaskboard(req.params.phone);
    res.json(board);
  } catch (error: any) {
    logError("[Milestones] load error:", error);
    res.status(500).json({ error: error.message || "Unable to load milestones right now." });
  }
});

app.post("/api/profile/vip-tasks/claim", async (req, res) => {
  const { phone, category } = req.body;

  if (!phone || !category) {
    return res.status(400).json({ error: "Missing required parameters phone and category." });
  }

  const authenticatedPhone = await getAuthenticatedUserPhone(req);
  if (!authenticatedPhone || authenticatedPhone !== normalizePhone(phone)) {
    return res.status(401).json({ error: "Please sign in again before claiming a milestone." });
  }

  try {
    const result = await claimTierReward(phone, String(category));
    res.json(result);
  } catch (error: any) {
    logError("Claim milestone error:", error);
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/profile/vip-tasks/submit", async (req, res) => {
  const { phone, taskId, proof } = req.body || {};
  const authenticatedPhone = await getAuthenticatedUserPhone(req);
  if (!authenticatedPhone || authenticatedPhone !== normalizePhone(phone)) {
    return res.status(401).json({ error: "Please sign in again before submitting a task." });
  }
  try {
    const result = await submitVipTaskClaim(authenticatedPhone, String(taskId || ""), String(proof || ""));
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Unable to submit this task." });
  }
});

// Helper to authenticate with the payment gateway API
async function getGatewayToken(): Promise<string> {
  const publicKey = process.env.PAYMENT_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error(`environment configuration is missing (PAYMENT_PUBLIC_KEY). Env loaded path: "${appliedEnvPath || "None"}". Checked paths: [${searchPaths.slice(0, 10).join(", ")}]. Loaded env keys: ${Object.keys(process.env).filter(k => k.includes("PAYMENT") || k.includes("PORT") || k.includes("APP")).join(", ")}`);
  }

  const response = await fetchWithTimeout(`${PAYMENT_GATEWAY_URL}/api/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": publicKey
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(` API token auth failure (${response.status}): ${text}`);
  }

  const rawText = await response.text();
  let token = rawText.trim();
  try {
    const json = JSON.parse(rawText);
    token = json.token || json.access_token || json.data?.token || json.data || token;
  } catch (e) {
    // raw string
  }

  if (typeof token === "string" && token.startsWith('"') && token.endsWith('"')) {
    token = token.slice(1, -1);
  }

  return token;
}

// 1. GATEWAY DEPOSIT / COLLECTION
app.post("/api/payment/deposit", async (req, res) => {
  const { phone, amount, operator, depositPhone, type, itemId } = req.body;
  const depAmt = parseInt(amount);

  if (!phone || isNaN(depAmt) || depAmt <= 0 || !operator || !depositPhone) {
    return res.status(400).json({ error: "Missing parameters. Enter a valid deposit amount." });
  }

  try {
    const config = await getSiteConfig();
    const minimumDeposit = getMinimumDepositAmount(config);
    const maximumDeposit = getMaximumDepositAmount(config);
    if (depAmt < minimumDeposit) {
      return res.status(400).json({ error: `Minimum deposit is UGX ${minimumDeposit.toLocaleString()}.` });
    }
    if (maximumDeposit > 0 && depAmt > maximumDeposit) {
      return res.status(400).json({ error: `Maximum deposit is UGX ${maximumDeposit.toLocaleString()}.` });
    }

    const zKey = process.env.PAYMENT_SECRET_KEY;
    if (!zKey) {
      throw new Error(` configuration secret key is missing (PAYMENT_SECRET_KEY). Env loaded path: "${appliedEnvPath || "None"}". Checked paths: [${searchPaths.slice(0, 10).join(", ")}]. Loaded env keys: ${Object.keys(process.env).filter(k => k.includes("PAYMENT") || k.includes("PORT") || k.includes("APP")).join(", ")}`);
    }

    const token = await getGatewayToken();
    const rawType = String(type || "").toLowerCase();
    const trans_id = ["gpu", "product_activation", "subscription"].includes(rawType)
      ? createTransactionId("RNT")
      : createTransactionId("DEP");
    const webhookUrl = process.env.PAYMENT_WEBHOOK_URL || `${req.protocol}://${req.get("host")}/api/payment/webhook`;

    const depositRes = await fetchWithTimeout(`${PAYMENT_GATEWAY_URL}/api/deposit`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "secret_key": zKey,
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        amount: depAmt,
        phone: depositPhone,
        trans_id,
        callback_url: webhookUrl,
        webhook_url: webhookUrl
      })
    });

    const bodyText = await depositRes.text();
    let depResult: any = {};
    try {
      depResult = JSON.parse(bodyText);
    } catch (e) {
      console.warn(" deposit returned non-JSON:", bodyText);
    }

    if (!depositRes.ok) {
      return res.status(400).json({ 
        error: depResult.message || depResult.error || `Gateway returned error code: ${depositRes.status}` 
      });
    }

    // Save pending transaction record in Firestore
    await saveTransaction(trans_id, phone, depAmt, type, depositPhone, operator, itemId);
    await createNotification(
      phone,
      "Deposit Initiated",
      `Your deposit of UGX ${depAmt.toLocaleString()} is pending payment confirmation. Reference: ${trans_id}.`,
      "deposit",
      depAmt
    );

    res.json({
      success: true,
      trans_id,
      status: "PENDING",
      zuluResponse: depResult
    });

  } catch (error: any) {
    logError(" collection error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 1.5 MANUAL/OFFLINE DEPOSIT SUBMISSION
app.post("/api/manual/deposit", async (req, res) => {
  const { phone, amount, operator, senderPhone, transId, itemId } = req.body;
  const depAmt = parseInt(amount);

  if (!phone || isNaN(depAmt) || depAmt <= 0 || !operator || !senderPhone || !transId) {
    return res.status(400).json({ error: "Please fill in all deposit fields with a valid amount." });
  }

  try {
    const config = await getSiteConfig();
    const minimumDeposit = getMinimumDepositAmount(config);
    const maximumDeposit = getMaximumDepositAmount(config);
    if (depAmt < minimumDeposit) {
      return res.status(400).json({ error: `Minimum deposit is UGX ${minimumDeposit.toLocaleString()}.` });
    }
    if (maximumDeposit > 0 && depAmt > maximumDeposit) {
      return res.status(400).json({ error: `Maximum deposit is UGX ${maximumDeposit.toLocaleString()}.` });
    }

    const existingTx = await getTransaction(transId) || await getTransactionByExternalReference(transId);
    if (existingTx) {
      return res.status(400).json({ error: "This transaction reference / ID has already been submitted." });
    }

    const internalTransactionId = itemId ? createTransactionId("RNT") : createTransactionId("DEP");
    // Keep the payer's provider/hash reference as metadata while the local
    // ledger uses the same recognizable ID format as every other transaction.
    await saveTransaction({
      id: internalTransactionId,
      userId: phone,
      type: itemId ? "product_activation" : "deposit",
      amount: depAmt,
      currency: "UGX",
      status: "pending",
      paymentMethod: operator,
      phone: senderPhone,
      itemId: itemId || "",
      operator,
      mode: "manual",
      metadata: { externalReference: transId },
      timestamp: new Date().toISOString()
    });
    await createNotification(
      phone,
      "Deposit Submitted",
      `Your deposit proof for UGX ${depAmt.toLocaleString()} is pending admin approval. Reference: ${internalTransactionId}. External payment reference: ${transId}.`,
      "deposit",
      depAmt
    );

    res.json({
      success: true,
      trans_id: internalTransactionId,
      external_reference: transId,
      status: "PENDING",
      message: "Proof of payment submitted successfully! Verification is now pending admin approval."
    });
  } catch (error: any) {
    logError("Manual deposit submission error:", error);
    res.status(550).json({ error: error.message });
  }
});

// 2. GATEWAY TRANSACTION STATUS CHECK & PROVISIONING
app.post("/api/payment/status", async (req, res) => {
  const { trans_id } = req.body;

  if (!trans_id) {
    return res.status(400).json({ error: "trans_id parameter is required." });
  }

  try {
    const tx = await getTransaction(trans_id);
    if (!tx) {
      return res.status(404).json({ error: "Transaction record was not found." });
    }

    if (tx.status === "SUCCESSFUL" || tx.status === "FAILED" || tx.mode === "manual") {
      // Create user response
      return res.json({ success: true, status: tx.status, transaction: tx });
    }

    // Automatic withdrawals are settled exclusively by /api/payment/webhook.
    // This status endpoint must never race the callback or become a second
    // settlement path.
    if (tx.type === "withdrawal" || tx.type === "withdraw") {
      return res.json({ success: true, status: String(tx.status || "PENDING").toUpperCase(), transaction: tx });
    }

    const token = await getGatewayToken();
    const zKey = process.env.PAYMENT_SECRET_KEY;

    const queryRes = await fetchWithTimeout(`${PAYMENT_GATEWAY_URL}/api/transaction`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "secret_key": zKey || "",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        type: tx.type === "withdrawal" ? "withdraw" : "deposit",
        trans_id
      })
    });

    const bodyText = await queryRes.text();
    let zuluTx: any = {};
    try {
      zuluTx = JSON.parse(bodyText);
    } catch (e) {
      console.warn(" query response parsing error:", bodyText);
    }

    const status = zuluTx.status || zuluTx.data?.status || "PENDING";

    if (status === "SUCCESSFUL") {
      if (tx.type === "deposit") {
        const updatedProfile = await completeSuccessfulDeposit(
          tx.userId,
          tx.amount,
          tx.phone,
          tx.operator,
          trans_id
        );
        return res.json({
          success: true,
          status: "SUCCESSFUL",
          profile: publicProfile(updatedProfile)
        });
      } else if (tx.type === "withdrawal" || tx.type === "withdraw") {
        const updatedProfile = await completeSuccessfulWithdrawal(trans_id);
        return res.json({
          success: true,
          status: "SUCCESSFUL",
          profile: publicProfile(updatedProfile)
        });
      } else {
        const subNode = await completeSuccessfulGpuActivation(
          tx.userId,
          tx.itemId,
          trans_id,
          tx.phone,
          tx.operator,
          tx.amount
        );

        return res.json({
          success: true,
          status: "SUCCESSFUL",
          subscription: subNode
        });
      }
    } else if (status === "FAILED") {
      await completeFailedTransaction(trans_id);
      return res.json({
        success: true,
        status: "FAILED"
      });
    }

    res.json({
      success: true,
      status: "PENDING"
    });

  } catch (error: any) {
    logError("Webhook status check error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3. GATEWAY WITHDRAW / DISBURSEMENT
app.post("/api/payment/withdraw", async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const operator = String(req.body?.operator || "").trim().toUpperCase();
  const withdrawPhone = typeof req.body?.withdrawPhone === "string" ? req.body.withdrawPhone.trim() : "";
  const withAmt = Number(req.body?.amount);
  const authenticatedPhone = await getAuthenticatedUserPhone(req);

  if (!authenticatedPhone || authenticatedPhone !== phone) {
    return res.status(401).json({ error: "Please sign in again before requesting a withdrawal." });
  }
  if (!PHONE_PATTERN.test(phone) || !Number.isInteger(withAmt) || withAmt <= 0 || !["MTN", "AIRTEL", "USDT"].includes(operator) || !withdrawPhone) {
    return res.status(400).json({ error: "Missing payout parameters. Enter a valid withdrawal amount." });
  }

  try {
    const config = await getSiteConfig();
    const minimumWithdrawal = getMinimumWithdrawalAmount(config);
    const maximumWithdrawal = getMaximumWithdrawalAmount(config);
    if (withAmt < minimumWithdrawal) {
      return res.status(400).json({ error: `Minimum withdrawal is UGX ${minimumWithdrawal.toLocaleString()}.` });
    }
    if (maximumWithdrawal > 0 && withAmt > maximumWithdrawal) {
      return res.status(400).json({ error: `Maximum withdrawal is UGX ${maximumWithdrawal.toLocaleString()}.` });
    }

    const activeSubscriptions = await getUserSubscriptions(phone);
    if (!activeSubscriptions.some((subscription) => subscription.status === "active")) {
      return res.status(400).json({ error: "You must have an active product subscription to withdraw." });
    }
    const withdrawMode = getConfiguredWithdrawMode(config);
    const withdrawFeePercent = config.withdrawFee ?? 0;
    const withdrawFeeAmount = Math.max(0, Math.floor(withAmt * (withdrawFeePercent / 100)));
    const payoutAmount = Math.max(0, withAmt - withdrawFeeAmount);

    if (payoutAmount <= 0) {
      return res.status(400).json({ error: "Withdrawal amount is too small after fees. Please request a larger amount." });
    }

    // Give the user a balance-specific response before checking gateway
    // configuration. The atomic reservation below repeats this check to
    // protect against concurrent withdrawals.
    const currentUser = await getUserProfile(phone);
    if (!currentUser) {
      return res.status(404).json({ error: "User account not found." });
    }
    if (Number(currentUser.points || 0) < withAmt) {
      return res.status(400).json({ error: `Insufficient withdrawable balance. Available: UGX ${Number(currentUser.points || 0).toLocaleString()}.` });
    }

    // USDT has no gateway provider (the gateway is mobile-money only), so it is
    // always settled manually by admin — even in automatic mode and even
    // when no Mobile Money credentials are configured.
    if (withdrawMode === "manual" || operator === "USDT") {
      const cashoutResult = await requestCashout(phone, withAmt, undefined, "manual", withdrawPhone, operator, {
        feePercent: withdrawFeePercent,
        feeAmount: withdrawFeeAmount,
        payoutAmount
      });
      return res.json({
        success: true,
        status: "PENDING",
        mode: "manual",
        profile: publicProfile(cashoutResult.profile),
        transaction: { id: cashoutResult.id, status: cashoutResult.status },
        message: "Withdrawal submitted and is pending admin approval."
      });
    }

    const zKey = process.env.PAYMENT_SECRET_KEY;
    const pin = process.env.PAYMENT_WITHDRAW_PASSWORD || "";
    if (!zKey) {
      throw new Error(` configuration secret key is missing (PAYMENT_SECRET_KEY). Env loaded path: "${appliedEnvPath || "None"}". Checked paths: [${searchPaths.slice(0, 10).join(", ")}]. Loaded env keys: ${Object.keys(process.env).filter(k => k.includes("PAYMENT") || k.includes("PORT") || k.includes("APP")).join(", ")}`);
    }

    const trans_id = createTransactionId("WDR");
    const token = await getGatewayToken();
    const webhookUrl = process.env.PAYMENT_WEBHOOK_URL || `${req.protocol}://${req.get("host")}/api/payment/webhook`;

    // Record the pending withdrawal before contacting the provider. A fast
    // provider callback must always find a local transaction to settle.
    const cashoutResult = await requestCashout(phone, withAmt, trans_id, "automatic", withdrawPhone, operator, {
      feePercent: withdrawFeePercent,
      feeAmount: withdrawFeeAmount,
      payoutAmount
    });

    let withdrawRes: Response;
    try {
      withdrawRes = await fetchWithTimeout(`${PAYMENT_GATEWAY_URL}/api/withdraw`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "secret_key": zKey,
          "Authorization": `Bearer ${token}`,
          "password": pin
        },
        body: JSON.stringify({
          amount: payoutAmount,
          phone: withdrawPhone,
          trans_id,
          reason: trans_id,
          callback_url: webhookUrl,
          webhook_url: webhookUrl
        })
      });
    } catch (error: any) {
      // A timeout can mean the provider accepted the payout. Keep the local
      // record pending so a later webhook cannot pay against a refunded user.
      logError("Withdrawal request outcome is unknown:", error);
      return res.status(202).json({
        success: true,
        status: "PENDING",
        mode: "automatic",
        profile: publicProfile(cashoutResult.profile),
        transaction: cashoutResult,
        message: "Withdrawal submitted. Awaiting payment-provider webhook confirmation."
      });
    }

    const bodyText = await withdrawRes.text();
    let withResult: any = {};
    try {
      withResult = JSON.parse(bodyText);
    } catch (e) {
      console.warn("Withdraw returned non-JSON text:", bodyText);
    }

    if (!withdrawRes.ok) {
      await completeFailedTransaction(trans_id);
      return res.status(400).json({
        error: withResult.message || withResult.error || `Withdrawal gateway failed: ${withdrawRes.status}`
      });
    }

    const finalTransaction = await getTransaction(trans_id);
    const finalProfile = await getUserProfile(phone);
    res.json({
      success: true,
      status: String(finalTransaction?.status || "PENDING").toUpperCase(),
      mode: "automatic",
      profile: publicProfile(finalProfile || cashoutResult.profile),
      transaction: finalTransaction || { id: trans_id, status: "PENDING" },
      zuluResponse: withResult
    });

  } catch (error: any) {
    logError("Withdrawal error:", error);
    res.status(400).json({ error: error.message });
  }
});

// 4. GATEWAY WEBHOOK / CALLBACK (Provide this URL to your provider)
app.post("/api/payment/webhook", async (req, res) => {
  try {
    console.log("Received Webhook Callback:", JSON.stringify(req.body, null, 2));

    const payload = req.body || {};
    const trans_id = payload.trans_id || payload.transaction_id || payload.data?.trans_id || payload.data?.transaction_id;
    const rawStatus = payload.status || payload.transaction_status || payload.data?.status || payload.data?.transaction_status;

    if (!trans_id) {
      console.warn("Webhook received without transaction ID:", payload);
      return res.status(200).json({ received: true, status: "ignored_missing_trans_id" });
    }

    if (!rawStatus) {
      console.warn("Webhook received without status:", payload);
      return res.status(200).json({ received: true, status: "ignored_missing_status" });
    }

    // Normalize incoming status from the gateway
    let normalizedStatus = "PENDING";
    const upperStatus = String(rawStatus).toUpperCase();
    if (upperStatus === "SUCCESS" || upperStatus === "SUCCESSFUL" || upperStatus === "COMPLETED") {
      normalizedStatus = "SUCCESSFUL";
    } else if (upperStatus === "FAIL" || upperStatus === "FAILED" || upperStatus === "REJECTED") {
      normalizedStatus = "FAILED";
    }

    console.log(`Webhook parsed: trans_id=${trans_id}, status=${normalizedStatus} (original: ${rawStatus})`);

    // Fetch local transaction record
    const tx = await getTransaction(trans_id);
    if (!tx) {
      console.warn(`Webhook transaction not found in local DB: ${trans_id}`);
      return res.status(200).json({ received: true, status: "ignored_not_found" });
    }

    if ((tx.type === "withdrawal" || tx.type === "withdraw") && String(tx.mode || "").toLowerCase() !== "automatic") {
      console.warn(`Ignoring provider webhook for manual withdrawal: ${trans_id}`);
      return res.status(200).json({ received: true, status: "ignored_manual_withdrawal" });
    }

    // Prevent double processing
    if (tx.status === "SUCCESSFUL" || tx.status === "FAILED") {
      console.log(`Webhook transaction already settled: trans_id=${trans_id}, status=${tx.status}`);
      return res.status(200).json({ received: true, status: "already_settled" });
    }

    // Process state change
    if (normalizedStatus === "SUCCESSFUL") {
      if (tx.type === "deposit") {
        await completeSuccessfulDeposit(
          tx.userId,
          tx.amount,
          tx.phone,
          tx.operator,
          trans_id
        );
        console.log(`Webhook successfully processed deposit: ${trans_id}`);
      } else if (tx.type === "withdrawal" || tx.type === "withdraw") {
        await completeSuccessfulWithdrawal(trans_id);
        console.log(`Webhook successfully processed withdrawal: ${trans_id}`);
      } else {
        await completeSuccessfulGpuActivation(
          tx.userId,
          tx.itemId,
          trans_id,
          tx.phone,
          tx.operator,
          tx.amount
        );
        console.log(`Webhook successfully processed GPU activation: ${trans_id}`);
      }
    } else if (normalizedStatus === "FAILED") {
      await completeFailedTransaction(trans_id);
      console.log(`Webhook successfully processed failed transaction: ${trans_id}`);
    } else {
      console.log(`Webhook status still pending: ${trans_id}`);
    }

    res.status(200).json({ received: true, status: "processed", transaction_status: normalizedStatus });
  } catch (error) {
    logError("Webhook error:", error);
    // A settlement failure should be retried by the provider. Returning 200
    // here would acknowledge the webhook while leaving the withdrawal stuck.
    res.status(500).json({ received: false, error: error instanceof Error ? error.message : String(error) });
  }
});

// Kept for backward compatibility
app.post("/api/profile/deposit", async (req, res) => {
  const { phone, amount, operator, depositPhone } = req.body;
  const depAmt = parseInt(amount);

  if (!phone || isNaN(depAmt) || depAmt <= 0 || !operator || !depositPhone) {
    return res.status(400).json({ error: "Please input full merchant phone, operator, and valid non-zero deposit amount." });
  }

  try {
    const config = await getSiteConfig();
    const minimumDeposit = getMinimumDepositAmount(config);
    const maximumDeposit = getMaximumDepositAmount(config);
    if (depAmt < minimumDeposit) {
      return res.status(400).json({ error: `Minimum deposit is UGX ${minimumDeposit.toLocaleString()}.` });
    }
    if (maximumDeposit > 0 && depAmt > maximumDeposit) {
      return res.status(400).json({ error: `Maximum deposit is UGX ${maximumDeposit.toLocaleString()}.` });
    }

    const updatedProfile = await processDeposit(phone, depAmt, operator, depositPhone);
    res.json({ success: true, profile: publicProfile(updatedProfile) });
  } catch (error: any) {
    logError("Direct deposit error:", error);
    res.status(400).json({ error: error.message });
  }
});

// Fetch non-simulated persistent user notification logs
app.get("/api/profile/notifications/:phone", async (req, res) => {
  try {
    const phone = normalizePhone(req.params.phone);
    const authenticatedPhone = await getAuthenticatedUserPhone(req);
    if (!authenticatedPhone || authenticatedPhone !== phone) {
      return res.status(401).json({ error: "Please sign in again to view alert history." });
    }
    const logs = await getUserNotifications(phone);
    res.json(logs);
  } catch (error: any) {
    logError("Fetch notifications list exception:", error);
    res.status(500).json({ error: error.message });
  }
});

// Fetch non-simulated user transactions
app.get("/api/profile/transactions/:phone", async (req, res) => {
  try {
    const phone = normalizePhone(req.params.phone);
    const authenticatedPhone = await getAuthenticatedUserPhone(req);
    if (!authenticatedPhone || authenticatedPhone !== phone) {
      return res.status(401).json({ error: "Please sign in again to view transaction history." });
    }
    const list = await getUserTransactions(phone);
    res.json(list);
  } catch (error: any) {
    logError("Fetch transactions exception:", error);
    res.status(500).json({ error: error.message });
  }
});

// Referrals summary categorized index
app.get("/api/profile/referrals/:phone", async (req, res) => {
  try {
    const statsList = await getReferreeStatsList(req.params.phone);
    res.json(statsList);
  } catch (error: any) {
    logError("Get referrals lists error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ================= MESSAGE ROOM ENDPOINTS =================

// Fetch messages for a specific room
app.get("/api/chat/room/:roomId", async (req, res) => {
  try {
    const list = await getChatMessages(req.params.roomId);
    res.json(list);
  } catch (error: any) {
    logError("Get chats error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Post a chat message
app.post("/api/chat/send", async (req, res) => {
  const { roomId, sender, senderName, text, image } = req.body;

  if (!roomId || !sender || !senderName || (!text && !image)) {
    return res.status(400).json({ error: "Incomplete chat parameters." });
  }

  try {
    const newMsg = await sendChatMessage({ roomId, sender, senderName, text: text || "", image });

    res.json({ success: true, message: newMsg });
  } catch (error: any) {
    logError("Send message error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Fetch active admin support conversations
app.get("/api/admin/chat/conversations", async (req, res) => {
  try {
    const data = await adminGetChatConversations();
    res.json(data);
  } catch (error: any) {
    logError("Get admin conversations error:", error);
    res.status(500).json({ error: error.message });
  }
});

// System global telemetry metrics
app.get("/api/system/stats", async (req, res) => {
  try {
    const data = await fetchSystemDashboardStats();
    res.json(data);
  } catch (error: any) {
    logError("Get system stats error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ================= GEMINI Miner Assistant =================

// In-memory rate limiting map for AI Copilot (phone -> { count, date })
const copilotRateLimit = new Map<string, { count: number, date: string }>();

app.post("/api/copilot/chat", async (req, res) => {
  const { messages, userProfile, activeSubscriptions } = req.body;
  
  // Rate Limiting (20 msgs / day — cap is silent in UI)
  if (userProfile?.phone) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const userLimit = copilotRateLimit.get(userProfile.phone);
    if (userLimit && userLimit.date === today) {
      if (userLimit.count >= 20) {
        return res.status(429).json({ error: "You've reached today's AI message limit. Please try again tomorrow!" });
      }
      userLimit.count += 1;
    } else {
      copilotRateLimit.set(userProfile.phone, { count: 1, date: today });
    }
  }

  const siteConfig = await getSiteConfig();
  const brand = siteConfig?.brandName || "Loading...";
  const manifestDesc = siteConfig?.manifestDescription || "Loading description...";

  let catalogProductsList = "";
  let categoriesList = "";
  let activeCodesList = "";
  let vipTasksList = "";
  // Client-supplied figures as fallback; refreshed from the database below so
  // the AI never quotes a stale balance the user saw minutes ago.
  let liveUsername = userProfile?.username || "Guest";
  let liveWithdrawable = Number(userProfile?.points || 0);
  let liveRechargeable = Number(userProfile?.rechargeBalance || 0);
  let liveWithdrawn = Number(userProfile?.withdrawnCash || 0);
  let liveReferralEarned = Number(userProfile?.referralRewardsEarned || 0);
  let liveInvites = Number(userProfile?.invitesCount || 0);
  let liveVipLevel = 0;
  let liveLevelBonus = "";

  const accountPhone = typeof userProfile?.phone === "string" ? userProfile.phone.trim() : "";

  try {
    const [catalogItems, giftCodes, freshProfile, vipBoard] = await Promise.all([
      getSubscriptionItems(),
      adminGetGiftCodes(),
      accountPhone ? getUserProfile(accountPhone).catch(() => null) : Promise.resolve(null),
      accountPhone ? getVipTaskboard(accountPhone).catch(() => null) : Promise.resolve(null)
    ]);

    const customCats: string[] = siteConfig?.categories || [];
    const itemCats = catalogItems.map((i) => i.category).filter(Boolean);
    const allCategories = Array.from(new Set([...customCats, ...itemCats]));
    categoriesList = allCategories.length > 0 ? allCategories.join(", ") : "General";

    catalogProductsList = catalogItems
      .map(
        (i) =>
          `- ${i.name} (Category: ${i.category}): Price UGX ${i.amount.toLocaleString()}, Daily Income UGX ${i.dailyYield.toLocaleString()}, Duration ${i.duration} Days, Total Return UGX ${(i.dailyYield * i.duration).toLocaleString()}`
      )
      .join("\n");

    const validGiftCodes = giftCodes.filter(
      (c) => c.status === "active" && (!c.expiryDate || new Date(c.expiryDate).getTime() > Date.now())
    );
    activeCodesList = validGiftCodes.length > 0
      ? validGiftCodes
          .map((c) => `- Gift Code: "${c.code}" | Reward: UGX ${c.amount.toLocaleString()} | Redemptions Left: ${c.maxRedemptions - c.currentRedemptions}`)
          .join("\n")
      : "No active gift codes currently.";

    if (freshProfile) {
      liveUsername = freshProfile.username || liveUsername;
      liveWithdrawable = Number(freshProfile.points || 0);
      liveRechargeable = Number(freshProfile.rechargeBalance || 0);
      liveWithdrawn = Number(freshProfile.withdrawnCash || 0);
      liveReferralEarned = Number(freshProfile.referralRewardsEarned || 0);
      liveInvites = Number(freshProfile.invitesCount || 0);
    }
    if (vipBoard) {
      liveVipLevel = Number(vipBoard.vipLevel || 0);
      const p = vipBoard.progress || {};
      const fmt = (n: unknown) => `UGX ${Number(n || 0).toLocaleString()}`;
      liveLevelBonus = `L1 ${fmt(p.level1Bonus)}, L2 ${fmt(p.level2Bonus)}, L3 ${fmt(p.level3Bonus)}, L4 ${fmt(p.level4Bonus)}`;
      const tasks = Array.isArray(vipBoard.tasks) ? vipBoard.tasks : [];
      vipTasksList = tasks.length > 0
        ? tasks.slice(0, 12).map((t: any) => {
            const state = t.unlocked && !t.stageLocked ? "DONE — its stage can be claimed once every achievement in it is done" : `progress ${t.progress} of ${t.requiredBonus}`;
            return `- ${t.title} [${t.category}]: needs ${t.progress}/${t.requiredBonus} ${t.metric}, stage reward claimed on the Journey page [${state}]`;
          }).join("\n")
        : "No milestones configured right now.";
    }
  } catch (err) {
    logError("Failed fetching catalog/gift code items for AI prompt:", err);
  }

  const keys = [
    process.env.OPENROUTER_API_KEY,
    process.env.OPENROUTER_API_KEY_2,
    process.env.OPENROUTER_API_KEY_3
  ].map(k => k?.trim()).filter(Boolean).filter(k => k && k !== "MY_OPENROUTER_API_KEY" && k !== "YOUR_OPENROUTER_API_KEY" && k.length > 10) as string[];

  if (keys.length === 0) {
    // Server-config state, never a user-facing key message.
    console.error("[OpenRouter] No API keys configured.");
    return res.status(503).json({ error: "The AI assistant is busy right now. Please try again in a moment." });
  }

  try {
    const systemInstruction = `You are "${brand} AI", the official Support Consultant of "${brand}".
Description: ${manifestDesc}

Platform Config & Financial Parameters:
- **Site Name**: ${brand}
- **Withdrawal Fee**: ${siteConfig?.withdrawFee || 0}% for all withdrawal requests (MTN, Airtel, USDT TRC20)
- **Level 1 Referral Commission Rate**: ${siteConfig?.level1InviteIncomePct !== undefined ? siteConfig.level1InviteIncomePct : 15}%
- **Level 2 Referral Commission Rate**: ${siteConfig?.level2InviteIncomePct !== undefined ? siteConfig.level2InviteIncomePct : 5}%
- **Level 3 Referral Commission Rate**: ${siteConfig?.level3InviteIncomePct !== undefined ? siteConfig.level3InviteIncomePct : 0}%
- **Level 4 Referral Commission Rate**: ${siteConfig?.level4InviteIncomePct !== undefined ? siteConfig.level4InviteIncomePct : 0}%
- **Registration Bonus**: UGX ${(siteConfig?.registrationBonus || 0).toLocaleString()} Shs
- **Official WhatsApp Support Link**: ${siteConfig?.whatsappLink || "Not configured"}
- **Official Telegram Group Link**: ${siteConfig?.telegramLink || "Not configured"}

Active Gift Codes / Vouchers:
${activeCodesList}

Available Product Categories:
${categoriesList}

Available Products Catalog:
${catalogProductsList || "No products currently listed."}

Current User Details (fresh from the database as of this message):
- Username: ${liveUsername}
- Phone: ${userProfile?.phone || "None"}
- Rechargeable balance: UGX ${liveRechargeable.toLocaleString()} (deposit funds land here; this balance is spent to rent products — it is NOT withdrawable)
- Withdrawable balance: UGX ${liveWithdrawable.toLocaleString()} (daily income, bonuses and rewards land here; withdrawals come from this balance)
- Total withdrawn to date: UGX ${liveWithdrawn.toLocaleString()}
- Referral income earned: UGX ${liveReferralEarned.toLocaleString()} across ${liveInvites} invites${liveLevelBonus ? ` (by level — ${liveLevelBonus})` : ""}
- Operator level: ${liveVipLevel}
- Active products count: ${activeSubscriptions?.length || 0} active products

Their milestone board (progress is their live operator points total):
${vipTasksList || "Sign-in data unavailable — speak generally about milestones."}

How ${brand} works (always explain it this way):
- Users deposit funds into their rechargeable balance. That balance is used to rent products in the system.
- Each product has a cycle (duration in days) and earns daily income. Daily income is credited to the user's withdrawable balance.
- Withdrawals come from the withdrawable balance to Mobile Money or USDT. Withdrawals only work if the user has a product — users without any product cannot withdraw.
- We support both instant Mobile Money (MTN/Airtel) and USDT payments.

Knowledge & Capabilities:
- **Recharge (Deposit)**: Users can deposit via instant Mobile Money (MTN/Airtel) or USDT TRC20 into their rechargeable balance to rent products.
- **Withdrawal**: Withdraw from the withdrawable balance to Mobile Money or USDT. Only works with an active product. Withdrawal fee is exactly ${siteConfig?.withdrawFee || 0}%.
- **Invite Program**: Users share referral links and earn ${siteConfig?.level1InviteIncomePct ?? 15}% on Level 1, ${siteConfig?.level2InviteIncomePct ?? 5}% on Level 2, ${siteConfig?.level3InviteIncomePct ?? 0}% on Level 3, and ${siteConfig?.level4InviteIncomePct ?? 0}% on Level 4 when invited friends activate products (referrals only pay while the invitee has an active product).
- **Gift Codes**: New gift codes are given out daily in the community groups set by the admin (WhatsApp: ${siteConfig?.whatsappLink || "N/A"}, Telegram: ${siteConfig?.telegramLink || "N/A"}). Tell users to join the community groups to claim them.
- **Milestones**: Journey stages with achievements. A stage reward is claimed once, only when every achievement in that stage is done. Quote their real figures, and direct them to claim finished stages on the Journey page.
- **Support Links**: WhatsApp (${siteConfig?.whatsappLink || "N/A"}) and Telegram (${siteConfig?.telegramLink || "N/A"}).

Instructions:
1. Speak confidently, warmly, and helpfully like a knowledgeable support consultant. Never mention mining, miners, nodes, or GPUs — always say products.
2. The platform is called "${brand}". Always refer to it by this name wherever a name fits.
3. Provide exact facts when users ask about withdrawal fees (${siteConfig?.withdrawFee || 0}%), invite rates (${siteConfig?.level1InviteIncomePct ?? 15}% L1, ${siteConfig?.level2InviteIncomePct ?? 5}% L2, ${siteConfig?.level3InviteIncomePct ?? 0}% L3, ${siteConfig?.level4InviteIncomePct ?? 0}% L4), support links, or active gift codes.
4. Keep replies concise, friendly, and well structured: use short lines, **bold** key figures (amounts, rates), and bullet lists (-) for multi-step answers. Never send a wall of text. Limit responses below 120 words.
4. Format response strictly as simple JSON object:
{
  "text": "Your response in clean markdown layout."
}`;

    // Build OpenRouter messages: system + conversation history
    const historyMessages = (messages || []).map((m: any) => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: String(m.text || "")
    }));

    const openRouterMessages = [
      { role: "system", content: systemInstruction },
      ...historyMessages
    ];

    const model = process.env.OPENROUTER_MODEL?.trim() || "openrouter/free";

    // Only auth-class failures implicate a key — and even those just rotate,
    // they never surface key wording to the user. Everything else (429/5xx,
    // timeouts, empty bodies) is transient and worth an automatic retry.
    const isAuthFailure = (status: number, message: string) =>
      status === 401 || status === 403 ||
      /api[_-]?key|unauthori[sz]ed|forbidden|invalid[^a-z0-9]*key|credential/i.test(message || "");
    const isRetryableFailure = (status: number, message: string) =>
      !isAuthFailure(status, message) &&
      (status === 408 || status === 425 || status === 429 || status >= 500 ||
        /timeout|abort|econn|enotfound|socket|rate.?limit|overload|try again|empty response|invalid json/i.test(message || ""));

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const attemptKey = async (key: string): Promise<string> => {
      const appUrl = process.env.APP_URL?.replace(/\/$/, "") || process.env.VITE_APP_URL?.replace(/\/$/, "") || "https://www.pjnatal.com";
      const res = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": appUrl,
          "X-Title": brand
        },
        body: JSON.stringify({
          model,
          messages: openRouterMessages,
          max_tokens: 512,
          temperature: 0.7
        })
      });

      const raw = await res.text();
      if (!res.ok) {
        let parsed: any = null;
        try { parsed = JSON.parse(raw); } catch {}
        const msg = parsed?.error?.message || parsed?.error || raw || `OpenRouter ${res.status}`;
        const err: any = new Error(String(msg).slice(0, 300));
        err.status = res.status;
        throw err;
      }

      let data: any = null;
      try { data = JSON.parse(raw); } catch { throw new Error("Invalid JSON from OpenRouter"); }

      const content = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || "";
      if (!content) throw new Error("Empty response from OpenRouter");
      return String(content).trim();
    };

    let responseText = "";
    for (let i = 0; i < keys.length && !responseText; i++) {
      // Two attempts per key: the retry that used to require the user to tap
      // again now happens here before any error is manufactured.
      for (let attempt = 0; attempt < 2 && !responseText; attempt++) {
        try {
          console.log(`[OpenRouter] Attempting model ${model} with key index ${i}, try ${attempt}`);
          const content = await attemptKey(keys[i]);
          // Wrap as our expected JSON envelope
          responseText = JSON.stringify({ text: content });
        } catch (err: any) {
          const status = Number(err?.status || 0);
          console.warn(`[AI Model warning] key index ${i} try ${attempt} failed (${status || "network"}).`, err.message || err);
          if (isAuthFailure(status, err?.message || "")) break; // bad key: rotate, never retry it
          if (attempt === 0 && isRetryableFailure(status, err?.message || "")) {
            await sleep(800 + i * 400);
            continue;
          }
          break; // non-retryable or out of attempts: next key
        }
      }
    }

    if (!responseText) {
      // Neutral in every case — real cause stays in server logs. Key state
      // is a server-config concern and is never reported to the user.
      throw new Error("AI busy");
    }

    // Strip any markdown codeblock wrappers if present
    let cleanedTextStr = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();

    let result: { text: string };
    try {
      result = JSON.parse(cleanedTextStr);
    } catch (parseErr) {
      console.error("[AI parse error] could not parse response text directly:", cleanedTextStr);
      result = { text: cleanedTextStr };
    }

    // Double check if result.text contains stringified JSON or markdown codeblocks
    if (typeof result.text === "string") {
      let t = result.text.trim();
      if (t.startsWith("```json") || t.startsWith("{")) {
        const innerClean = t.replace(/```json/gi, "").replace(/```/g, "").trim();
        try {
          const parsedInner = JSON.parse(innerClean);
          if (parsedInner.text && typeof parsedInner.text === "string") {
            t = parsedInner.text;
          }
        } catch (_) {}
      }
      result.text = t;
    }

    res.json(result);
  } catch (err: any) {
    console.error("AI Copilot Error:", err?.message || err);
    res.status(503).json({ error: "The AI assistant is busy right now. Please try again in a moment." });
  }
});

// Admin endpoint to wipe and flush the database to start completely fresh
app.post("/api/admin/flush-db-now", async (req, res) => {
  try {
    console.log("[Admin API] Received request to flush and restart database collections...");
    const result = await flushDatabase();
    res.json({
      success: true,
      message: `Database successfully flushed! Deleted ${result.deletedCount} total routing document nodes, and re-placed fresh item catalog definitions.`,
      ...result
    });
  } catch (err: any) {
    logError("[Admin API Failure] DB flush failed:", err);
    res.status(500).json({ error: "Failed to flush database", details: err.message });
  }
});

// Admin API: List all user profiles
app.get("/api/admin/users", async (req, res) => {
  try {
    const users = await adminGetAllUsers();
    res.json(users.map((user) => publicProfile(user)));
  } catch (err: any) {
    logError("[Admin API Error] Fetch all users failed:", err);
    res.status(500).json({ error: "Failed to load users list", details: err.message });
  }
});

app.get("/api/admin/vip-task-claims", async (_req, res) => {
  try {
    res.json(await listPendingVipTaskClaims());
  } catch (err: any) {
    logError("[Admin API Error] Fetch milestone submissions failed:", err);
    res.status(500).json({ error: "Unable to load task submissions." });
  }
});

app.post("/api/admin/vip-task-claims/review", async (req, res) => {
  const { claimId, decision, note } = req.body || {};
  if (!claimId || !["approve", "reject"].includes(String(decision))) {
    return res.status(400).json({ error: "Choose a valid review action." });
  }
  try {
    const config = await getSiteConfig();
    const result = await reviewVipTaskClaim(String(claimId), decision, String(config.adminPhone || "admin"), String(note || ""));
    res.json(result);
  } catch (err: any) {
    res.status(409).json({ error: err.message || "Unable to review this submission." });
  }
});

// Admin API: Override a user's password override
app.post("/api/admin/users/override-password", async (req, res) => {
  const { phone, newPassword } = req.body;
  if (!phone || !newPassword) {
    return res.status(400).json({ error: "Missing required parameters: phone, newPassword" });
  }
  try {
    await adminOverridePassword(phone, newPassword);
    res.json({ success: true, message: `Password for user ${phone} successfully updated.` });
  } catch (err: any) {
    logError("[Admin API Error] Override password failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Admin API: List all transaction logs
app.get("/api/admin/transactions", async (req, res) => {
  try {
    const transactions = await adminGetAllTransactions();
    res.json(transactions);
  } catch (err: any) {
    logError("[Admin API Error] Fetch all transactions failed:", err);
    res.status(500).json({ error: "Failed to load transaction history", details: err.message });
  }
});

// Admin API: Manually approve / reject or complete pending transaction state
app.post("/api/admin/transactions/update-status", async (req, res) => {
  const { transId, status } = req.body;
  if (!transId || !status) {
    return res.status(400).json({ error: "Missing required values: transId and target status" });
  }
  try {
    await adminUpdateTransactionStatus(transId, status);
    res.json({ success: true, message: `Transaction ${transId} successfully updated to status: ${status}.` });
  } catch (err: any) {
    logError("[Admin API Error] Transaction update failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Admin API: Create or update catalog node subscription item config specifications
app.post("/api/admin/catalog/save", async (req, res) => {
  const item = req.body;
  if (!item || !item.id || !item.name || item.amount == null || item.duration == null || item.dailyYield == null || !item.category) {
    return res.status(400).json({ error: "Missing required fields to update catalog item parameters." });
  }
  try {
    const numAmount = Number(item.amount);
    const numDuration = Number(item.duration);
    const numYield = Number(item.dailyYield);
    const numBonus = item.inviteBonusPercent == null || item.inviteBonusPercent === ""
      ? 0
      : Number(item.inviteBonusPercent);
    if (!Number.isInteger(numAmount) || numAmount <= 0 || !Number.isInteger(numDuration) || numDuration <= 0 || !Number.isFinite(numYield) || numYield < 0 || !Number.isFinite(numBonus) || numBonus < 0) {
      return res.status(400).json({ error: "Amount and duration must be positive whole numbers; yields and bonuses must be valid non-negative numbers." });
    }

    await adminSaveCatalogItem({
      ...item,
      id: String(item.id).trim(),
      name: String(item.name).trim(),
      category: String(item.category).trim(),
      amount: numAmount,
      duration: numDuration,
      dailyYield: numYield,
      inviteBonusPercent: numBonus
    });
    res.json({ success: true, message: `Catalog item ${item.name} configured successfully.` });
  } catch (err: any) {
    logError("[Admin API Error] Store catalog config failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Admin API: Delete catalog node
app.post("/api/admin/catalog/delete", async (req, res) => {
  const { itemId } = req.body;
  if (!itemId) {
    return res.status(400).json({ error: "Missing required value: itemId" });
  }
  try {
    await adminDeleteCatalogItem(itemId);
    res.json({ success: true, message: `Catalog node ${itemId} has been purged successfully.` });
  } catch (err: any) {
    logError("[Admin API Error] Delete catalog item failed:", err);
    res.status(550).json({ error: err.message });
  }
});

// Admin API: Delete ALL catalog nodes
app.post("/api/admin/catalog/delete-all", async (req, res) => {
  try {
    const { count } = await adminDeleteAllCatalogItems();
    res.json({ success: true, message: `Successfully deleted all ${count} catalog nodes.` });
  } catch (err: any) {
    logError("[Admin API Error] Delete all catalog items failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Admin API: List all catalog nodes with active subscriber counts
app.get("/api/admin/catalog/nodes", async (req, res) => {
  try {
    const items = await adminGetCatalogItems();
    res.json(items);
  } catch (err: any) {
    logError("[Admin API Error] Fetch all catalog nodes failed:", err);
    res.status(500).json({ error: "Failed to load catalog nodes list" });
  }
});

// Admin API: Lock / Unlock a user
app.post("/api/admin/users/lock", async (req, res) => {
  const { phone, locked } = req.body;
  if (!phone || typeof locked !== "boolean") {
    return res.status(400).json({ error: "Missing required parameters: phone, locked" });
  }
  try {
    await adminUpdateUserLockStatus(phone, locked);
    res.json({ success: true, message: `Account for ${phone} is now ${locked ? "locked" : "unlocked"}.` });
  } catch(err: any) {
    logError("[Admin API Error] Lock user failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Admin API: Credit or debit a user's withdrawable (points) or deposit
// (rechargeBalance) balance by a signed delta. Writes an audit-only ledger
// row that is hidden from the user's own history.
app.post("/api/admin/users/adjust-balance", async (req, res) => {
  const { phone, target, amount, reason } = req.body;
  if (!phone || !target || amount === undefined || amount === null) {
    return res.status(400).json({ error: "Missing required parameters: phone, target, amount" });
  }
  if (target !== "points" && target !== "rechargeBalance") {
    return res.status(400).json({ error: "Invalid balance target: expected 'points' or 'rechargeBalance'." });
  }
  const delta = Number(amount);
  if (!Number.isSafeInteger(delta) || delta === 0) {
    return res.status(400).json({ error: "Amount must be a non-zero whole number of UGX." });
  }
  try {
    const { balance } = await adminAdjustBalance(phone, target, delta, typeof reason === "string" ? reason.trim().slice(0, 200) : undefined);
    const label = target === "points" ? "withdrawable" : "deposit";
    res.json({
      success: true,
      balance,
      message: `${delta > 0 ? "Credited" : "Debited"} UGX ${Math.abs(delta).toLocaleString()} ${label}. New ${label} balance: UGX ${balance.toLocaleString()}.`
    });
  } catch (err: any) {
    logError("[Admin API Error] Balance adjustment failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/announcements", async (req, res) => {
  try {
    const announcements = await adminGetAnnouncements();
    res.json(announcements);
  } catch (err: any) {
    logError("[Admin API Error] Fetch announcements failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/announcements", async (req, res) => {
  const { title, message, readMoreLink, category, imageUrl, tag } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  try {
    await adminCreateAnnouncement(title, message, readMoreLink, category || "announcement", imageUrl, tag);
    res.json({ success: true, message: "Announcement published." });
  } catch (err: any) {
    logError("[Admin API Error] Create announcement failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/admin/announcements/:id", async (req, res) => {
  const { title, message, readMoreLink, category, imageUrl, tag } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  try {
    await adminUpdateAnnouncement(req.params.id, title, message, readMoreLink, category, imageUrl, tag);
    res.json({ success: true, message: "Announcement updated." });
  } catch (err: any) {
    logError("[Admin API Error] Update announcement failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/announcements/:id", async (req, res) => {
  try {
    await adminDeleteAnnouncement(req.params.id);
    res.json({ success: true, message: "Announcement deleted." });
  } catch (err: any) {
    logError("[Admin API Error] Delete announcement failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Site Config APIs
app.get("/api/manifest/icon", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  try {
    const config = await getSiteConfig();
    let logo = config.logoUrl || "";
    
    // If it's a raw SVG string
    if (logo.trim().toLowerCase().startsWith("<svg")) {
      if (!logo.includes('xmlns="http://www.w3.org/2000/svg"')) {
        logo = logo.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      res.setHeader("Content-Type", "image/svg+xml");
      return res.send(logo);
    } 
    
    // If it's a URL, we should redirect to it, or if it's empty, redirect to default png
    if (!logo) {
      const requestedSize = String(req.query.size) === "192" ? "192" : "512";
      return res.redirect(`/icon-${requestedSize}.png`);
    }

    return res.redirect(logo);
  } catch (err: any) {
    res.redirect("/icon-512.png");
  }
});

app.get("/api/manifest.json", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  try {
    const config = await getSiteConfig();
    const manifest = {
      id: "/",
      name: config.brandName || "RentDue Store",
      short_name: config.manifestShortName || config.brandName || "RentDue Store",
      description: config.manifestDescription || SEO_DESCRIPTION,
      start_url: "/",
      display: "standalone",
      display_override: ["window-controls-overlay", "standalone"],
      background_color: config.manifestBgColor || "#020617",
      theme_color: config.manifestThemeColor || "#020617",
      lang: "en",
      scope: "/",
      orientation: "portrait",
      icons: [
        {
          src: "/api/manifest/icon?size=192",
          sizes: "192x192",
          type: "image/png",
          purpose: "any"
        },
        {
          src: "/api/manifest/icon?size=512",
          sizes: "512x512",
          type: "image/png",
          purpose: "any"
        }
      ],
      screenshots: [
        {
          src: "/api/manifest/icon?size=512&type=wide",
          sizes: "512x512",
          type: "image/png",
          form_factor: "wide",
          label: "Desktop App View"
        },
        {
          src: "/api/manifest/icon?size=512&type=narrow",
          sizes: "512x512",
          type: "image/png",
          form_factor: "narrow",
          label: "Mobile App View"
        }
      ]
    };
    res.json(manifest);
  } catch (err: any) {
    // A temporary database issue should not make the app permanently
    // uninstallable. Return a valid fallback manifest while logging the cause.
    logError("[PWA] Manifest configuration lookup failed:", err);
    res.json({
      id: "/",
      name: "RentDue Store",
      short_name: "RentDue Store",
      description: SEO_DESCRIPTION,
      start_url: "/",
      display: "standalone",
      background_color: "#020617",
      theme_color: "#020617",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }
      ]
    });
  }
});

app.get("/api/config/site", async (req, res) => {
  try {
    const config = await getSiteConfig();
    // NEVER send admin password to frontend
    res.json({
      adminPhone: config.adminPhone,
      whatsappLink: config.whatsappLink,
      telegramLink: config.telegramLink,
      brandName: config.brandName,
      seoDescription: config.seoDescription || SEO_DESCRIPTION,
      logoUrl: config.logoUrl,
      logoType: config.logoType,
      logoSvg: config.logoSvg,
      withdrawFee: config.withdrawFee !== undefined ? config.withdrawFee : 0,
      minimumDeposit: getMinimumDepositAmount(config),
      maximumDeposit: getMaximumDepositAmount(config),
      minimumWithdrawal: getMinimumWithdrawalAmount(config),
      maximumWithdrawal: getMaximumWithdrawalAmount(config),
      allowAutoDeposit: config.allowAutoDeposit !== undefined ? config.allowAutoDeposit : true,
      allowManualDeposit: config.allowManualDeposit !== undefined ? config.allowManualDeposit : false,
      mtnReceiverPhone: config.mtnReceiverPhone || "",
      mtnReceiverName: config.mtnReceiverName || "",
      airtelReceiverPhone: config.airtelReceiverPhone || "",
      airtelReceiverName: config.airtelReceiverName || "",
      usdtAddress: config.usdtAddress || "",
      usdtNetwork: config.usdtNetwork || "TRC20",
      usdtLogoUrl: config.usdtLogoUrl || "",
      usdtQrUrl: config.usdtQrUrl || "",
      usdtRate: config.usdtRate || 3700,
      mtnLogoUrl: config.mtnLogoUrl || "",
      airtelLogoUrl: config.airtelLogoUrl || "",
      allowAutoWithdraw: config.allowAutoWithdraw !== undefined ? config.allowAutoWithdraw : true,
      allowManualWithdraw: config.allowManualWithdraw !== undefined ? config.allowManualWithdraw : false,
      level1InviteIncomePct: Number(config.level1InviteIncomePct ?? 15),
      level2InviteIncomePct: Number(config.level2InviteIncomePct ?? 5),
      level3InviteIncomePct: Number(config.level3InviteIncomePct ?? 0),
      level4InviteIncomePct: Number(config.level4InviteIncomePct ?? 0),
      vipTasks: Array.isArray(config.vipTasks) ? config.vipTasks : [],
      vipTaskCategories: Array.isArray(config.vipTaskCategories) ? config.vipTaskCategories : [],
      categories: Array.isArray((config as any).categories) ? (config as any).categories : [],
      categoryMeta: ((config as any).categoryMeta && typeof (config as any).categoryMeta === "object") ? (config as any).categoryMeta : {},
      registrationBonus: config.registrationBonus !== undefined ? config.registrationBonus : 0,
      inviteBonus: config.inviteBonus !== undefined ? config.inviteBonus : 0,
      checkinBaseBonus: config.checkinBaseBonus !== undefined ? config.checkinBaseBonus : 0,
      checkinIncrement: config.checkinIncrement !== undefined ? config.checkinIncrement : 0,
      themePreset: migratePresetServer(config.themePreset as string) || "hut12-light",
      themeMode: config.themeMode || "light",
      authBgImage: config.authBgImage || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1600&q=80",
      authSlideImages: Array.isArray((config as any).authSlideImages) ? (config as any).authSlideImages : [],
      dashboardBgImage: config.dashboardBgImage || "",
      cardStyle: migrateCardStyleServer(config.cardStyle as string) || "solid",
      buttonStyle: "pill-gradient",
      borderRadius: "rounded-2xl",
      primaryColor: config.primaryColor || "#c27a2e",
      accentColor: config.accentColor || "#f59e0b",
      secondaryColor: config.secondaryColor || "#0ea5e9",
      bgColor: config.bgColor || "",
      cardBgColor: config.cardBgColor || "",
      fontFamily: migrateFontFamilyServer(config.fontFamily) || "Sora",
      fontSizeScale: config.fontSizeScale || "md",
      textColor: config.textColor || "",
      updatedAt: (config as any).updatedAt || 0
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/access/activate", async (req, res) => {
  try {
    const config = await getSiteConfig();
    
    // Check if already seeded or activated
    if (config.hasBeenActivatedSeeded === true) {
      return res.status(400).json({ error: "Administration access has already been activated. Seeding is disabled for safety." });
    }
    
    // Retrieve credentials from environment variables without hardcoded fallbacks
    const adminPhone = (process.env.ADMIN_PHONE || "").trim().replace(/,$/, "").trim();
    const adminPass = (process.env.ADMIN_PASSWORD || process.env.ADMIN_PASS || "").trim().replace(/,$/, "").trim();
    const adminUsername = (process.env.ADMIN_USERNAME || "admin").trim().replace(/,$/, "").trim();

    if (!adminPhone || !adminPass) {
      return res.status(400).json({ error: "ADMIN_PHONE and ADMIN_PASSWORD environment variables are required to activate access." });
    }
    
    const updatedConfig = {
      ...config,
      adminPhone,
      adminPass,
      adminUsername,
      hasBeenActivatedSeeded: true
    };
    
    await updateSiteConfig(updatedConfig);

    // Idempotent: the activate page fires on mount (StrictMode double-invokes
    // in dev), so two requests can race past the seeded-guard above. If the
    // admin row already exists there is nothing left to do.
    const existingAdmin = await getUserProfile(adminPhone).catch(() => null);
    if (!existingAdmin) {
      try {
        // Create the admin user in standard users collection with 0 points (no funds)
        await registerUserProfile({
          phone: adminPhone,
          username: adminUsername,
          password: adminPass,
          referredByCode: "",
          operator: "MTN",
          points: 0, // No funds
          grantRegistrationBonus: false,
          withdrawnCash: 0,
          totalDeposits: 0,
          aiIncome: 0,
          createdAt: new Date().toISOString(),
          invitesCount: 0,
          referralRewardsEarned: 0
        });
      } catch (registerErr) {
        // Lost the race: a concurrent request created the row first.
        const raced = await getUserProfile(adminPhone).catch(() => null);
        if (!raced) throw registerErr;
      }
    }

    res.json({
      success: true,
      message: "Admin credentials successfully seeded from secure environment configuration. Access activated.",
      phone: adminPhone,
      username: adminUsername
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const password = req.body?.password;
    if (!phone || typeof password !== "string") {
      return res.status(400).json({ error: "Enter the admin phone number and password." });
    }
    if (!PHONE_PATTERN.test(phone)) {
      return res.status(400).json({ error: "Admin phone number must contain 9 or 10 digits." });
    }
    if (!password || password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ error: "Enter a valid admin password." });
    }
    const config = await getSiteConfig();
    const adminCheck = verifyPassword(config.adminPass || "", password);
    if (phone === config.adminPhone && adminCheck.ok) {
      if (adminCheck.needsRehash) {
        config.adminPass = (await updateSiteConfig({ adminPass: password })).adminPass;
      }
      // Keep the administrator usable on the normal user login screen too.
      // Older releases could mark activation complete while the users row was
      // never written, so repair that inconsistency on a valid admin login.
      const adminUser = await getUserProfile(phone);
      if (!adminUser) {
        await registerUserProfile({
          phone,
          username: config.adminUsername || "admin",
          password,
          points: 0,
          grantRegistrationBonus: false,
          referredByCode: "",
          operator: "MTN"
        });
      } else if (!verifyPassword(adminUser.password || "", password).ok) {
        await updateUserProfile(phone, { password });
      }
      const secret = adminSessionSecret(config);
      if (!secret) return res.status(503).json({ error: "Admin session security is not configured on the server." });
      res.setHeader("Set-Cookie", `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(signAdminSession(phone, secret))}; HttpOnly; Path=/api/admin; SameSite=Lax; Max-Age=${ADMIN_SESSION_TTL_SECONDS}`);
      res.json({ success: true });
    } else {
      res.status(401).json({ error: "Admin phone number or password is incorrect." });
    }
  } catch (err: any) {
    logError("[Admin Auth] login failed:", err);
    const response = errorResponse(err, "Admin sign-in is temporarily unavailable.", 500);
    res.status(response.status).json(response.body);
  }
});

app.post("/api/admin/logout", (_req, res) => {
  res.setHeader("Set-Cookie", `${USER_SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
  res.json({ success: true });
});

// Site image upload (logo etc.) — JSON base64, no extra deps. Files always go
// to Cloudinary and the returned secure_url is what gets saved in the DB.
// There is no local-disk fallback: ephemeral hosts lose it on restart.
// Behind the admin guard above.
const SITE_IMAGE_KINDS: Record<string, { exts: string[]; maxBytes: number; prefix: string; field: string }> = {
  logo: { exts: ["png", "jpg", "jpeg", "webp", "svg"], maxBytes: 2 * 1024 * 1024, prefix: "logo", field: "logoUrl" },
  authbg: { exts: ["png", "jpg", "jpeg", "webp"], maxBytes: 4 * 1024 * 1024, prefix: "authbg", field: "authBgImage" },
  dashboardbg: { exts: ["png", "jpg", "jpeg", "webp"], maxBytes: 4 * 1024 * 1024, prefix: "dashboardbg", field: "dashboardBgImage" },
  // Milestone art attaches to vipTasks[].imageUrl (no top-level field), so
  // pruning sweeps unreferenced prefix files instead of one previous path.
  viptask: { exts: ["png", "jpg", "jpeg", "webp"], maxBytes: 2 * 1024 * 1024, prefix: "viptask", field: "" },
};

app.post("/api/admin/upload", async (req, res) => {
  try {
    const kind = String(req.body?.kind || "logo");
    const spec = SITE_IMAGE_KINDS[kind];
    if (!spec) return res.status(400).json({ error: "Unknown upload kind." });

    const dataUrl = String(req.body?.data || "");
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: "Upload must be a base64 data URL." });

    const dataMime = match[1].toLowerCase();
    const extFromMime: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/webp": "webp",
      "image/svg+xml": "svg",
    };
    const ext = extFromMime[dataMime];
    if (!ext || !spec.exts.includes(ext)) {
      return res.status(400).json({ error: "Only PNG, JPG, WebP or SVG images are allowed." });
    }

    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length || buffer.length > spec.maxBytes) {
      return res.status(400).json({ error: "Image must be smaller than 2 MB." });
    }
    if (ext === "svg") {
      const text = buffer.toString("utf8");
      if (text.length > spec.maxBytes || /<script|on\w+\s*=|javascript:/i.test(text)) {
        return res.status(400).json({ error: "SVG contains blocked content." });
      }
    }

    if (!cloudinaryConfigured) {
      return res.status(500).json({ error: "Image uploads need Cloudinary keys (CLOUDINARY_*)." });
    }
    // Pure upload: validate, store, return the URL. Nothing is destroyed here —
    // replaced art is retired only after the new config saves successfully
    // (PUT /api/admin/config), so failed or abandoned uploads cannot break
    // the live site. Orphan aging runs fire-and-forget below.
    const uploadOpts: Record<string, unknown> = {
      folder: CLOUDINARY_FOLDER,
      public_id: `${spec.prefix}-${Date.now()}`,
      resource_type: "auto",
      overwrite: false,
    };
    if (kind === "viptask") {
      // Milestone art renders at thumbnail sizes; pre-warm light variants so
      // the first paint is fast even on bad connections. Clients request
      // f_auto,q_auto widths (see optimizedImageUrl), which then hit cache.
      uploadOpts.eager = [
        { width: 200, crop: "limit", quality: "auto", fetch_format: "auto" },
        { width: 900, crop: "limit", quality: "auto", fetch_format: "auto" },
      ];
    }
    const uploaded = await cloudinary.uploader.upload(dataUrl, uploadOpts);
    void collectImageOrphans();
    return res.json({ success: true, url: uploaded.secure_url });
  } catch (error: any) {
    logError("[Upload] failed:", error);
    res.status(500).json({ error: "Upload failed. Try again." });
  }
});

app.get("/api/admin/config", async (req, res) => {
  try {
    const config = await getSiteConfig();
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/admin/config", async (req, res) => {
  try {
    const previous = await getSiteConfig().catch(() => ({} as any));
    const previouslyLive = collectCloudinaryIds(previous);
    const sanitized = sanitizeSiteConfigServer(req.body);
    const updated = await updateSiteConfig(sanitized);
    // Retire replaced art only now that the new config is persisted. A failed
    // or abandoned save destroys nothing, so the live site can never 404.
    const stillLive = collectCloudinaryIds(updated);
    const retired = [...previouslyLive].filter((id) => !stillLive.has(id));
    if (retired.length) void destroyPublicIds(retired);
    res.json({ success: true, config: updated });
  } catch (err: any) {
    const response = errorResponse(err, "Unable to save site configuration.", 500);
    res.status(response.status).json(response.body);
  }
});

app.get("/api/user/gift_codes/available/:phone", async (req, res) => {
  try {
    const count = await getAvailableGiftCodeCount(req.params.phone);
    res.json({ available: count > 0, count });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/user/redeem_gift_code", async (req, res) => {
  try {
    const { phone, code } = req.body;
    const result = await redeemGiftCode(phone, code);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/user/checkin", async (req, res) => {
  try {
    const { phone } = req.body;
    const result = await dailyCheckin(phone);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Admin config endpoint
app.post("/api/admin/gift_codes", async (req, res) => {
  try {
    const { code, amount, maxRedemptions, expiryDate } = req.body;
    
    const result = await adminCreateGiftCode(code, amount, maxRedemptions, expiryDate);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/admin/gift_codes", async (req, res) => {
  try {
    const result = await adminGetGiftCodes();
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/admin/gift_codes/:id", async (req, res) => {
  try {
    await adminDeleteGiftCode(req.params.id);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Return JSON for malformed/oversized requests instead of Express' default
// HTML stack trace. This is especially important for mobile login and upload
// clients, which otherwise surface an opaque network error.
app.use((error: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ error: "Request is too large. Please reduce the upload size and try again." });
  }
  if (error instanceof SyntaxError && (error as any)?.status === 400) {
    return res.status(400).json({ error: "The request body is not valid JSON." });
  }
  next(error);
});

// Vite middleware setup (see next step)

async function startServer() {
  const startupStartedAt = Date.now();
  console.log(`[Startup] Starting server (node=${process.version}, env=${process.env.NODE_ENV || "development"})`);
  console.log(`[Startup] Database configuration: ${process.env.DATABASE_URL || process.env.MYSQL_URL ? "provided" : "missing"}`);
  try {
    // Verify the connection and create any missing application tables.
    await seedDatabaseIfEmpty();
    // hut12 tokens migration — heal stale site_config once at boot
    try {
      const rawConfig = await getSiteConfig();
      const rawPreset = String((rawConfig as any).themePreset || "");
      if (rawPreset && rawPreset !== "hut12-light" && rawPreset !== "hut12-dark") {
        const sanitized = sanitizeSiteConfigServer(rawConfig as any);
        await updateSiteConfig(sanitized);
        console.log(`[Startup] Migrated site_config themePreset ${rawPreset} -> ${(sanitized as any).themePreset}`);
      }
    } catch (e) {
      console.warn("[Startup] tokens migration check failed:", e);
    }
    databaseReady = true;
    console.log(`[Startup] Database ready in ${Date.now() - startupStartedAt}ms.`);
  } catch (seedErr) {
    databaseReady = false;
    console.error("[Startup] Database initialization failed. Server will not accept application traffic.", seedErr);
    process.exitCode = 1;
    return;
  }

  // Run once per platform day. The date guard also lets a restart after
  // midnight catch up without waiting for the next calendar day. The row lock
  // inside claimDailyReward keeps multiple server instances idempotent.
  let lastAutoCollectDate: string | null = null;
  const runAutoCollectScan = async (reason: string): Promise<DailyCreditRunResult> => {
    const platformDate = getPlatformDateKey();
    if (lastAutoCollectDate === platformDate) return { status: "already-ran", platformDate };
    lastAutoCollectDate = platformDate;
    try {
      console.log(`[Auto-Collect ${reason}] Scanning ledger for platform day ${platformDate}...`);
      
      const usersList = await adminGetAllUsers();
      let totalProcessed = 0;
      let cursor = 0;
      const workerCount = Math.max(1, Math.min(Number(process.env.AUTO_COLLECT_CONCURRENCY || 8), 32));
      const workers = Array.from({ length: workerCount }, async () => {
        while (cursor < usersList.length) {
          const u = usersList[cursor++];
          if (!u?.phone) continue;
          try {
            await autoCollectUserYields(u.phone);
            totalProcessed++;
          } catch (err) {
            console.error(`[Auto-Collect ${reason}] Failed for user ${u.phone}:`, err);
          }
        }
      });
      await Promise.all(workers);
      
      console.log(`[Auto-Collect ${reason}] Finished scan successfully. Processed ${totalProcessed} users.`);
      return { status: "completed", platformDate, processed: totalProcessed };
    } catch (err) {
      lastAutoCollectDate = null;
      console.error(`[Auto-Collect ${reason} Failure] error running scan:`, err);
      throw err;
    }
  };
  dailyCreditRunner = runAutoCollectScan;

  // Catch up after a process restart instead of waiting until the next
  // midnight. This is intentionally fire-and-forget so the HTTP server can
  // become ready while the background scan is running.
  void runAutoCollectScan("Startup").catch(() => undefined);

  cron.schedule("0 0 * * *", () => {
    void runAutoCollectScan("Cron").catch(() => undefined);
  }, {
    timezone: "Africa/Nairobi"
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, server.cjs is located inside dist/
    // so __dirname is the dist/ folder. Under tsx/ESM there is no __dirname —
    // fall back to <cwd>/dist (repo root layout).
    const distPath = typeof __dirname !== "undefined" ? (__dirname as string) : path.join(process.cwd(), "dist");
    app.use(express.static(distPath, {
      index: false,
      setHeaders: (res, filePath) => {
        const name = path.basename(filePath);
        if (name === "index.html" || name === "sw.js" || name === "registerSW.js") {
          res.setHeader("Cache-Control", "no-cache");
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }));
    app.get("*", async (req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      if (req.path.startsWith("/admin")) {
        res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
      }
      try {
        const indexPath = path.join(distPath, "index.html");
        let html = await fs.promises.readFile(indexPath, "utf8");
        // Dynamic brand injection so the app shell title matches Site Config.
        // Failure falls back to the static file — never break the app for SEO.
        // Link-preview scrapers (WhatsApp/Telegram/X/Facebook) don't run JS,
        // so the brand, absolute share URL and absolute share image must be
        // baked into the served HTML here — client-side document.title updates
        // happen too late for them.
        // Public title, description, and configured share image are injected for link preview crawlers.
        try {
          const config = await getSiteConfig().catch(() => ({} as any));
          const brand = String((config as any)?.brandName || "").trim() || "RentDue Store";
          const description = String((config as any)?.seoDescription || "").trim() || SEO_DESCRIPTION;
          const base = getPublicBaseUrl(req);
          const escBrand = escapeSeoHtml(brand);
          const escDescription = escapeSeoHtml(description);
          const escBase = escapeSeoHtml(base);
          const title = escapeSeoHtml(seoTitle(brand));
          const shareImage = `${escBase}${SEO_SHARE_IMAGE}`;
          html = html
            .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
            .replace(/<meta name="description" content=".*?"/, `<meta name="description" content="${escDescription}"`)
            .replace(/<meta property="og:site_name" content=".*?"/, `<meta property="og:site_name" content="${escBrand}"`)
            .replace(/<meta property="og:title" content=".*?"/, `<meta property="og:title" content="${title}"`)
            .replace(/<meta property="og:description" content=".*?"/, `<meta property="og:description" content="${escDescription}"`)
            .replace(/<meta name="twitter:title" content=".*?"/, `<meta name="twitter:title" content="${title}"`)
            .replace(/<meta name="twitter:description" content=".*?"/, `<meta name="twitter:description" content="${escDescription}"`)
            .replace(/<meta property="og:url" content=".*?"/, `<meta property="og:url" content="${escBase}/"`)
            .replace(/<meta property="og:image" content=".*?"/, `<meta property="og:image" content="${shareImage}"`)
            .replace(/<meta name="twitter:image" content=".*?"/, `<meta name="twitter:image" content="${shareImage}"`);
          html = html.replace('<link rel="canonical" href="/" />', `<link rel="canonical" href="${escBase}/" />`);
          if (req.path.startsWith("/admin")) {
            html = html.replace('<meta name="robots" content="index, follow, max-image-preview:large" />', '<meta name="robots" content="noindex, nofollow, noarchive" />');
          }
        } catch {
          // ignore SEO injection errors — serve the shell as-is
        }
        res.type("html").send(html);
      } catch {
        res.sendFile(path.join(distPath, "index.html"));
      }
    });
  }

  
  const listenPort = isNaN(Number(PORT)) ? PORT : Number(PORT);
  if (typeof listenPort === "number") {
    app.listen(listenPort, "0.0.0.0", () => {
      console.log(`[Referral Mining Server] running on http://localhost:${listenPort}`);
      console.log(`[Startup] Ready in ${Date.now() - processStartedAt}ms; health=/healthz readiness=/readyz`);
    });
  } else {
    app.listen(listenPort, () => {
      console.log(`[Referral Mining Server] running on IISNode named pipe: ${listenPort}`);
      console.log(`[Startup] Ready in ${Date.now() - processStartedAt}ms; health=/healthz readiness=/readyz`);
    });
  }
}

startServer();
