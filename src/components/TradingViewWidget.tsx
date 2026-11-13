/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";

/**
 * TradingView widget bridge.
 *
 * The widgets ship as ES modules that register custom elements
 * (`<tv-ticker-tape>`, `<tv-news-feed>`, `<tv-technical-analysis>`) and then
 * render their own DOM *inside* the host element. Letting React own that
 * subtree would mean React wiping the widget on every re-render, so the host
 * is created imperatively and appended to an empty container React only ever
 * sees as a leaf.
 */

const WIDGET_BASE = "https://widgets.tradingview-widget.com/w/en/";

export type TradingViewKind = "ticker-tape" | "news-feed" | "technical-analysis";

const SCRIPT_FILE: Record<TradingViewKind, string> = {
  "ticker-tape": "tv-ticker-tape.js",
  "news-feed": "tv-news-feed.js",
  "technical-analysis": "tv-technical-analysis.js",
};

// One <script> per widget kind for the lifetime of the page. Module scripts
// re-evaluate when appended twice, so the promise is cached rather than the tag.
const scriptPromises = new Map<TradingViewKind, Promise<void>>();

function loadWidgetScript(kind: TradingViewKind): Promise<void> {
  const cached = scriptPromises.get(kind);
  if (cached) return cached;

  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-tv-widget="${kind}"]`
    );
    if (existing) {
      // Already on the page — the custom element may or may not be defined yet.
      if (customElements.get(`tv-${kind}`)) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("widget load failed")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.type = "module";
    script.src = `${WIDGET_BASE}${SCRIPT_FILE[kind]}`;
    script.async = true;
    script.dataset.tvWidget = kind;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("widget load failed")), {
      once: true,
    });
    document.head.appendChild(script);
  });

  scriptPromises.set(kind, promise);
  return promise;
}

export interface TradingViewWidgetProps {
  kind: TradingViewKind;
  /** Attributes forwarded verbatim to the custom element. */
  attrs?: Record<string, string | number | boolean | undefined>;
  className?: string;
  /** Inline height for widgets that need a fixed viewport (news feed, analysis). */
  height?: number;
  /** Narrower viewport height (below 640px). TradingView's own min-widths make
   *  a fixed desktop height feel cramped on a phone. */
  heightMobile?: number;
  /** Fallback shown while loading, or if the CDN is unreachable. */
  fallback?: React.ReactNode;
  /** Skip loading entirely and render the fallback (used for reduced motion). */
  disabled?: boolean;
}

/** Tracks a CSS media query. SSR/first paint resolves to false, then corrects. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Tracks the `dark` class the theme context puts on <html>. */
function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const root = document.documentElement;
    setIsDark(root.classList.contains("dark"));
    const observer = new MutationObserver(() => setIsDark(root.classList.contains("dark")));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

export function TradingViewWidget({
  kind,
  attrs = {},
  className,
  height,
  heightMobile,
  fallback = null,
  disabled = false,
}: TradingViewWidgetProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const isDark = useIsDark();
  const isNarrow = useMediaQuery("(max-width: 639px)");

  // The widget reads its height once, at construction, so a breakpoint change
  // has to rebuild the host — same as an attribute change.
  const effectiveHeight = isNarrow && heightMobile ? heightMobile : height;

  // Attribute set is part of the effect deps: a symbol change must rebuild the
  // host, because the widget reads its config at construction time. All three
  // widgets take `colorTheme`; an explicit value on the call site wins.
  const attrKey = JSON.stringify({
    ...attrs,
    ...(effectiveHeight ? { height: effectiveHeight } : {}),
    colorTheme: attrs.colorTheme ?? (isDark ? "dark" : "light"),
  });

  useEffect(() => {
    if (disabled) return;
    const container = hostRef.current;
    if (!container) return;

    let cancelled = false;
    let host: HTMLElement | null = null;
    setStatus("loading");

    loadWidgetScript(kind)
      .then(() => {
        if (cancelled || !hostRef.current) return;

        const parsed = JSON.parse(attrKey) as Record<string, string | number | boolean | undefined>;
        host = document.createElement(`tv-${kind}`);
        for (const [key, value] of Object.entries(parsed)) {
          if (value === undefined || value === null || value === false) continue;
          host.setAttribute(key, String(value));
        }
        // TradingView injects an iframe sized from these.
        host.style.display = "block";
        host.style.width = "100%";
        host.style.maxWidth = "100%";
        if (effectiveHeight) host.style.height = `${effectiveHeight}px`;

        container.replaceChildren(host);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
      // Removing the host is enough; the widget's iframe goes with it.
      if (host && host.parentNode) host.parentNode.removeChild(host);
      if (container) container.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, attrKey, height, heightMobile, disabled]);

  return (
    <div className={`${className ?? ""} tv-widget-host`}>
      <div ref={hostRef} style={effectiveHeight ? { minHeight: effectiveHeight } : undefined} />
      {!disabled && status !== "ready" ? (
        <div
          className={status === "failed" ? "" : "animate-pulse"}
          style={effectiveHeight ? { height: effectiveHeight } : undefined}
        >
          {fallback}
        </div>
      ) : null}
    </div>
  );
}