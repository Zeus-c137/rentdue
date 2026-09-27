import { useCallback, useEffect, useRef, useState } from "react";
import { loadSeen } from "../utils/chat";
import { fetchJsonWithSignal } from "../utils/abortableFetch";
import { useGatedInterval } from "./useGatedInterval";

const SEEN_KEY = "chat_seen_v1";

export function useChatUnread(phone: string | undefined): number {
  const [count, setCount] = useState(0);
  const inFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!phone) { setCount(0); return; }
    if (inFlight.current || document.hidden) return;
    inFlight.current = true;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const { signal } = ctrl;
    try {
      const seen = loadSeen(SEEN_KEY);
      let total = 0;
      const rooms = ["shared", `direct_${phone}`];
      for (const room of rooms) {
        try {
          const list = await fetchJsonWithSignal<unknown>(`/api/chat/room/${room}`, signal);
          if (!Array.isArray(list)) continue;
          const sinceIso = seen[room];
          if (!sinceIso) continue;
          const since = new Date(sinceIso).getTime();
          if (isNaN(since)) continue;
          for (const m of list as Array<{ sender: string; timestamp: string }>) {
            if (m.sender === phone) continue;
            const t = new Date(m.timestamp).getTime();
            if (!isNaN(t) && t > since) total++;
          }
        } catch (e: unknown) {
          if ((e as Error)?.name === "AbortError") break;
        }
      }
      if (!signal.aborted) setCount(total);
    } catch {
      /* badge is best-effort */
    } finally {
      inFlight.current = false;
    }
  }, [phone]);

  useGatedInterval(() => { void refresh(); }, 30000, { enabled: !!phone, visibilityGate: true, runOnVisible: true });

  useEffect(() => {
    void refresh();
    const onVis = () => { if (!document.hidden) void refresh(); else if (abortRef.current) abortRef.current.abort(); };
    window.addEventListener("chat-seen", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (abortRef.current) abortRef.current.abort();
      window.removeEventListener("chat-seen", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  return count;
}
