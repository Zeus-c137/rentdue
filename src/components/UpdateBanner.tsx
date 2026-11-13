import { useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { motion, AnimatePresence } from "motion/react";
import { RefreshCw } from "lucide-react";

// Updates are fully automatic. `registerType: "autoUpdate"` (vite.config.ts)
// makes the generated worker call skipWaiting + clientsClaim itself, so a new
// worker activates the moment it finishes installing and workbox-window reports
// it through onNeedReload. There is nothing for the user to tap.
//
// Checks are bounded, never polled. There is deliberately no setInterval here:
// the registration's own initial check, then at most one pass per
// CHECK_THROTTLE_MS and only while the tab is actually foreground.
const INITIAL_CHECK_DELAY_MS = 45_000;
const CHECK_THROTTLE_MS = 30 * 60 * 1000;
// How long the pill stays up before reloading. Long enough to read, short enough
// that the restart feels like part of the same interaction.
const RELOAD_HOLD_MS = 900;
// A reload that would land inside this window of the previous automatic reload is
// skipped instead: that pattern means the server is serving a new worker on every
// check, and honouring it would bounce the user between builds forever.
const RELOAD_COOLDOWN_MS = 20_000;
const RELOAD_KEY = "rentdue_sw_reloaded_at";

function readLastReload(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
  } catch {
    return 0;
  }
}

function markReloaded(): void {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* private mode / storage disabled: the cooldown simply does not apply */
  }
}

export default function UpdateBanner() {
  const [reloading, setReloading] = useState(false);
  const regRef = useRef<ServiceWorkerRegistration | null>(null);
  const lastCheckRef = useRef(0);
  const reloadTimerRef = useRef(0);
  const checkTimerRef = useRef(0);
  const reloadingRef = useRef(false);
  const pendingReloadRef = useRef(false);

  useEffect(() => {
    if ((import.meta as any).env?.DEV) return;
    if (!("serviceWorker" in navigator)) return;

    const checkForUpdate = () => {
      if (document.hidden) return;
      const registration = regRef.current;
      if (!registration) return;
      const now = Date.now();
      if (now - lastCheckRef.current < CHECK_THROTTLE_MS) return;
      lastCheckRef.current = now;
      registration.update().catch(() => {});
    };

    // The new worker took control. Reload onto its assets, unless a reload just
    // happened or the tab is in the background — a hidden tab reloads the next
    // time the user comes back to it, so nobody loses their place mid-tap.
    const reload = () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      if (document.hidden) {
        pendingReloadRef.current = true;
        return;
      }
      // Loop guard: at most one automatic reload per cooldown window, however
      // often the server claims to have a new worker. Wait out the remainder
      // instead of dropping the update, so the user still lands on new assets.
      const since = Date.now() - readLastReload();
      if (since < RELOAD_COOLDOWN_MS) {
        reloadingRef.current = false;
        reloadTimerRef.current = window.setTimeout(() => {
          reloadingRef.current = false;
          reload();
        }, RELOAD_COOLDOWN_MS - since + 250);
        return;
      }
      markReloaded();
      setReloading(true);
      reloadTimerRef.current = window.setTimeout(() => {
        window.location.reload();
      }, RELOAD_HOLD_MS);
    };

    // Returning to a backgrounded tab is the only other moment worth checking:
    // the user came back, so a fresh build is about to be used anyway.
    const onForeground = () => {
      if (document.hidden) return;
      if (pendingReloadRef.current) {
        pendingReloadRef.current = false;
        reloadingRef.current = false;
        reload();
        return;
      }
      checkForUpdate();
    };

    registerSW({
      immediate: true,
      onNeedReload: reload,
      onRegisteredSW(_url, registration) {
        if (!registration) return;
        regRef.current = registration;
        // The register call above already performed one update check, so the
        // next pass is a full throttle window away. This one catches a build
        // that landed while this page was still loading.
        checkTimerRef.current = window.setTimeout(checkForUpdate, INITIAL_CHECK_DELAY_MS);
        document.addEventListener("visibilitychange", onForeground);
        window.addEventListener("online", onForeground);
      },
      onRegisterError(error) {
        console.warn("[PWA] Service worker registration failed:", error);
      },
    });

    return () => {
      window.clearTimeout(reloadTimerRef.current);
      window.clearTimeout(checkTimerRef.current);
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("online", onForeground);
    };
  }, []);

  const reducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <AnimatePresence>
      {reloading && (
        <motion.div
          initial={{ y: "-110%" }}
          animate={{ y: 0 }}
          exit={{ y: "-110%" }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          className="fixed top-0 inset-x-0 z-[70] px-3 pt-3 pointer-events-none"
        >
          <div className="pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-[var(--theme-card-bg)]/60 backdrop-blur-[20px] backdrop-saturate-[180%] text-[var(--theme-text)] shadow-lg border border-[var(--theme-card-border)] px-4 py-3">
            <span className="shrink-0 w-7 h-7 rounded-full bg-[var(--theme-primary)]/10 border border-[var(--theme-primary)]/20 text-[var(--theme-primary)] flex items-center justify-center">
              <RefreshCw className={`w-4 h-4 ${reducedMotion ? "" : "animate-spin"}`} />
            </span>
            <span className="flex-1 text-xs font-bold leading-snug text-[var(--theme-text)]">
              Updating to the latest version...
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}