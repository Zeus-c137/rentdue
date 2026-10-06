import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// Official Telegram.Login popup library, shared by the login-screen button,
// the register pill, and the Bind Account flow. Loads telegram-login.js once;
// callers open the popup via authenticate().
//
// IMPORTANT — redirect_uri: the SDK hardcodes
//   redirect_uri = location.origin + location.pathname
// (e.g. "https://example.com/") and offers no override. Telegram
// exact-matches this against BotFather > Login Widget > Allowed URLs, so
// that list must contain the page URL *exactly* (trailing slash, scheme,
// www vs non-www all matter). A mismatch fails inside the Telegram popup
// with a redirect_uri error before our callback ever fires.
const TELEGRAM_LOGIN_LIBRARY = "https://oauth.telegram.org/js/telegram-login.js?6";

interface TelegramLoginLib {
  auth?: (options: { client_id: number }, callback: (data: unknown) => void) => void;
  init?: (options: { client_id: number }, callback: (data: unknown) => void) => void;
  open?: () => void;
}

declare global {
  interface Window {
    Telegram?: { Login?: TelegramLoginLib };
  }
}

export type TelegramLoadStatus = "loading" | "ready" | "failed";
export type TelegramAuthPayload = Record<string, unknown>;

export function useTelegramLogin(onAuth: (payload: TelegramAuthPayload) => void) {
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState<TelegramLoadStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const onAuthRef = useRef(onAuth);
  onAuthRef.current = onAuth;

  // Fetch the numeric Client ID (BotFather) and load the library once.
  // The attempt counter is the retry path: failed callers re-run this.
  useEffect(() => {
    let alive = true;
    setStatus("loading");
    const fail = () => { if (alive) setStatus("failed"); };

    fetch("/api/auth/telegram/widget-config")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("unavailable"))))
      .then((data) => {
        if (!alive) return;
        const id = String(data?.clientId ?? "");
        if (!/^\d+$/.test(id)) return fail();
        setClientId(id);
        if (window.Telegram?.Login) return setStatus("ready");
        document.querySelectorAll("script[data-rentdue-telegram-login]").forEach((el) => el.remove());
        const script = document.createElement("script");
        script.src = TELEGRAM_LOGIN_LIBRARY;
        script.async = true;
        script.dataset.rentdueTelegramLogin = "";
        script.onload = () => { if (alive) setStatus("ready"); };
        script.onerror = fail;
        document.head.appendChild(script);
      })
      .catch(fail);
    return () => { alive = false; };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Opens the Telegram popup. Returns false when the library isn't ready.
  // Popup-level failures (backend redirect_uri/config errors, malformed
  // responses) surface as a toast so a broken BotFather setup is visible in
  // the UI instead of dying silently in the console. A user-dismissed popup
  // ("popup_closed") stays silent by design.
  const authenticate = useCallback(() => {
    if (status !== "ready" || !clientId) return false;
    const login = window.Telegram?.Login;
    const options = { client_id: Number(clientId) };
    const handle = (data: unknown) => {
      const payload = data as { error?: string; id_token?: string } | null;
      if (!payload || payload.error) {
        const err = payload?.error || "dismissed";
        console.warn("Telegram sign-in:", err);
        if (payload?.error && payload.error !== "popup_closed") {
          toast.error("Telegram sign-in failed. Please try again.");
        }
        return;
      }
      if (!payload.id_token) {
        console.warn("Telegram sign-in: no id_token returned");
        toast.error("Telegram sign-in failed. Please try again.");
        return;
      }
      onAuthRef.current(payload as TelegramAuthPayload);
    };
    if (typeof login?.auth === "function") {
      login.auth(options, handle);
      return true;
    }
    if (typeof login?.init === "function" && typeof login?.open === "function") {
      login.init(options, handle);
      login.open();
      return true;
    }
    setStatus("failed");
    return false;
  }, [status, clientId]);

  return { status, authenticate, retry };
}
