import { useEffect, useRef, useCallback } from "react";

type GatedOptions = {
  enabled: boolean;
  runOnVisible?: boolean;
  visibilityGate?: boolean;
};

export function useGatedInterval(
  callback: () => void | Promise<void>,
  delayMs: number,
  options: GatedOptions
): void {
  const cbRef = useRef(callback);
  useEffect(() => { cbRef.current = callback; }, [callback]);

  useEffect(() => {
    if (!options.enabled) return;
    const tick = () => {
      if (options.visibilityGate && document.hidden) return;
      void cbRef.current();
    };
    const id = window.setInterval(tick, delayMs);
    const onVisible = () => {
      if (options.runOnVisible && !document.hidden) void cbRef.current();
    };
    if (options.runOnVisible) document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      if (options.runOnVisible) document.removeEventListener("visibilitychange", onVisible);
    };
  }, [delayMs, options.enabled, options.visibilityGate, options.runOnVisible]);
}

export function useGatedTimeout(
  callback: () => void,
  delayMs: number,
  deps: readonly unknown[]
): void {
  const cbRef = useRef(callback);
  useEffect(() => { cbRef.current = callback; }, [callback]);
  useEffect(() => {
    if (document.hidden) return;
    const id = window.setTimeout(() => cbRef.current(), delayMs);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delayMs, ...deps]);
}

export function useAbortSignal() {
  const ref = useRef<AbortController | null>(null);

  const renew = useCallback(() => {
    if (ref.current) ref.current.abort();
    const ctrl = new AbortController();
    ref.current = ctrl;
    return ctrl.signal;
  }, []);

  const abort = useCallback(() => {
    if (ref.current) ref.current.abort();
  }, []);

  const getSignal = useCallback(() => {
    if (!ref.current || ref.current.signal.aborted) return renew();
    return ref.current.signal;
  }, [renew]);

  useEffect(() => () => { if (ref.current) ref.current.abort(); }, []);

  const signal = getSignal();
  return { signal, renew, abort, getSignal };
}

export function createAbortSignal(): { signal: AbortSignal; abort: () => void } {
  const ctrl = new AbortController();
  return { signal: ctrl.signal, abort: () => ctrl.abort() };
}
