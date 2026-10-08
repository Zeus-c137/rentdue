import React, { useState, useEffect, useCallback } from "react";
import { useGatedInterval } from "../hooks/useGatedInterval";
import { NotificationItem, UserProfile } from "../types";
import { X, ExternalLink, CirclePlus, Wallet, BadgeCheck, CalendarCheck, Trophy, Zap, Link2, Gift, Shield, Megaphone, Bell, TrendingUp, ShoppingBag, type LucideIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { useCurrency } from "../currency";
import { fixGitHubImageUrl } from "@/src/utils/imageUtils";

const firstRenderableImage = (...candidates: unknown[]) => {
  for (const candidate of candidates) {
    const image = fixGitHubImageUrl(String(candidate || "").trim());
    if (/^(https?:\/\/|\/|data:|blob:)/i.test(image)) return image;
  }
  return "";
};

interface AlertsViewProps {
  profile: UserProfile;
  onBack: () => void;
  initialNotifications?: NotificationItem[];
  onNotificationsChange?: (notifications: NotificationItem[]) => void;
  siteConfig?: any;
}

export default function AlertsView({ profile, onBack, initialNotifications = [], onNotificationsChange, siteConfig }: AlertsViewProps) {
  const { formatCurrency } = useCurrency();
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);
  const [loading, setLoading] = useState(false);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<NotificationItem | null>(null);
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("read_notification_ids") || "[]");
    } catch {
      return [];
    }
  });

  const handleOpenAlert = (item: NotificationItem) => {
    setSelectedAlert(item);
    if (!readIds.includes(item.id)) {
      const updated = [...readIds, item.id];
      setReadIds(updated);
      try {
        localStorage.setItem("read_notification_ids", JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
    }
  };

  // The app keeps this list warm in the background, so opening the sheet can
  // render immediately while the network refresh runs in the background.
  useEffect(() => {
    setNotifications(initialNotifications);
  }, [initialNotifications]);

  useEffect(() => {
    let active = true;
    void fetch("/api/items").then(async (res) => {
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.items || [];
    }).then((items) => { if (active) setCatalog(items); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const controllerRef = React.useRef<AbortController | null>(null);
  const fetchAlerts = useCallback(async () => {
    if (controllerRef.current) controllerRef.current.abort();
    const ctrl = new AbortController();
    controllerRef.current = ctrl;
    try {
      setLoading(true);
      const res = await fetch(`/api/profile/notifications/${profile.phone}`, { signal: ctrl.signal });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Unable to load alerts (${res.status}).`);
      }
      const data = await res.json() as NotificationItem[];
      if (ctrl.signal.aborted) return;
      setNotifications(data);
      onNotificationsChange?.(data);
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") console.error("Error fetching alerts history:", err);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [profile.phone, onNotificationsChange]);

  const refreshIfVisible = useCallback(() => {
    if (document.visibilityState === "visible") void fetchAlerts();
  }, [fetchAlerts]);

  useEffect(() => {
    void refreshIfVisible();
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      if (controllerRef.current) controllerRef.current.abort();
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [refreshIfVisible]);

  useGatedInterval(() => { void refreshIfVisible(); }, 120000, { enabled: true, visibilityGate: true });

  function renderMessageWithLinks(text: string) {
    if (!text) return "";
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            referrerPolicy="no-referrer"
            rel="noopener noreferrer"
            className="text-blue-450 hover:text-blue-300 font-bold hover:underline break-all inline-block select-text"
          >
            {part}
          </a>
        );
      }
      return part;
    });
  }

  const getAlertPresentation = (alert: NotificationItem) => {
    const metadata = alert.metadata || {};
    const category = String(alert.category || "").toLowerCase();
    const title = String(alert.title || "");
    const lowerTitle = title.toLowerCase();
    const message = String(alert.message || "");
    const lowerMessage = message.toLowerCase();
    const tierFromMessage = message.match(/(?:claimed\s+)?(.+?)\s+stage reward/i)?.[1]?.trim();
    const configuredTierEntry = Object.entries(siteConfig?.vipTierMeta || {}).find(([name]) => {
      const normalizedName = name.trim().toLowerCase();
      return normalizedName && (
        String(metadata.tierName || "").trim().toLowerCase() === normalizedName ||
        lowerTitle.includes(`${normalizedName} bonus`) ||
        lowerTitle.includes(`${normalizedName} task verified`) ||
        lowerMessage.includes(`${normalizedName} milestone bonus`)
      );
    });
    const tierName = String(metadata.tierName || tierFromMessage || configuredTierEntry?.[0] || "").trim();
    const amountFromMessage = message.match(/UGX\s*([\d,]+(?:\.\d+)?)/i)?.[1]?.replace(/,/g, "");
    const amount = Number(alert.amount || amountFromMessage || 0);
    const isReturns = metadata.eventType === "daily_yield" || metadata.eventType === "product_activation" || category === "daily accumulation" || lowerTitle.includes("daily returns");
    const isMilestone = metadata.eventType === "milestone_bonus" || lowerTitle.includes("milestone reward") || lowerTitle.includes("community task reward") || lowerTitle.includes("stage reward claimed") || Boolean(tierFromMessage) || (Boolean(configuredTierEntry) && (lowerTitle.includes("bonus") || lowerMessage.includes("milestone bonus")));
    const isMilestoneTaskVerified = metadata.eventType === "milestone_task_verified" || (Boolean(configuredTierEntry) && lowerTitle.includes("task verified"));
    const isTierNotice = isMilestone || isMilestoneTaskVerified;
    let productName = String(metadata.sourceItemName || "").trim();
    if (!productName && isReturns) {
      productName = message.match(/from\s+(.+?)\s+(?:was|were)\s+credited/i)?.[1]?.trim() || title.replace(/\s+returns credited$/i, "").trim();
    }
    const sourceItemId = String(metadata.sourceItemId || "").trim();
    const catalogProduct = catalog.find((item) => sourceItemId && String(item.id || "").trim() === sourceItemId)
      || (productName
        ? catalog.find((item) => String(item.name || "").trim().toLowerCase() === productName.toLowerCase())
        : null);

    let Icon: LucideIcon = Bell;
    let badgeClass = "bg-[var(--theme-primary)]/15 border border-[var(--theme-primary)]/30 text-[var(--theme-primary)]";
    let categoryLabel = alert.category;
    if (category === "deposit") {
      Icon = CirclePlus;
      badgeClass = "bg-[var(--theme-primary)] text-white border border-[var(--theme-primary)]";
    } else if (category === "withdraw") {
      Icon = Wallet;
      badgeClass = "bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)]";
    } else if (category === "register") {
      Icon = BadgeCheck;
    } else if (category.includes("checkin") || lowerTitle.includes("check-in")) {
      Icon = CalendarCheck;
    } else if (category.includes("referral") || lowerTitle.includes("referral")) {
      Icon = Link2;
      badgeClass = "bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)]";
    } else if (category === "system") {
      Icon = Shield;
    } else if (category === "announcement") {
      Icon = Megaphone;
    } else if (category === "rewards" || category === "daily accumulation") {
      Icon = Gift;
      badgeClass = "bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)]";
    }
    if (isTierNotice) {
      Icon = Trophy;
      categoryLabel = isMilestoneTaskVerified ? `${tierName} task` : tierName ? `${tierName} bonus` : "milestone bonus";
      badgeClass = "bg-[var(--theme-primary)]/15 border border-[var(--theme-primary)]/20 text-[var(--theme-primary)]";
    } else if (isReturns) {
      Icon = TrendingUp;
      categoryLabel = "returns";
    } else if (metadata.eventType === "product_activation") {
      Icon = ShoppingBag;
    } else if (lowerTitle.includes("new run activated")) {
      Icon = Zap;
    }

    const configuredTier = configuredTierEntry?.[1] as any;
    const image = isTierNotice
      ? firstRenderableImage(metadata.tierImageUrl, configuredTier?.imageUrl)
      : (isReturns || metadata.eventType === "product_activation")
        ? firstRenderableImage(metadata.sourceItemImage, catalogProduct?.imageUrl, catalogProduct?.image)
        : "";
    const displayTitle = isMilestone && tierName
      ? `${tierName} Bonus`
      : isMilestone
        ? "Milestone Bonus"
      : isReturns && productName
        ? `${productName} Returns Credited`
        : title;
    const displayMessage = isMilestone && tierName && amount > 0
      ? `${tierName} milestone bonus of ${formatCurrency(amount)} was credited to your withdrawable balance.`
      : isMilestone && !tierName && amount > 0
        ? `A milestone bonus of ${formatCurrency(amount)} was credited to your withdrawable balance.`
        : isReturns && productName && amount > 0
          ? `${formatCurrency(amount)} in returns from ${productName} was credited to your withdrawable balance.`
          : message;

    return { Icon, badgeClass, categoryLabel, image, displayTitle, displayMessage };
  };

  const alertNotifications = notifications.filter(
    (n) => n.category !== "news" || n.metadata?.alertUsers === true
  );

  const lastViewedTime = Number(localStorage.getItem("lastViewedAlertsTime") || 0);
  const unreadCount = alertNotifications.filter(
    (n) => new Date(n.timestamp).getTime() > lastViewedTime
  ).length;

  return (
    <div className="p-4 select-none relative min-h-[85vh] text-[var(--theme-text)] bg-transparent border-0 rounded-none">
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {selectedAlert && (() => {
          const presentation = getAlertPresentation(selectedAlert);
          const AlertIcon = presentation.Icon;

          return (
            <div key={selectedAlert.id} className="fixed inset-0 z-[80] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedAlert(null)}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm cursor-pointer"
              />
              <motion.div
                initial={{ scale: 0.94, opacity: 0, y: 15 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.94, opacity: 0, y: 15 }}
                transition={{ type: "spring", damping: 25, stiffness: 350 }}
                className="relative w-full max-w-md bg-[var(--theme-card-bg)]/90 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-[24px] shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
              >
                {/* Header mimicking the Alert Card */}
                <div className="flex justify-between items-center p-5 bg-transparent shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--theme-card-bg)]/70 flex items-center justify-center shrink-0 overflow-hidden">
                      {presentation.image
                        ? <img src={presentation.image} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        : <AlertIcon className="w-5 h-5 text-[var(--theme-primary)]" strokeWidth={1.8} aria-hidden="true" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] uppercase tracking-wider font-sans font-extrabold px-2 py-0.5 rounded-full ${presentation.badgeClass}`}>
                          {presentation.categoryLabel}
                        </span>
                        <span className="text-[12px] font-sans text-[var(--theme-text)] opacity-60 font-semibold">
                          {new Date(selectedAlert.timestamp).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </span>
                      </div>
                      <h4 className="font-extrabold text-sm text-[var(--theme-text)] mt-1 tracking-tight leading-snug">{presentation.displayTitle}</h4>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedAlert(null)}
                    className="p-1.5 rounded-full bg-transparent border-0 text-[var(--theme-text)] hover:opacity-70 cursor-pointer transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Body mimicking the Card layout */}
                <div className="p-6 overflow-y-auto space-y-5 bg-transparent">
                  <div className="text-[13.5px] text-[var(--theme-text)] opacity-90 leading-relaxed space-y-4 font-sans whitespace-pre-line select-text">
                    {renderMessageWithLinks(presentation.displayMessage)}
                  </div>

                  {selectedAlert.metadata?.link && (
                    <div className="pt-3">
                      <a
                        href={selectedAlert.metadata.link}
                        target="_blank"
                        referrerPolicy="no-referrer"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-5 py-3.5 btn-3d-primary text-white font-sans text-xs font-black uppercase tracking-wider transition-all cursor-pointer w-full justify-center shadow-lg active:scale-[0.98]"
                      >
                        <span>Open Link</span>
                        <ExternalLink className="w-4 h-4 text-white" />
                      </a>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          );
        })()}
          </AnimatePresence>,
          document.body
        )}
      <div>
        <div className="space-y-4">

          {loading ? (
            <div className="space-y-3 pb-24">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="bg-slate-900/25 border border-slate-900/60 p-4 rounded-2xl flex gap-3.5 animate-pulse text-left"
                >
                  <div className="w-9 h-9 rounded-xl bg-slate-800/60 flex items-center justify-center shrink-0 animate-pulse" />
                  
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="h-3 w-12 bg-slate-800 rounded animate-pulse" />
                      <div className="h-2.5 w-20 bg-slate-800/60 rounded animate-pulse" />
                    </div>
                    <div className="h-4 w-1/3 bg-slate-800 rounded animate-pulse" />
                    <div className="space-y-1.5">
                      <div className="h-2 w-full bg-slate-850 rounded animate-pulse" />
                      <div className="h-2 w-3/4 bg-slate-850 rounded animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : alertNotifications.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/10 border border-dashed border-slate-900 rounded-2xl flex flex-col items-center justify-center gap-4">
              <Bell className="w-9 h-9 text-[var(--theme-text)] opacity-45" aria-hidden="true" />
              <div className="space-y-1">
                <span className="text-[11px] font-bold font-mono text-slate-400 block uppercase">No Alert Records Registered</span>
                <p className="text-[12px] text-slate-500 max-w-[240px] mx-auto leading-normal font-mono">
                  Your rented products, commission payouts, and security updates are performing optimally with no alerts raised yet.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 pb-24">
              {alertNotifications.map((logs) => {
                const presentation = getAlertPresentation(logs);
                const AlertIcon = presentation.Icon;
                const isUnread = !readIds.includes(logs.id);

                return (
                  <div
                    key={logs.id}
                    onClick={() => handleOpenAlert(logs)}
                    className="bg-transparent border-0 p-4 rounded-[20px] flex gap-3.5 transition-all text-left cursor-pointer active:scale-[0.98]"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[var(--theme-card-bg)]/70 flex items-center justify-center shrink-0 overflow-hidden">
                      {presentation.image
                        ? <img src={presentation.image} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        : <AlertIcon className="w-5 h-5 text-[var(--theme-primary)]" strokeWidth={1.8} aria-hidden="true" />}
                    </div>
                    
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[9px] uppercase tracking-wider font-mono font-black px-2 py-0.5 rounded-full ${presentation.badgeClass}`}>
                          {presentation.categoryLabel}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {isUnread && (
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0 inline-block shadow-xs" title="Unread" />
                          )}
                          <span className="text-[12px] font-sans text-[var(--theme-text)] opacity-60 font-semibold">
                            {new Date(logs.timestamp).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </span>
                        </div>
                      </div>
                      <h4 className="font-extrabold text-[var(--theme-text)] text-xs tracking-tight leading-tight font-sans">
                        {presentation.displayTitle}
                      </h4>
                      <p className="text-[var(--theme-text)] opacity-80 text-[11.5px] font-sans leading-relaxed select-text break-normal whitespace-normal">
                        {renderMessageWithLinks(presentation.displayMessage)}
                      </p>
                      {logs.metadata?.link && (
                        <div className="pt-2">
                          <a
                             href={logs.metadata.link}
                             target="_blank"
                             referrerPolicy="no-referrer"
                             rel="noopener noreferrer"
                             className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg btn-3d-primary text-white font-mono text-[9.5px] font-black uppercase tracking-wider transition-all cursor-pointer"
                          >
                            <span>Open Link</span>
                            <ExternalLink className="w-3 h-3 text-white" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
