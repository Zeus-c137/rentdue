import { useEffect, useRef, useState } from "react";

interface TelegramLoginButtonProps {
  onAuth: (payload: Record<string, unknown>) => void;
  disabled?: boolean;
}

// Official Telegram.Login popup library. The button below is our own DOM
// (GhostButton look) — the library exposes auth()/init() we call on click.
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

type LoadStatus = "loading" | "ready" | "failed";

export default function TelegramLoginButton({ onAuth, disabled = false }: TelegramLoginButtonProps) {
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const onAuthRef = useRef(onAuth);
  onAuthRef.current = onAuth;

  // Fetch the numeric Client ID (BotFather) and load the library once.
  // The attempt counter is the retry path: the failed button re-runs this.
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

  const handleClick = () => {
    if (status === "failed") {
      setAttempt((n) => n + 1);
      return;
    }
    if (status !== "ready" || !clientId) return;
    const login = window.Telegram?.Login;
    const options = { client_id: Number(clientId) };
    const handle = (data: unknown) => {
      const payload = data as { error?: string; id_token?: string } | null;
      if (!payload || payload.error) {
        console.warn("Telegram sign-in:", payload?.error || "dismissed");
        return;
      }
      if (!payload.id_token) {
        console.warn("Telegram sign-in: no id_token returned");
        return;
      }
      onAuthRef.current(payload as Record<string, unknown>);
    };
    if (typeof login?.auth === "function") {
      login.auth(options, handle);
      return;
    }
    if (typeof login?.init === "function" && typeof login?.open === "function") {
      login.init(options, handle);
      login.open();
      return;
    }
    setStatus("failed");
  };

  const label = status === "failed" ? "Retry with Telegram" : status === "loading" ? "Connecting…" : "Sign in with Telegram";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || status === "loading"}
      className="w-full py-4 px-6 rounded-2xl border border-[var(--theme-card-border)] text-[var(--theme-text)] font-sans font-semibold text-[15px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] bg-transparent disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <img src="/telegram.svg" alt="" aria-hidden="true" className="h-5 w-5 shrink-0 object-contain" />
      {label}
    </button>
  );
}
