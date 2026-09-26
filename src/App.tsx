/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { UserProfile, SubscriptionItem, SubscribedNode, SystemStats, NotificationItem } from "./types";
import AuthView from "./components/AuthView";
import DashboardView from "./components/DashboardView";
import CatalogView from "./components/CatalogView";
import IncomeView from "./components/IncomeView";
import DepositView from "./components/DepositView";
import WithdrawView from "./components/WithdrawView";
import ReferralView from "./components/ReferralView";
import ProfileView from "./components/ProfileView";
import BindAccountView from "./components/BindAccountView";
import GuideView from "./components/GuideView";
import ChatView from "./components/ChatView";
import TransactionHistoryView from "./components/TransactionHistoryView";
import VipTasksPage from "./components/VipTasksPage";
import ProductGuessGame from "./components/ProductGuessGame";
import AlertsView from "./components/AlertsView";
import AdminView from "./components/AdminView";
import { BrandLogo } from "./components/BrandLogo";
import { toast } from "sonner";
import { useCurrency } from "./currency";

import confetti from "canvas-confetti";
import {
  Sparkles,
  Zap,
  Layers,
  Users,
  MessageCircleMore,
  User,
  LogOut,
  Percent,
  X,
  Coins,
  ArrowRight,
  HelpCircle,
  Computer,
  Database,
  BadgeDollarSign,
  Bell,
  Home,
  History,
  Cpu,
  Wallet,
  ShoppingCartIcon
} from "lucide-react";
import navHome3d from "@/src/assets/3d/3dicons-star-iso-premium.png";
import navProducts3d from "@/src/assets/3d/3dicons-fire-iso-premium.png";
import navIncome3d from "@/src/assets/3d/3dicons-dollar-iso-premium.png";
import navHistory3d from "@/src/assets/3d/3dicons-calender-iso-premium.png";
import navChat3d from "@/src/assets/3d/3dicons-chat-bubble-iso-premium.png";
import navProfile3d from "@/src/assets/3d/3dicons-setting-iso-premium.png";
import headerBell3d from "@/src/assets/3d/3dicons-bell-iso-premium.png";
import { LevelBadge } from "./components/LevelBadge";
import { getDaypartGreeting } from "./utils/runs";
import { motion, AnimatePresence } from "motion/react";

import { ThemeProvider } from "./context/ThemeContext";
import { useChatUnread } from "./hooks/useChatUnread";
import { useGatedInterval, useGatedTimeout, useAbortSignal } from "./hooks/useGatedInterval";
import { fetchJsonWithSignal, abortableAll } from "./utils/abortableFetch";

export default function App() {
  const { formatCurrency } = useCurrency();
  const [isAdminRoute, setIsAdminRoute] = useState(
    window.location.pathname.startsWith("/admin/access") || window.location.hash.startsWith("#/admin/access")
  );

  useEffect(() => {
    const handleUrlChange = () => {
      const isAdm = window.location.pathname.startsWith("/admin/access") || window.location.hash.startsWith("#/admin/access");
      setIsAdminRoute(isAdm);
      
      // Enforce session isolation
      if (isAdm) {
        // User sessions are HttpOnly cookies and are deliberately not copied
        // into localStorage. AdminView validates its own separate cookie.
      } else {
        // If entering user space, clear admin session
        localStorage.removeItem("hut8_admin_active");
      }
    };
    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("hashchange", handleUrlChange);
    
    // Initial check
    handleUrlChange();
    
    return () => {
      window.removeEventListener("popstate", handleUrlChange);
      window.removeEventListener("hashchange", handleUrlChange);
    };
  }, []);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  // The server owns the signed HttpOnly cookie. Restore the profile from it
  // before rendering the login screen, so a refresh is not treated as logout.
  useEffect(() => {
    if (isAdminRoute) {
      setIsRestoringSession(false);
      return;
    }

    let cancelled = false;
    setIsRestoringSession(true);
    fetch("/api/auth/session", {
      credentials: "same-origin",
      cache: "no-store"
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((data) => {
        if (!cancelled && data?.authenticated && data.profile) {
          setUserProfile(data.profile);
        }
      })
      .catch((error) => {
        if (!cancelled) console.warn("Unable to restore the user session:", error);
      })
      .finally(() => {
        if (!cancelled) setIsRestoringSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAdminRoute]);
  const [activeTab, setActiveTab] = useState<"dashboard" | "catalog" | "income" | "history" | "referral" | "chat" | "profile" | "account" | "guide" | "deposit" | "withdraw" | "alerts" | "vip" | "arcade">("dashboard");
  const [siteConfig, setSiteConfig] = useState<any>(null);
  const chatUnread = useChatUnread(userProfile?.phone);
  const [userNotifications, setUserNotifications] = useState<NotificationItem[]>([]);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [welcomeBonusAmount, setWelcomeBonusAmount] = useState(0);
  const [welcomePending, setWelcomePending] = useState(false);
  useGatedTimeout(() => { if (welcomePending && !document.hidden) setShowWelcomeModal(true); }, 2000, [welcomePending]);

  // Only a successful registration creates this handoff. A normal login has
  // no pending key, so returning users never see the welcome modal.
  useEffect(() => {
    if (!userProfile?.phone) {
      setShowWelcomeModal(false);
      setWelcomeBonusAmount(0);
      setWelcomePending(false);
      return;
    }

    const welcomeKey = `pending_welcome_bonus_${userProfile.phone}`;
    let pendingBonus: { amount?: number; issuedAt?: number } | null = null;
    try {
      const rawPendingBonus = sessionStorage.getItem(welcomeKey);
      pendingBonus = rawPendingBonus ? JSON.parse(rawPendingBonus) : null;
    } catch {
      pendingBonus = null;
    }

    const amount = Number(pendingBonus?.amount || 0);
    const issuedAt = Number(pendingBonus?.issuedAt || 0);
    const isFreshHandoff = issuedAt > 0 && Date.now() - issuedAt <= 15 * 60 * 1000;
    if (amount <= 0 || !isFreshHandoff) {
      sessionStorage.removeItem(welcomeKey);
      setShowWelcomeModal(false);
      setWelcomeBonusAmount(0);
      setWelcomePending(false);
      return;
    }

    setWelcomeBonusAmount(amount);
    setShowWelcomeModal(false);
    setWelcomePending(true);
    return () => setWelcomePending(false);
  }, [userProfile?.phone]);

  useEffect(() => {
    if (showWelcomeModal) {
      confetti({
        particleCount: 75,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }, [showWelcomeModal]);

  const handleCloseWelcomeModal = () => {
    if (userProfile?.phone) {
      sessionStorage.removeItem(`pending_welcome_bonus_${userProfile.phone}`);
    }
    setShowWelcomeModal(false);
  };

  useEffect(() => {
    if (userProfile?.phone) {
      const todayStr = new Date().toISOString().split("T")[0];
      if (userProfile.lastCheckinDate !== todayStr) {
        const timer = setTimeout(() => {
          setActiveTab("profile");
          toast.info("Reminder: Daily check-in bonus is available now!");
        }, 5 * 60 * 1000); // 5 minutes delay!
        return () => clearTimeout(timer);
      }
    }
  }, [userProfile?.phone]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/config/site", { signal: ctrl.signal })
      .then(r => r.json())
      .then(data => {
        if (!ctrl.signal.aborted && !data.error) {
          setSiteConfig(data);
        }
      })
      .catch(err => { if (err?.name !== "AbortError") console.error("Failed to fetch site config", err); });
    return () => ctrl.abort();
  }, []);

  // Hidden override fix: refetch siteConfig when admin saves (same tab via custom event + other tabs via storage) — throttled focus 60s
  useEffect(() => {
    const refresh = () => {
      if (document.hidden) return;
      const now = Date.now();
      if (now - lastFocusSiteFetch.current < 60000) return;
      lastFocusSiteFetch.current = now;
      fetch("/api/config/site")
        .then(r => r.json())
        .then(data => { if (!data.error) setSiteConfig(data); })
        .catch(() => {});
    };
    const onStorage = (e: StorageEvent) => { if (e.key === "siteConfigUpdatedAt") refresh(); };
    const onCustom = () => refresh();
    const onFocus = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("siteConfigUpdated", onCustom as unknown as EventListener);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("siteConfigUpdated", onCustom as unknown as EventListener);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (siteConfig?.brandName) {
      document.title = siteConfig.brandName;
    }
    if (siteConfig?.logoUrl) {
      let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      const url = siteConfig.logoUrl.trim();
      const isSvg = url.toLowerCase().includes("<svg") || url.startsWith("<");
      if (isSvg) {
        link.href = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(url)));
      } else {
        link.href = url;
      }
    }
  }, [siteConfig]);

  const [previousTab, setPreviousTab] = useState<"dashboard" | "catalog" | "income" | "history" | "referral" | "chat" | "profile" | "deposit" | "withdraw" | "arcade">("dashboard");

  useEffect(() => {
    if (activeTab !== "alerts") {
      setPreviousTab(activeTab as any);
    }
  }, [activeTab]);
  const [chatRoomDefault, setChatRoomDefault] = useState<"shared" | "admin" | "ai">("shared");
  const [autoOpenWithdraw, setAutoOpenWithdraw] = useState(false);
  const [preselectedGpuRent, setPreselectedGpuRent] = useState<SubscriptionItem | null>(null);
  
  // Data lists
  const [items, setItems] = useState<SubscriptionItem[]>([]);
  const [activeNodes, setActiveNodes] = useState<SubscribedNode[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStats | undefined>(undefined);
  
  // 5-minute inactivity auto sign out for users
  const revokeUserSession = () => {
    void fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store"
    }).catch(() => undefined);
  };

  useEffect(() => {
    if (!userProfile || isAdminRoute) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let rafId: number | null = null;
    let ticking = false;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        revokeUserSession();
        setUserProfile(null);
        setActiveTab("dashboard");
        toast.info("You have been signed out due to inactivity.");
      }, 5 * 60 * 1000); // 5 minutes
    };

    const throttledReset = () => {
      if (ticking) return;
      ticking = true;
      rafId = requestAnimationFrame(() => {
        ticking = false;
        resetTimer();
      });
    };

    const activityEvents = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];
    activityEvents.forEach((event) => {
      window.addEventListener(event, throttledReset);
    });

    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      if (rafId !== null) cancelAnimationFrame(rafId);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, throttledReset);
      });
    };
  }, [userProfile, isAdminRoute]);

  // Fetch lists and stats once user is active
  const abortRef = useRef<AbortController | null>(null);
  const lastFocusSiteFetch = useRef<number>(0);
  const _abortSignal = useAbortSignal(); void _abortSignal;

  const applyUserDataResults = useCallback((results: Record<string, unknown>) => {
    const setters: Record<string, (d: unknown) => void> = {
      items: (d) => setItems(d as SubscriptionItem[]),
      subs: (d) => setActiveNodes(d as SubscribedNode[]),
      stats: (d) => setSystemStats(d as SystemStats),
      notifs: (d) => setUserNotifications(d as NotificationItem[]),
    };
    for (const [k, v] of Object.entries(results)) {
      const setter = setters[k];
      if (setter && v !== undefined) setter(v);
    }
  }, []);

  const fetchUserDataAndCatalog = useCallback(async (phone: string) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const signal = ctrl.signal;
    if (document.hidden) return;
    try {
      const tasks: Array<(s: AbortSignal) => Promise<unknown>> = [
        (s) => fetchJsonWithSignal<SubscriptionItem[]>("/api/items", s),
        (s) => fetchJsonWithSignal<SubscribedNode[]>(`/api/subscriptions/${phone}`, s),
        (s) => fetchJsonWithSignal<SystemStats>("/api/system/stats", s),
        (s) => fetchJsonWithSignal<NotificationItem[]>(`/api/profile/notifications/${phone}`, s),
        (s) => fetchJsonWithSignal<UserProfile>(`/api/profile/${phone}`, s),
        (s) => fetchJsonWithSignal<unknown>("/api/config/site", s),
      ];
      const [itemsData, subsData, statsData, notifData, profileData, siteData] = await abortableAll(tasks, signal) as [unknown, unknown, unknown, unknown, unknown, unknown];
      if (signal.aborted) return;
      applyUserDataResults({
        items: itemsData,
        subs: subsData,
        stats: statsData,
        notifs: notifData,
      });
      if (profileData) setUserProfile(profileData as UserProfile);
      if (siteData && !(siteData as { error?: unknown }).error) setSiteConfig(siteData);
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") return;
      console.error("Failed to sync backend endpoints:", e);
    }
  }, [applyUserDataResults]);

  useEffect(() => {
    if (userProfile && !isAdminRoute) {
      void fetchUserDataAndCatalog(userProfile.phone);
    }
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [userProfile?.phone, isAdminRoute, fetchUserDataAndCatalog]);

  useGatedInterval(() => {
    if (userProfile?.phone && !isAdminRoute) void fetchUserDataAndCatalog(userProfile.phone);
  }, 60000, { enabled: !!userProfile?.phone && !isAdminRoute, visibilityGate: true, runOnVisible: true });

  const handleAuthSuccess = (profile: UserProfile) => {
    setUserProfile(profile);
  };

  const handleLogout = () => {
    if (userProfile?.phone) {
      sessionStorage.removeItem(`pending_welcome_bonus_${userProfile.phone}`);
    }
    setUserProfile(null);
    revokeUserSession();
    setActiveTab("dashboard");
  };

  const handleProfileChange = (newProfile: UserProfile) => {
    setUserProfile(newProfile);
  };

  // Callback on successful active subscription activation
  const handleSubscribeSuccess = (newSub: SubscribedNode, costAmt: number) => {
    if (userProfile) {
      const updatedProfile = {
        ...userProfile,
        rechargeBalance: Math.max(0, (userProfile.rechargeBalance || 0) - costAmt)
      };
      setUserProfile(updatedProfile);
    }
    setActiveNodes((prev) => [newSub, ...prev]);
    // Redirect to Income tab so they can view their machines!
    setActiveTab("income");
    // Refresh system global counts
    fetch("/api/system/stats")
      .then((res) => res.json())
      .then(setSystemStats)
      .catch((e) => console.log(e));
  };

  const handleDepositSuccess = (newProfile: UserProfile) => {
    setUserProfile(newProfile);
  };

  const handleGpuSuccess = (newSub: any, CostAmount: number) => {
    setActiveNodes((prev) => [newSub, ...prev]);
    // Refresh system stats
    handleManualStatsRefresh();
    // Redirect to Income tab
    setActiveTab("income");
  };

  // Callback on manual points claims harvesting succeed
  const handleClaimSuccess = (pointsEarned: number, newBalance: number, subId: string) => {
    if (userProfile) {
      const updatedProfile = {
        ...userProfile,
        points: newBalance
      };
      setUserProfile(updatedProfile);
    }
    // Update local node yield tracker to reflect earned values & set status to expired without reloading full page
    setActiveNodes((prev) =>
      prev.map((n) =>
        n.id === subId
          ? {
              ...n,
              status: "expired",
              lastClaimedDate: new Date().toISOString().split("T")[0],
              totalEarned: (n.totalEarned || 0) + pointsEarned
            }
          : n
      )
    );
    // Refresh stats from server
    handleManualStatsRefresh();
  };

  // Refresh whole dashboard — consolidated to single fetchUserDataAndCatalog (already includes referrals+stats)
  const handleManualStatsRefresh = useCallback(async () => {
    if (userProfile) {
      await fetchUserDataAndCatalog(userProfile.phone);
    }
  }, [userProfile, fetchUserDataAndCatalog]);

  const renderContent = () => {
    if (!isAdminRoute && isRestoringSession) {
      return (
        <div className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] font-[var(--theme-font-family)] flex items-center justify-center">
          <div className="theme-card border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] px-5 py-4 text-sm opacity-75">
            Restoring your session…
          </div>
        </div>
      );
    }

    if (isAdminRoute) {
      return <AdminView />;
    }

    if (!userProfile) {
      return <AuthView onAuthSuccess={handleAuthSuccess} siteConfig={siteConfig} />;
    }

    return null; // main content rendered below
  };

  const isMainApp = !isAdminRoute && !isRestoringSession && !!userProfile;

  return (
    <ThemeProvider siteConfig={siteConfig}>
      {!isMainApp ? renderContent() : (
      <div className="relative h-[100dvh] w-full bg-[var(--theme-bg)] text-[var(--theme-text)] font-sans selection:bg-blue-600/35 selection:text-white overflow-hidden flex items-center justify-center p-0 md:p-4">
      

      {/* Welcome Bonus Modal: the registration bonus is already credited server-side. */}
      <AnimatePresence>
        {showWelcomeModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
              onClick={handleCloseWelcomeModal}
            />
            <motion.div
              initial={{ scale: 0.9, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 15, opacity: 0 }}
              transition={{ type: "spring", damping: 20, stiffness: 225 }}
              className="relative w-full max-w-sm bg-white dark:bg-[#1a1a1a] border border-black/10 dark:border-white/10 text-[var(--theme-text)] rounded-[var(--theme-radius)] p-6 pt-7 text-center space-y-4 shadow-2xl z-[210] overflow-hidden font-[var(--theme-font-family)]"
            >
              <div className="absolute top-0 inset-x-0 h-36 bg-gradient-to-b from-[var(--theme-primary)]/20 to-transparent pointer-events-none" />

              <button
                type="button"
                onClick={handleCloseWelcomeModal}
                aria-label="Close welcome message"
                className="absolute right-3 top-3 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--theme-bg)]/80 border border-[var(--theme-card-border)] text-[var(--theme-text)] opacity-70 hover:opacity-100 active:scale-95 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <LevelBadge level={0} className="w-16 h-16 mx-auto relative z-10" />

              <div className="space-y-2 relative z-10">
                <h3 className="font-display font-black text-lg text-[var(--theme-text)] uppercase tracking-tight">Welcome.</h3>
                <p className="text-xs text-[var(--theme-text)] opacity-80 leading-relaxed font-[var(--theme-font-family)] px-1">
                  You have successfully began your journey. <span className="font-black text-[var(--theme-primary)]">UGX {welcomeBonusAmount.toLocaleString()}</span> has been credited to your account.
                </p>
              </div>


            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main vertical handset application envelope */}
      <div 
        className="relative w-full max-w-xl md:max-w-3xl h-full md:h-[94vh] md:rounded-[36px] md:border-[8px] md:border-[var(--theme-card-border)] bg-[var(--theme-bg)] flex flex-col overflow-hidden shadow-2xl z-10 font-[var(--theme-font-family)]"
        style={{
          fontFamily: "var(--theme-font-family), 'Plus Jakarta Sans', sans-serif",
          fontSize: "var(--theme-font-base)",
          backgroundImage: siteConfig?.dashboardBgImage ? `url("${siteConfig.dashboardBgImage}")` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      >
        
        {/* Top Premium navigation Header ribbon */}
        <header className="sticky top-0 z-40 bg-transparent h-16 flex items-center justify-between px-3.5 sm:px-4.5 shrink-0">
          <p className="font-display font-black text-[19px] leading-tight tracking-tight text-[var(--theme-text)] truncate">
            {getDaypartGreeting()}, {userProfile.username || "Operator"}.
          </p>

          {/* Action controllers */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Notification Bell trigger button */}
            <button
              onClick={() => {
                localStorage.setItem("lastViewedAlertsTime", Date.now().toString());
                setPreviousTab(activeTab as any);
                setActiveTab("alerts");
              }}
              className="relative p-1 flex items-center justify-center border-0 transition-[transform,opacity] duration-100 cursor-pointer outline-none h-9 w-9 shrink-0 bg-transparent active:scale-[0.97] will-change-transform opacity-80 hover:opacity-100"
              title="View Alerts & Notifications"
            >
              <img src={headerBell3d} alt="" decoding="async" loading="eager" className="w-7 h-7 object-contain shrink-0 drop-shadow-sm" />
              {userNotifications.filter(n => new Date(n.timestamp).getTime() > Number(localStorage.getItem("lastViewedAlertsTime") || 0)).length > 0 && (
                <>
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-[var(--theme-card-bg)] shadow-xs animate-bounce">
                    {userNotifications.filter(n => new Date(n.timestamp).getTime() > Number(localStorage.getItem("lastViewedAlertsTime") || 0)).length > 9
                      ? "9+"
                      : userNotifications.filter(n => new Date(n.timestamp).getTime() > Number(localStorage.getItem("lastViewedAlertsTime") || 0)).length}
                  </span>
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-rose-500 rounded-full animate-ping pointer-events-none" />
                </>
              )}
            </button>
          </div>
        </header>

        {/* Main interactive tabs content view block */}
        <main className="flex-1 relative min-h-0 flex flex-col isolate overflow-hidden"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <AnimatePresence mode="wait" initial={false}>
            {(activeTab === "dashboard" || (activeTab === "alerts" && previousTab === "dashboard")) && (
              <motion.div
                key="dash"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-1.5 sm:px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <DashboardView
                  profile={userProfile}
                  activeNodes={activeNodes}
                  items={items}
                  onNavigateToCatalog={() => setActiveTab("catalog")}
                  onNavigateToIncome={() => setActiveTab("income")}
                  onProfileUpdate={handleProfileChange}
                />
              </motion.div>
            )}

            {(activeTab === "catalog" || (activeTab === "alerts" && previousTab === "catalog")) && (
              <motion.div
                key="cat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-1.5 sm:px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <CatalogView
                  items={items}
                  userProfile={userProfile}
                  siteConfig={siteConfig}
                  activeSubscriptions={activeNodes}
                  onRentWithMmoney={(item) => {
                    setPreselectedGpuRent(item);
                    setActiveTab("deposit");
                  }}
                  onSubscribeSuccess={handleSubscribeSuccess}
                />
              </motion.div>
            )}

            {(activeTab === "income" || (activeTab === "alerts" && previousTab === "income")) && (
              <motion.div
                key="inc"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-1.5 sm:px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <IncomeView
                  profile={userProfile}
                  activeNodes={activeNodes}
                  items={items}
                  onNavigateToCatalog={() => setActiveTab("catalog")}
                  onClaimSuccess={handleClaimSuccess}
                  onRenew={(item) => {
                    setPreselectedGpuRent(item);
                    setActiveTab("deposit");
                  }}
                />
              </motion.div>
            )}

            {(activeTab === "history" || (activeTab === "alerts" && previousTab === "history")) && (
              <motion.div
                key="hist"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 h-full flex flex-col overflow-hidden"
              >
                <TransactionHistoryView phone={userProfile.phone} siteConfig={siteConfig} onBack={() => setActiveTab("profile")} />
              </motion.div>
            )}

            {(activeTab === "deposit" || (activeTab === "alerts" && previousTab === "deposit")) && (
              <motion.div
                key="dep"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <DepositView
                  userProfile={userProfile}
                  items={items}
                  siteConfig={siteConfig}
                  onDepositSuccess={handleDepositSuccess}
                  onGpuSuccess={handleGpuSuccess}
                  preselectedItem={preselectedGpuRent}
                  onBack={() => {
                    setPreselectedGpuRent(null);
                    setActiveTab("profile");
                  }}
                />
              </motion.div>
            )}

            {(activeTab === "withdraw" || (activeTab === "alerts" && previousTab === "withdraw")) && (
              <motion.div
                key="wit"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <WithdrawView
                  userProfile={userProfile}
                  siteConfig={siteConfig}
                  activeNodes={activeNodes}
                  onBack={() => setActiveTab("profile")}
                  onProfileUpdate={handleProfileChange}
                />
              </motion.div>
            )}

            {(activeTab === "referral" || (activeTab === "alerts" && previousTab === "referral")) && (
              <motion.div
                key="ref"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-1.5 sm:px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <ReferralView userProfile={userProfile} siteConfig={siteConfig} onBack={() => setActiveTab("profile")} />
              </motion.div>
            )}

            {(activeTab === "chat" || (activeTab === "alerts" && previousTab === "chat")) && (
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 flex flex-col min-h-0 h-full overflow-hidden"
              >
                <ChatView userProfile={userProfile} initialRoom={chatRoomDefault} canUpload={userProfile.phone === siteConfig?.adminPhone} brandName={siteConfig?.brandName} activeNodes={activeNodes} siteConfig={siteConfig} />
              </motion.div>
            )}

            {(activeTab === "vip" || (activeTab === "alerts" && previousTab === "vip")) && (
              <motion.div
                key="vip"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 h-full flex flex-col overflow-hidden"
              >
                <VipTasksPage phone={userProfile.phone} siteConfig={siteConfig} userProfile={userProfile} onClaimSuccess={handleProfileChange} onBack={() => setActiveTab("profile")} />
              </motion.div>
            )}

            {(activeTab === "guide" || (activeTab === "alerts" && previousTab === "guide")) && (
              <motion.div
                key="guide"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-1.5 sm:px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <GuideView
                  siteConfig={siteConfig}
                  onBack={() => setActiveTab("profile")}
                />
              </motion.div>
            )}

            {(activeTab === "arcade" || (activeTab === "alerts" && previousTab === "arcade")) && (
              <motion.div
                key="arcade"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-1.5 sm:px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <ProductGuessGame items={items} onExit={() => setActiveTab("profile")} />
              </motion.div>
            )}

            {(activeTab === "account" || (activeTab === "alerts" && previousTab === "account")) && (
              <motion.div
                key="account"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-1.5 sm:px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <BindAccountView
                  userProfile={userProfile!}
                  onProfileUpdate={handleProfileChange}
                  onBack={() => setActiveTab("profile")}
                />
              </motion.div>
            )}

            {(activeTab === "profile" || (activeTab === "alerts" && previousTab === "profile")) && (
              <motion.div
                key="prof"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-1.5 sm:px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <ProfileView
                  userProfile={userProfile!}
                  siteConfig={siteConfig}
                  activeNodes={activeNodes}
                  notifications={userNotifications}
                  onProfileUpdate={handleProfileChange}
                  onNavigateToDeposit={() => setActiveTab("deposit")}
                  onNavigateToWithdraw={() => setActiveTab("withdraw")}
                  autoOpenWithdraw={autoOpenWithdraw}
                  onCloseAutoWithdraw={() => setAutoOpenWithdraw(false)}
                  onNavigate={(tab, room) => {
                    if (room) {
                      setChatRoomDefault(room);
                    } else {
                      setChatRoomDefault("shared");
                    }
                    setActiveTab(tab as any);
                  }}
                  onLogout={handleLogout}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Alerts Bottom Sheet Overlay */}
        <AnimatePresence>
          {activeTab === "alerts" && (
            <div className="absolute inset-0 z-50 flex flex-col justify-end overflow-hidden">
              {/* Blur Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.65 }}
                exit={{ opacity: 0 }}
                onClick={() => setActiveTab(previousTab)}
                className="absolute inset-0 bg-black/70 backdrop-blur-xs cursor-pointer"
              />
              {/* The Bottom Sheet Body */}
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="relative w-full h-[96vh] max-h-[96vh] bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-t-[var(--theme-radius)] flex flex-col overflow-hidden z-10 shadow-2xl"
              >
                {/* Drag Handle + Close */}
                <div className="flex items-center justify-center relative py-3 shrink-0">
                  <div className="w-10 h-1.5 bg-[var(--theme-card-border)] rounded-full" />
                  <button
                    onClick={() => setActiveTab(previousTab)}
                    className="absolute right-4 p-1.5 rounded-full btn-3d-secondary border border-[var(--theme-card-border)] text-[var(--theme-text)] cursor-pointer focus:outline-none"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-none pb-6">
                  <AlertsView
                    profile={userProfile!}
                    initialNotifications={userNotifications}
                    onBack={() => setActiveTab(previousTab)}
                    onNotificationsChange={setUserNotifications}
                  />
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Bottom Tab Bar — First stab: angular, chunky, Duolingo-playful, not a pill */}
        <div className="w-full px-0 pb-0 pt-0 bg-transparent shrink-0 z-40 select-none">
          <nav className="w-full max-w-xl mx-auto bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-t-[28px] shadow-[0_-10px_40px_rgba(0,0,0,0.08)] px-1.5 sm:px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] flex items-center justify-between gap-1">
            {/* Home */}
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-2xl border-0 transition-colors active:scale-[0.97] ${activeTab === "dashboard" ? "bg-[var(--theme-primary)] text-white shadow-[0_3px_0_0_var(--theme-primary-shadow)] -translate-y-0.5" : "bg-transparent text-[var(--theme-text)] opacity-100"}`}
            >
              <img src={navHome3d} alt="" decoding="async" loading="eager" className="w-10 h-10 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.12)]" />
              <span className="text-[9px] sm:text-[10px] font-display font-black uppercase tracking-wide leading-none">Home</span>
            </button>

            {/* Products */}
            <button
              onClick={() => setActiveTab("catalog")}
              className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-2xl border-0 transition-colors active:scale-[0.97] ${activeTab === "catalog" ? "bg-[var(--theme-primary)] text-white shadow-[0_3px_0_0_var(--theme-primary-shadow)] -translate-y-0.5" : "bg-transparent text-[var(--theme-text)] opacity-100"}`}
            >
              <img src={navProducts3d} alt="" decoding="async" loading="eager" className="w-10 h-10 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.12)]" />
              <span className="text-[9px] sm:text-[10px] font-display font-black uppercase tracking-wide leading-none">Products</span>
            </button>

            {/* Income */}
            <button
              onClick={() => setActiveTab("income")}
              className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-2xl border-0 transition-colors active:scale-[0.97] ${activeTab === "income" ? "bg-[var(--theme-primary)] text-white shadow-[0_3px_0_0_var(--theme-primary-shadow)] -translate-y-0.5" : "bg-transparent text-[var(--theme-text)] opacity-100"}`}
            >
              <img src={navIncome3d} alt="" decoding="async" loading="eager" className="w-10 h-10 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.12)]" />
              <span className="text-[9px] sm:text-[10px] font-display font-black uppercase tracking-wide leading-none">Income</span>
            </button>

            {/* History — NEW */}
            <button
              onClick={() => setActiveTab("history")}
              className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-2xl border-0 transition-colors active:scale-[0.97] ${activeTab === "history" ? "bg-[var(--theme-primary)] text-white shadow-[0_3px_0_0_var(--theme-primary-shadow)] -translate-y-0.5" : "bg-transparent text-[var(--theme-text)] opacity-100"}`}
            >
              <img src={navHistory3d} alt="" decoding="async" loading="eager" className="w-10 h-10 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.12)]" />
              <span className="text-[9px] sm:text-[10px] font-display font-black uppercase tracking-wide leading-none">History</span>
            </button>

            {/* Chat */}
            <button
              onClick={() => setActiveTab("chat")}
              className={`relative flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-2xl border-0 transition-colors active:scale-[0.97] ${activeTab === "chat" ? "bg-[var(--theme-primary)] text-white shadow-[0_3px_0_0_var(--theme-primary-shadow)] -translate-y-0.5" : "bg-transparent text-[var(--theme-text)] opacity-100"}`}
            >
              <img src={navChat3d} alt="" decoding="async" loading="eager" className="w-10 h-10 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.12)]" />
              {chatUnread > 0 && (
                <span className="absolute top-1 right-1 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-[var(--theme-bg)]">
                  {chatUnread > 99 ? "99+" : chatUnread}
                </span>
              )}
              <span className="text-[9px] sm:text-[10px] font-display font-black uppercase tracking-wide leading-none">Chat</span>
            </button>

            {/* Profile */}
            <button
              onClick={() => setActiveTab("profile")}
              className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-2xl border-0 transition-colors active:scale-[0.97] ${activeTab === "profile" ? "bg-[var(--theme-primary)] text-white shadow-[0_3px_0_0_var(--theme-primary-shadow)] -translate-y-0.5" : "bg-transparent text-[var(--theme-text)] opacity-100"}`}
            >
              <img src={navProfile3d} alt="" decoding="async" loading="eager" className="w-10 h-10 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.12)]" />
              <span className="text-[9px] sm:text-[10px] font-display font-black uppercase tracking-wide leading-none">Profile</span>
            </button>
          </nav>
        </div>



      </div>
    </div>
      )}
    </ThemeProvider>
  );
}
