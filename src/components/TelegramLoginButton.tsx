import { useTelegramLogin, type TelegramAuthPayload } from "../hooks/useTelegramLogin";

interface TelegramLoginButtonProps {
  onAuth: (payload: TelegramAuthPayload) => void;
  disabled?: boolean;
}

// Login-screen pill (compact, floats right next to the "Or use" label and
// the standalone info icon). Popup + library behavior lives in
// useTelegramLogin; this component only renders state.
export default function TelegramLoginButton({ onAuth, disabled = false }: TelegramLoginButtonProps) {
  const { status, authenticate, retry } = useTelegramLogin(onAuth);

  const handleClick = () => {
    if (status === "failed") {
      retry();
      return;
    }
    authenticate();
  };

  const label = status === "failed" ? "Retry with Telegram" : status === "loading" ? "Connecting…" : "Sign in with Telegram";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || status === "loading"}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] px-4 py-2.5 text-[var(--theme-text)] font-sans font-semibold text-[13px] transition-all active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
    >
      {status === "loading" ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
      ) : (
        <img src="/telegram.svg" alt="" aria-hidden="true" className="h-4 w-4 shrink-0 object-contain" />
      )}
      {label}
    </button>
  );
}
