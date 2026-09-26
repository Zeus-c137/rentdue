import React, { useState, useEffect, useCallback } from "react";
import { useGatedInterval } from "../hooks/useGatedInterval";
import { NotificationItem, UserProfile } from "../types";
import { X, ExternalLink } from "lucide-react";
import { createPortal } from "react-dom";
import bell3d from "@/src/assets/3d/3dicons-bell-iso-premium.png";
import dollar3d from "@/src/assets/3d/3dicons-dollar-iso-premium.png";
import plus3d from "@/src/assets/3d/3dplus.png";
import wallet3d from "@/src/assets/3d/3dicons-wallet-iso-premium.png";
import giftBox3d from "@/src/assets/3d/3dicons-gift-box-iso-premium.png";
import shield3d from "@/src/assets/3d/3dicons-shield-iso-premium.png";
import megaphone3d from "@/src/assets/3d/3dicons-megaphone-iso-premium.png";
import money3d from "@/src/assets/3d/3dicons-money-iso-premium.png";
import calendar3d from "@/src/assets/3d/3dicons-calendar-iso-premium.png";
import trophy3d from "@/src/assets/3d/3dicons-trophy-iso-premium.png";
import link3d from "@/src/assets/3d/3dicons-link-iso-premium.png";
import flash3d from "@/src/assets/3d/3dicons-flash-iso-premium.png";
import medal3d from "@/src/assets/3d/3dicons-medal-iso-premium.png";
import { motion, AnimatePresence } from "motion/react";

interface AlertsViewProps {
  profile: UserProfile;
  onBack: () => void;
  initialNotifications?: NotificationItem[];
  onNotificationsChange?: (notifications: NotificationItem[]) => void;
}

export default function AlertsView({ profile, onBack, initialNotifications = [], onNotificationsChange }: AlertsViewProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);
  const [loading, setLoading] = useState(false);
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
          let categoryIcon3d: string = bell3d;
          let modalBadgeClass = "bg-[var(--theme-primary)]/15 border border-[var(--theme-primary)]/30 text-[var(--theme-primary)]";
          const cat = selectedAlert.category.toLowerCase();
          const title = selectedAlert.title.toLowerCase();
          if (cat === "deposit") { categoryIcon3d = plus3d; modalBadgeClass = "bg-[var(--theme-primary)] text-white border border-[var(--theme-primary)]"; }
          else if (cat === "withdraw") { categoryIcon3d = money3d; modalBadgeClass = "bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)]"; }
          else if (cat === "register") { categoryIcon3d = medal3d; modalBadgeClass = "bg-[var(--theme-primary)]/15 border border-[var(--theme-primary)]/20 text-[var(--theme-primary)]"; }
          else if (cat === "checkin" || cat.includes("checkin") || title.includes("check-in")) { categoryIcon3d = calendar3d; modalBadgeClass = "bg-[var(--theme-primary)]/15 border border-[var(--theme-primary)]/20 text-[var(--theme-primary)]"; }
          else if (cat.includes("vip") || cat.includes("milestone") || title.includes("vip") || title.includes("milestone")) { categoryIcon3d = trophy3d; modalBadgeClass = "bg-[var(--theme-primary)]/15 border border-[var(--theme-primary)]/20 text-[var(--theme-primary)]"; }
          else if (title.includes("product activated")) { categoryIcon3d = flash3d; modalBadgeClass = "bg-[var(--theme-primary)]/10 border border-[var(--theme-primary)]/20 text-[var(--theme-primary)]"; }
          else if (cat.includes("referral") || title.includes("referral")) { categoryIcon3d = link3d; modalBadgeClass = "bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)]"; }
          else if (cat === "rewards" || cat === "daily accumulation" || title.includes("daily income")) { categoryIcon3d = giftBox3d; modalBadgeClass = "bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)]"; }
          else if (cat === "system") { categoryIcon3d = shield3d; modalBadgeClass = "bg-[var(--theme-primary)]/15 border border-[var(--theme-primary)]/30 text-[var(--theme-primary)]"; }
          else if (cat === "announcement") { categoryIcon3d = megaphone3d; modalBadgeClass = "bg-[var(--theme-primary)]/15 border border-[var(--theme-primary)]/30 text-[var(--theme-primary)]"; }

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
                    <div className="w-10 h-10 bg-transparent border-0 flex items-center justify-center shrink-0">
                      <img src={categoryIcon3d} alt="" loading="lazy" decoding="async" className={`w-10 h-10 object-contain ${categoryIcon3d === flash3d ? "opacity-90 scale-[0.9]" : ""}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] uppercase tracking-wider font-sans font-extrabold px-2 py-0.5 rounded-full ${modalBadgeClass}`}>
                          {(selectedAlert.category === "daily accumulation" || selectedAlert.category === "rewards") ? "rewards" : selectedAlert.category}
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
                      <h4 className="font-extrabold text-sm text-[var(--theme-text)] mt-1 tracking-tight leading-snug">{selectedAlert.title}</h4>
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
                    {renderMessageWithLinks(selectedAlert.message)}
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
              <img src={bell3d} alt="" loading="lazy" decoding="async" className="w-12 h-12 object-contain opacity-60" />
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
                let categoryIcon3dList: string = bell3d;
                let badgeClass = "bg-[var(--theme-primary)]/15 border border-[var(--theme-primary)]/30 text-[var(--theme-primary)]";

                const lcat = logs.category.toLowerCase();
                const ltitle = logs.title.toLowerCase();
                if (lcat === "deposit") {
                  categoryIcon3dList = plus3d;
                  badgeClass = "bg-[var(--theme-primary)] text-white border border-[var(--theme-primary)]";
                } else if (lcat === "withdraw") {
                  categoryIcon3dList = money3d;
                  badgeClass = "bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)]";
                } else if (lcat === "register") {
                  categoryIcon3dList = medal3d;
                  badgeClass = "bg-[var(--theme-primary)]/15 border border-[var(--theme-primary)]/20 text-[var(--theme-primary)]";
                } else if (lcat === "checkin" || lcat.includes("checkin") || ltitle.includes("check-in")) {
                  categoryIcon3dList = calendar3d;
                  badgeClass = "bg-[var(--theme-primary)]/15 border border-[var(--theme-primary)]/20 text-[var(--theme-primary)]";
                } else if (lcat.includes("vip") || lcat.includes("milestone") || ltitle.includes("vip") || ltitle.includes("milestone")) {
                  categoryIcon3dList = trophy3d;
                  badgeClass = "bg-[var(--theme-primary)]/15 border border-[var(--theme-primary)]/20 text-[var(--theme-primary)]";
                } else if (ltitle.includes("product activated")) {
                  categoryIcon3dList = flash3d;
                  badgeClass = "bg-[var(--theme-primary)]/10 border border-[var(--theme-primary)]/20 text-[var(--theme-primary)]";
                } else if (lcat.includes("referral") || ltitle.includes("referral")) {
                  categoryIcon3dList = link3d;
                  badgeClass = "bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)]";
                } else if (lcat === "rewards" || lcat === "daily accumulation" || ltitle.includes("daily income")) {
                  categoryIcon3dList = giftBox3d;
                  badgeClass = "bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)]";
                } else if (logs.category === "system") {
                  categoryIcon3dList = shield3d;
                  badgeClass = "bg-[var(--theme-primary)]/15 border border-[var(--theme-primary)]/30 text-[var(--theme-primary)]";
                } else if (logs.category === "announcement") {
                  categoryIcon3dList = megaphone3d;
                  badgeClass = "bg-[var(--theme-primary)]/15 border border-[var(--theme-primary)]/30 text-[var(--theme-primary)]";
                }

                const isUnread = !readIds.includes(logs.id);

                return (
                  <div
                    key={logs.id}
                    onClick={() => handleOpenAlert(logs)}
                    className="bg-transparent border-0 p-4 rounded-[20px] flex gap-3.5 transition-all text-left cursor-pointer active:scale-[0.98]"
                  >
                    <div className="w-10 h-10 bg-transparent border-0 flex items-center justify-center shrink-0">
                      <img src={categoryIcon3dList} alt="" loading="lazy" decoding="async" className={`w-10 h-10 object-contain ${categoryIcon3dList === flash3d ? "opacity-90 scale-[0.9]" : ""}`} />
                    </div>
                    
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[9px] uppercase tracking-wider font-mono font-black px-2 py-0.5 rounded-full ${badgeClass}`}>
                          {(logs.category === "daily accumulation" || logs.category === "rewards") ? "rewards" : logs.category}
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
                        {logs.title}
                      </h4>
                      <p className="text-[var(--theme-text)] opacity-80 text-[11.5px] font-sans leading-relaxed select-text break-normal whitespace-normal">
                        {renderMessageWithLinks(logs.message)}
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
