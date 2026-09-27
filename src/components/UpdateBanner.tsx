import { useEffect, useState, useRef, useCallback } from "react";
import { useGatedInterval } from "../hooks/useGatedInterval";
import { registerSW } from "virtual:pwa-register";
import { motion, AnimatePresence } from "motion/react";
import { RefreshCw, CheckCircle2 } from "lucide-react";

const UPDATE_CHECK_MS = 30 * 60 * 1000;
// Staged download pacing. The new bundle is in fact already precached by the
// waiting service worker before onNeedRefresh fires — byte progress is not
// observable via the PWA API, so the bar eases toward 92% while we hold the
// activation handshake, then completes on the controlling event.
const DOWNLOAD_TARGET = 92;
const DOWNLOAD_MS = 3200;
const COMPLETE_HOLD_MS = 1100;
const ACTIVATION_TIMEOUT_MS = 10000;

type Phase = "idle" | "downloading" | "complete";

export default function UpdateBanner() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [applyUpdate, setApplyUpdate] = useState<(() => Promise<void>) | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);

  const regRef = useRef<ServiceWorkerRegistration | null>(null);
  const progressRef = useRef(0);
  const rafRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const finishedRef = useRef(false);

  const setProgressBoth = (v: number) => {
    progressRef.current = v;
    setProgress(v);
  };

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  };

  const clearTimers = () => {
    cancelAnimationFrame(rafRef.current);
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  // Terminal step, shared by the controlling handshake and the safety net:
  // hold the complete state so success registers (causality + harmony),
  // then hand control to the new worker with a reload.
  const completeAndReload = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearTimers();
    setProgressBoth(100);
    setPhase("complete");
    later(() => {
      window.location.reload();
    }, COMPLETE_HOLD_MS);
  }, []);

  const paceToTarget = useCallback(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // No vestibular motion: jump straight to the held value, text cross-fades.
      setProgressBoth(DOWNLOAD_TARGET);
      return;
    }
    const from = progressRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DOWNLOAD_MS);
      // Ease-out cubic: fast honest start, gentle settle — never rewinds.
      const eased = 1 - Math.pow(1 - t, 3);
      setProgressBoth(Math.round(from + (DOWNLOAD_TARGET - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startUpdate = useCallback(() => {
    if (phase !== "idle") return;
    finishedRef.current = false;
    setPhase("downloading");
    paceToTarget();
    // Activation handshake: the waiting worker takes control, which fires
    // onNeedReload below. Safety net reloads even if it never fires.
    later(() => {
      void applyUpdate?.().catch(() => {});
    }, 400);
    later(() => {
      completeAndReload();
    }, ACTIVATION_TIMEOUT_MS);
  }, [phase, paceToTarget, applyUpdate, completeAndReload]);

  const doUpdateCheck = () => {
    if (document.hidden) return;
    regRef.current?.update().catch(() => {});
  };
  useGatedInterval(() => { doUpdateCheck(); }, UPDATE_CHECK_MS, { enabled: true, visibilityGate: true });

  useEffect(() => {
    if ((import.meta as any).env?.DEV) return;
    if (!("serviceWorker" in navigator)) return;
    const onVis = () => {
      if (!document.hidden) navigator.serviceWorker.getRegistration().then((r) => r?.update().catch(() => {})).catch(() => {});
    };
    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      // Fires when the waiting worker takes control after our skip-waiting
      // handshake. Providing it suppresses the plugin's instant auto-reload
      // so the complete state is actually seen before we reload ourselves.
      onNeedReload() {
        completeAndReload();
      },
      onRegisteredSW(_url, registration) {
        if (!registration) return;
        regRef.current = registration;
        document.addEventListener("visibilitychange", onVis);
        window.addEventListener("focus", onVis);
      },
    });
    setApplyUpdate(() => update);
    return () => {
      clearTimers();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = Math.round(progress);
  const reducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div
          initial={{ y: "-110%" }}
          animate={{ y: 0 }}
          exit={{ y: "-110%" }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          className="fixed top-0 inset-x-0 z-[70] px-3 pt-3 pointer-events-none"
        >
          <div className="pointer-events-auto mx-auto max-w-md rounded-2xl bg-[var(--theme-primary)] text-white shadow-lg border border-white/20 px-4 pt-2.5 pb-3 space-y-2">
            <div className="flex items-center gap-3">
              {phase === "complete" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <RefreshCw className={`w-4 h-4 shrink-0 ${phase === "downloading" && !reducedMotion ? "animate-spin" : ""}`} />
              )}
              <span className="flex-1 text-xs font-bold leading-snug">
                {phase === "idle" && "A new version of the app is ready."}
                {phase === "downloading" && `Downloading update… ${pct}%`}
                {phase === "complete" && "Update complete — restarting…"}
              </span>
              {phase === "idle" ? (
                <button
                  type="button"
                  onClick={startUpdate}
                  className="shrink-0 px-4 py-2 rounded-xl bg-white text-[var(--theme-primary)] text-xs font-black uppercase tracking-wide cursor-pointer active:scale-95 transition-transform"
                >
                  Update
                </button>
              ) : (
                <span className="shrink-0 text-xs font-black tabular-nums">{phase === "complete" ? "100%" : `${pct}%`}</span>
              )}
            </div>
            {phase !== "idle" && (
              <div
                role="progressbar"
                aria-valuMin={0}
                aria-valuMax={100}
                aria-valuenow={pct}
                aria-label="App update download progress"
                className="h-1.5 w-full rounded-full bg-white/25 overflow-hidden"
              >
                <div
                  className="h-full w-full rounded-full bg-white origin-left"
                  style={{ transform: `scaleX(${Math.min(1, progress / 100)})`, willChange: phase === "downloading" ? "transform" : undefined }}
                />
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
