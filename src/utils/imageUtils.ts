/**
 * Utility to convert user-supplied image URLs into valid direct image URLs.
 * Automatically converts GitHub web page blob links (e.g. github.com/user/repo/blob/main/bg.png)
 * into direct raw image stream URLs (raw.githubusercontent.com/user/repo/main/bg.png).
 */
export function fixGitHubImageUrl(url?: string): string {
  if (!url) return "";
  let clean = url.trim();
  if (clean.includes("github.com/") && clean.includes("/blob/")) {
    clean = clean.replace("github.com/", "raw.githubusercontent.com/").replace("/blob/", "/");
  } else if (clean.includes("github.com/") && clean.includes("/raw/")) {
    clean = clean.replace("github.com/", "raw.githubusercontent.com/").replace("/raw/", "/");
  }
  return clean;
}

/**
 * Request a lightweight Cloudinary variant (auto format + auto quality +
 * bounded width). Non-Cloudinary URLs pass through untouched, so existing
 * heavy milestone art already in the DB gets small fast variants without
 * re-upload — a 1.5MB PNG thumb becomes tens of KB. Already-transformed
 * URLs are returned as-is.
 */
export function optimizedImageUrl(url: string | undefined, width = 400): string {
  const clean = fixGitHubImageUrl(url);
  if (!clean || !clean.includes("res.cloudinary.com")) return clean;
  if (/\/upload\/(.*\/)?(f_auto|w_\d+|q_auto)/.test(clean)) return clean;
  return clean.replace("/upload/", `/upload/f_auto,q_auto,w_${Math.max(1, Math.floor(width))}/`);
}
