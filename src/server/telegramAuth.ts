import { createPublicKey, verify as verifySignature } from "crypto";

export interface TelegramVerifiedIdentity { id: string }

// OIDC validation for Telegram.Login id_tokens (https://core.telegram.org/widgets/login).
// Signature is checked against Telegram's published JWKS — no client secret required.
const TELEGRAM_JWKS_URL = "https://oauth.telegram.org/.well-known/jwks.json";
const TELEGRAM_ISSUER = "https://oauth.telegram.org";
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

interface JwkEntry { kid?: string; [key: string]: unknown }

let jwksCache: { keys: JwkEntry[]; fetchedAt: number } | null = null;

async function getSigningKeys(): Promise<JwkEntry[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) return jwksCache.keys;
  const response = await fetch(TELEGRAM_JWKS_URL);
  if (!response.ok) throw new Error("Telegram sign-in is unavailable.");
  const data = await response.json() as { keys?: JwkEntry[] };
  if (!Array.isArray(data.keys) || data.keys.length === 0) throw new Error("Telegram sign-in is unavailable.");
  jwksCache = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

function decodeJwtPart(part: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid Telegram response.");
  return parsed as Record<string, unknown>;
}

export async function verifyTelegramIdToken(idToken: unknown, clientId: string, nowMs = Date.now()): Promise<TelegramVerifiedIdentity> {
  if (!clientId) throw new Error("Telegram sign-in is unavailable.");
  if (typeof idToken !== "string" || idToken.length > 8192) throw new Error("Invalid Telegram response.");
  const segments = idToken.split(".");
  if (segments.length !== 3 || !segments[0] || !segments[1] || !segments[2]) throw new Error("Invalid Telegram response.");
  const [headerPart, payloadPart, signaturePart] = segments;

  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = decodeJwtPart(headerPart);
    claims = decodeJwtPart(payloadPart);
  } catch {
    throw new Error("Invalid Telegram response.");
  }

  const algorithm = header.alg;
  const keyId = typeof header.kid === "string" ? header.kid : "";
  if (algorithm !== "RS256" || !keyId) throw new Error("Telegram sign-in could not be verified.");

  // Find the signing key; one fresh fetch covers key rotation.
  let keys = await getSigningKeys();
  let jwk = keys.find((key) => key.kid === keyId);
  if (!jwk) {
    jwksCache = null;
    keys = await getSigningKeys();
    jwk = keys.find((key) => key.kid === keyId);
  }
  if (!jwk) throw new Error("Telegram sign-in could not be verified.");

  let publicKey;
  try {
    publicKey = createPublicKey({ key: jwk as never, format: "jwk" });
  } catch {
    throw new Error("Telegram sign-in could not be verified.");
  }

  let signatureValid = false;
  try {
    signatureValid = verifySignature(
      "RSA-SHA256",
      Buffer.from(`${headerPart}.${payloadPart}`),
      publicKey,
      Buffer.from(signaturePart, "base64url")
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) throw new Error("Telegram sign-in could not be verified.");

  if (claims.iss !== TELEGRAM_ISSUER) throw new Error("Telegram sign-in could not be verified.");
  const audiences = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud ?? "")];
  if (!audiences.includes(String(clientId))) throw new Error("Telegram sign-in could not be verified.");
  const expiresAt = Number(claims.exp);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < nowMs) throw new Error("Telegram sign-in expired. Please try again.");

  const telegramId = String(claims.sub ?? claims.id ?? "");
  if (!/^\d+$/.test(telegramId) || BigInt(telegramId) <= 0n) throw new Error("Invalid Telegram account.");
  return { id: telegramId };
}
