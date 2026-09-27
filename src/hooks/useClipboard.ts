// TODO: flagged untested — add minimal src/utils/referral.test.ts and src/hooks/useClipboard.test.ts once vitest configured
import { CLIPBOARD_TIMEOUT_MS } from "@/src/utils/motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

function clearTimer(ref: { current: number | null }) {
  if (ref.current !== null) {
    window.clearTimeout(ref.current);
    ref.current = null;
  }
}

export function useClipboard(timeoutMs = CLIPBOARD_TIMEOUT_MS) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);
  const reset = useCallback(() => {
    setCopied(false);
    clearTimer(timerRef);
  }, []);
  const copy = useCallback(
    async (text: string) => {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success("Copied to clipboard");
        clearTimer(timerRef);
        timerRef.current = window.setTimeout(() => setCopied(false), timeoutMs);
      } catch {
        toast.error("Copy failed");
      }
    },
    [timeoutMs]
  );
  useEffect(() => () => { clearTimer(timerRef); }, []);
  return { copied, copy, reset };
}
