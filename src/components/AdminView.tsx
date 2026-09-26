/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { useGatedInterval } from "../hooks/useGatedInterval";
import { fetchJsonWithSignal } from "../utils/abortableFetch";
// XLSX lazy-loaded via dynamic import inside handlers
import { 
  ShieldAlert, 
  Users, 
  Coins, 
  CheckCircle2, 
  X, 
  AlertCircle,
  Plus, 
  Trash2, 
  Lock, 
  Unlock, 
  RefreshCw,
  Search,
  Key,
  Filter,
  BadgeAlert,
  ChevronDown,
  Cpu,
  LayoutDashboard,
  LogOut,
  MoreVertical,
  Activity,
  Edit,
  User,
  ChevronRight,
  ChevronLeft,
  Loader,
  Bell,
  Home,
  Upload,
  Download,
  MessageSquare,
  Send,
  FileImage,
  Image,
  Settings,
  Save,
  Loader2,
  Eye,
  EyeOff,
  Copy,
  Gift,
  Folder,
  Calendar,
  Clock,
  Tags,
  Package,
  PackageX,
  FileSpreadsheet,
  Palette,
  Sparkles,
  Brush,
  Sun,
  Moon,
  Monitor
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import { UserProfile, SubscriptionItem, ThemePreset, ThemeMode, VipTaskConfig } from "../types";
import AdminChatDesk from "./AdminChatDesk";
import AdminChart from "./AdminChart";
import { BrandLogo } from "./BrandLogo";
import { useTheme } from "../context/ThemeContext";
import { HUT12_PRESETS, HUT12_PRESET_OPTIONS } from "../utils/themeTokens";
import { migrateCardStyle, sanitizeSiteConfig } from "../utils/themeTokens";
import { fixGitHubImageUrl } from "../utils/imageUtils";
import { readApiJson } from "../utils/api";
import { canonicalTypeOf, getWithdrawalDisplayAmounts } from "../utils/transactionMeta";
import { normalizeVipTask, dedupeCategories } from "@/src/utils/vip";

function isSettledTransaction(transaction: any): boolean {
  const status = String(transaction?.status || "").toUpperCase();
  return status === "SUCCESSFUL" || status === "COMPLETED" || status === "APPROVED";
}

function getTimeLeft(expiryDate: string): string {
  const difference = new Date(expiryDate).getTime() - Date.now();
  if (difference <= 0) return "Expired";
  const days = Math.floor(difference / (1000 * 60 * 60 * 24));
  const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((difference / 1000 / 60) % 60);
  const seconds = Math.floor((difference / 1000) % 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

function GiftCountdown({ expiryDate }: { expiryDate: string }) {
  const timeLeft = getTimeLeft(expiryDate);
  const isExpired = timeLeft === "Expired";
  return (
    <span className={`font-mono text-xs ${isExpired ? "text-rose-500 font-semibold" : "text-blue-400 font-semibold"}`}>
      {timeLeft}
    </span>
  );
}

export default function AdminView() {
  const { formatCurrency, currency } = useCurrency();
  const isActivateRoute = window.location.pathname === "/admin/access/activate" || window.location.hash.startsWith("#/admin/access/activate");
  const [seedStatus, setSeedStatus] = useState<"pending" | "success" | "error">("pending");
  const [seedMessage, setSeedMessage] = useState("Activating admin account...");
  const [seedError, setSeedError] = useState("");
  const [activatedAdminInfo, setActivatedAdminInfo] = useState<{ username?: string; phone?: string }>({});
  // The activate route POSTs on mount; StrictMode double-invokes effects in
  // dev, so guard against firing the seed request twice.
  const seedFiredRef = useRef(false);

  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [uploadingField, setUploadingField] = useState<"logoUrl" | "authBgImage" | "dashboardBgImage" | null>(null);

  useEffect(() => {
    if (!isActivateRoute) return;
    if (seedFiredRef.current) return;
    seedFiredRef.current = true;

    const triggerSeed = async () => {
      try {
        const res = await fetch("/api/admin/access/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        const data = await res.json();
        if (res.ok) {
          setSeedStatus("success");
          setSeedMessage("Admin account successfully activated.");
          setActivatedAdminInfo({ username: data.username, phone: data.phone });
          toast.success("Activation successful!");
        } else {
          setSeedStatus("error");
          setSeedError(data.error || "Seeding failed.");
          toast.error(data.error || "Activation failed.");
        }
      } catch (err: any) {
        setSeedStatus("error");
        setSeedError(err.message || "Internal network error.");
        toast.error("Internal network error.");
      }
    };
    
    triggerSeed();
  }, [isActivateRoute]);

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Admin tabs
  const [activeAdminTab, setActiveAdminTab] = useState<"home" | "nodes" | "users" | "transactions" | "announcements" | "chat" | "config" | "profile" | "giftcodes">("home");

  // Data layers
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [transactionsList, setTransactionsList] = useState<any[]>([]);
  const [catalogItems, setCatalogItems] = useState<SubscriptionItem[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  
  // Site Config state
  const [siteConfig, setSiteConfig] = useState<any>({
    adminPhone: "",
    adminPass: "",
    adminUsername: "",
    whatsappLink: "",
    telegramLink: ""
  });
  
  // Filtering & Search
  const [userSearchText, setUserSearchText] = useState("");
  const [nodeSearchText, setNodeSearchText] = useState("");
  const [txFilterStatus, setTxFilterStatus] = useState<string>("ALL");
  const [txSearchText, setTxSearchText] = useState<string>("");
  const [txFilterType, setTxFilterType] = useState<string>("ALL");
  const [txFilterMode, setTxFilterMode] = useState<string>("ALL");

  // Pagination states
  const [nodesPage, setNodesPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const [txPage, setTxPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  
  // Modals & Confirmations
  const [confirmDialog, setConfirmDialog] = useState<{ title: string, message: string, onConfirm: () => void } | null>(null);

  // Editing nodes state
  const [isEditingNode, setIsEditingNode] = useState<SubscriptionItem | null>(null);
  const [isCreatingNode, setIsCreatingNode] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Bulk upload & category states
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [isNodesMoreMenuOpen, setIsNodesMoreMenuOpen] = useState(false);
  const [isConfirmDeleteAllModalOpen, setIsConfirmDeleteAllModalOpen] = useState(false);
  const [isDeletingAllNodes, setIsDeletingAllNodes] = useState(false);

  const handleDeleteAllNodes = async () => {
    setIsDeletingAllNodes(true);
    try {
      const res = await fetch("/api/admin/catalog/delete-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete all nodes");
      toast.success(data.message || "All server nodes deleted successfully!");
      setIsConfirmDeleteAllModalOpen(false);
      await fetchAllAdminData();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete all nodes");
    } finally {
      setIsDeletingAllNodes(false);
    }
  };

  // Action loading spinners & Excel preview states
  const [togglingStockId, setTogglingStockId] = useState<string | null>(null);
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null);
  const [parsedExcelNodes, setParsedExcelNodes] = useState<any[] | null>(null);
  const [parsedExcelFileName, setParsedExcelFileName] = useState<string>("");
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [isImportingBulk, setIsImportingBulk] = useState(false);

  // Form states for item create/edit
  const [nodeId, setNodeId] = useState("");
  const [nodeName, setNodeName] = useState("");
  const [nodeCategory, setNodeCategory] = useState("");
  const [nodeAmount, setNodeAmount] = useState<number>(100000);
  const [nodeDuration, setNodeDuration] = useState<number>(40);
  const [nodeDailyProfitPct, setNodeDailyProfitPct] = useState<number>(30);
  const [nodeBonusPct, setNodeBonusPct] = useState<number>(10);
  const [nodeImageUrl, setNodeImageUrl] = useState("");
  const [nodeDisabled, setNodeDisabled] = useState(false);
  const [nodeOutOfStock, setNodeOutOfStock] = useState(false);

  // Announcements Form
  const [isCreatingAnnx, setIsCreatingAnnx] = useState(false);
  const [annTitle, setAnnTitle] = useState("");
  const [annMessage, setAnnMessage] = useState("");
  const [annLink, setAnnLink] = useState("");
  const [annCategory, setAnnCategory] = useState("announcement");
  const [annImageUrl, setAnnImageUrl] = useState("");
  const [annTag, setAnnTag] = useState("");
  const [editingAnnx, setEditingAnnx] = useState<any | null>(null);
  const [annSubTab, setAnnSubTab] = useState("announcements");
  const [annAlertUsers, setAnnAlertUsers] = useState(false);
  const [configSubTab, setConfigSubTab] = useState<"brand" | "theme" | "rewards" | "referral" | "vipTasks" | "gateways" | "giftcodes" | "checkin">("brand");
  const [vipTaskTitle, setVipTaskTitle] = useState("");
  const [vipTaskDescription, setVipTaskDescription] = useState("");
  const [vipTaskCategory, setVipTaskCategory] = useState("");
  const [vipTaskMetric, setVipTaskMetric] = useState("operator_points");
  const [vipTaskRequiredBonus, setVipTaskRequiredBonus] = useState(0);
  const [vipTaskReward, setVipTaskReward] = useState(0);
  const [vipTaskImageUrl, setVipTaskImageUrl] = useState("");
  const [isVipTaskModalOpen, setIsVipTaskModalOpen] = useState(false);
  const [editingVipTaskId, setEditingVipTaskId] = useState<string | null>(null);
  const [openVipTaskMenuId, setOpenVipTaskMenuId] = useState<string | null>(null);
  const [isVipCategoryModalOpen, setIsVipCategoryModalOpen] = useState(false);
  const [newVipCategory, setNewVipCategory] = useState("");
  const { updateLocalThemeConfig } = useTheme();

  const getVipTasks = (): VipTaskConfig[] => Array.isArray(siteConfig?.vipTasks) ? siteConfig.vipTasks : [];
  const getVipTaskCategories = (): string[] => dedupeCategories([
    ...(Array.isArray(siteConfig?.vipTaskCategories) ? siteConfig.vipTaskCategories : []),
    ...getVipTasks().map((task) => task.category)
  ]);
  const currentWithdrawMode: "automatic" | "manual" = siteConfig?.allowAutoWithdraw === false ? "manual" : "automatic";

  const persistVipConfig = async (nextFields: Record<string, unknown>, successMessage: string) => {
    const nextConfig = { ...siteConfig, ...nextFields };
    try {
      setIsLoading(true);
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextConfig)
      });
      await readApiJson<{ success: boolean }>(res);
      setSiteConfig(nextConfig);
      updateLocalThemeConfig(nextConfig);
      toast.success(successMessage);
      return true;
    } catch (err: any) {
      toast.error(err.message || "Could not save milestone configuration.");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const resetVipTaskForm = () => {
    setVipTaskTitle("");
    setVipTaskDescription("");
    setVipTaskCategory("");
    setVipTaskMetric("operator_points");
    setVipTaskRequiredBonus(0);
    setVipTaskReward(0);
    setVipTaskImageUrl("");
  };

  const handleAddVipTask = async () => {
    const rawTask = {
      id: editingVipTaskId || `vip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: vipTaskTitle,
      description: vipTaskDescription,
      category: vipTaskCategory,
      metric: vipTaskMetric,
      requiredBonus: vipTaskRequiredBonus,
      reward: vipTaskReward,
      imageUrl: vipTaskImageUrl,
      active: editingVipTaskId ? getVipTasks().find((task) => task.id === editingVipTaskId)?.active !== false : true
    };
    let task: VipTaskConfig;
    try {
      task = normalizeVipTask(rawTask);
      if (!task.title || !task.category) throw new Error("Enter a milestone title and category.");
      if (!Number.isFinite(task.requiredBonus) || task.requiredBonus <= 0 || !Number.isFinite(task.reward) || task.reward <= 0) throw new Error("Requirement and reward must both be greater than zero.");
      if (editingVipTaskId) task.id = editingVipTaskId;
    } catch (err: any) {
      toast.error(err.message || "Enter a milestone title and category.");
      return;
    }
    const existingTask = editingVipTaskId ? getVipTasks().find((task) => task.id === editingVipTaskId) : undefined;
    const nextTasks = existingTask
      ? getVipTasks().map((currentTask) => currentTask.id === existingTask.id ? task : currentTask)
      : [...getVipTasks(), task];
    const saved = await persistVipConfig({ vipTasks: nextTasks }, existingTask ? "Milestone updated." : "Milestone published.");
    if (saved) {
      resetVipTaskForm();
      setEditingVipTaskId(null);
      setIsVipTaskModalOpen(false);
    }
  };

  const handleOpenVipTaskEditor = (task: VipTaskConfig) => {
    setEditingVipTaskId(task.id);
    setVipTaskTitle(task.title);
    setVipTaskDescription(task.description || "");
    setVipTaskCategory(task.category || "");
    setVipTaskMetric(task.metric || "operator_points");
    setVipTaskRequiredBonus(Number(task.requiredBonus || 0));
    setVipTaskReward(Number(task.reward || 0));
    setVipTaskImageUrl(task.imageUrl || "");
    setOpenVipTaskMenuId(null);
    setIsVipTaskModalOpen(true);
  };

  const handleVipTaskImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Only PNG, JPG or WebP images are allowed.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be smaller than 2 MB.");
      return;
    }
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read file."));
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "viptask", data }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Upload failed.");
      setVipTaskImageUrl(body.url);
      toast.success("Art uploaded — save the milestone to keep it.");
    } catch (err: any) {
      toast.error(err.message || "Upload failed.");
    }
  };

  const handleRemoveVipTask = async (taskId: string) => {
    await persistVipConfig({ vipTasks: getVipTasks().filter((task) => task.id !== taskId) }, "Milestone removed.");
  };

  const handleToggleVipTask = async (taskId: string) => {
    await persistVipConfig({
      vipTasks: getVipTasks().map((task) => task.id === taskId ? { ...task, active: task.active === false } : task)
    }, "Milestone status updated.");
  };

  const handleAddVipCategory = async () => {
    const category = newVipCategory.trim();
    if (!category) return;
    const next = dedupeCategories([...getVipTaskCategories(), category]);
    if (next.length === getVipTaskCategories().length) {
      toast.info("That tier already exists.");
      return;
    }
      const saved = await persistVipConfig({ vipTaskCategories: next }, "Tier created.");
    if (saved) {
      setNewVipCategory("");
      setVipTaskCategory(category);
    }
  };

  const handleRemoveVipCategory = async (category: string) => {
    const isUsed = getVipTasks().some((task) => task.category === category);
    if (isUsed) {
      toast.error("This category is used by a task. Move or remove that task first.");
      return;
    }
      await persistVipConfig({ vipTaskCategories: getVipTaskCategories().filter((existing) => existing !== category) }, "Tier removed.");
  };

  // Password override state
  const [userToOverride, setUserToOverride] = useState<UserProfile | null>(null);
  const [newOverridePassword, setNewOverridePassword] = useState("");
  const [giftCodesList, setGiftCodesList] = useState<any[]>([]);
  const [giftTick, setGiftTick] = useState(0);
  useGatedInterval(() => setGiftTick((v) => v + 1), 1000, { enabled: giftCodesList.length > 0, visibilityGate: true });
  void giftTick;
  const [newGiftCode, setNewGiftCode] = useState("");
  const [newGiftCodeAmount, setNewGiftCodeAmount] = useState<number>(5000);
  const [newGiftCodeMax, setNewGiftCodeMax] = useState<number>(100);
  const [newGiftCodeExpiry, setNewGiftCodeExpiry] = useState("1d");
  const [newGiftCodeExpiryDateTime, setNewGiftCodeExpiryDateTime] = useState(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [isCreateGiftModalOpen, setIsCreateGiftModalOpen] = useState(false);
  const [selectedGiftCode, setSelectedGiftCode] = useState<any | null>(null);
  const [isDeleteGiftConfirmOpen, setIsDeleteGiftConfirmOpen] = useState(false);
  const [isCreatingGiftCode, setIsCreatingGiftCode] = useState(false);
  const [isDeletingGiftCode, setIsDeletingGiftCode] = useState(false);

  useEffect(() => {
    // Fetch public site config for the login page
    fetch("/api/config/site")
      .then(res => res.json())
      .then(data => {
        if (!data.error) setSiteConfig((prev: any) => ({ ...prev, ...data }));
      })
      .catch(err => console.error(err));
      
  }, []);

  // 10-minute inactivity auto sign out for admin
  useEffect(() => {
    if (!isAdminLoggedIn) return;

    let timeoutId: any;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setIsAdminLoggedIn(false);
        localStorage.removeItem("hut8_admin_active");
        toast.info("You have been signed out due to inactivity.");
      }, 3 * 60 * 1000); // 3 minute
    };

    const activityEvents = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];
    activityEvents.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [isAdminLoggedIn]);

  const fetchAllAdminData = async () => {
    const ctrl = new AbortController();
    const signal = ctrl.signal;
    try {
      setIsLoading(true);
      const [itemsRes, usersRes, txRes, annRes, confRes, gcRes] = await Promise.all([
        fetch("/api/admin/catalog/nodes", { signal }),
        fetch("/api/admin/users", { signal }),
        fetch("/api/admin/transactions", { signal }),
        fetch("/api/admin/announcements", { signal }),
        fetch("/api/admin/config", { signal }),
        fetch(`/api/admin/gift_codes`, { signal }),
      ]);
      if (signal.aborted) return;
      if (itemsRes.ok) setCatalogItems(await itemsRes.json());
      if (usersRes.ok) {
        let users: UserProfile[] = await usersRes.json();
        const adminPh = siteConfig?.adminPhone || "admin";
        users = users.filter((u) => u.phone !== adminPh);
        setUsersList(users);
      }
      if (txRes.ok) setTransactionsList(await txRes.json());
      if (annRes.ok) setAnnouncements(await annRes.json());
      if (confRes.ok) setSiteConfig(await confRes.json());
      if (gcRes.ok) setGiftCodesList(await gcRes.json());
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      toast.error("Failed loading admin states");
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{9,10}$/.test(phone.trim())) {
      const message = "Phone number must be 9 or 10 digits.";
      toast.error(message);
      return;
    }
    if (!password || password.length > 128) {
      const message = "Enter a valid admin password.";
      toast.error(message);
      return;
    }
    try {
      setIsLoggingIn(true);
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Authenticated successfully");
        setIsAdminLoggedIn(true);
        localStorage.removeItem("session_phone");
        fetchAllAdminData();
      } else {
        const message = data.error || "Admin phone number or password is incorrect.";
        toast.error(message);
      }
    } catch (err: any) {
      const message = err?.message || "Admin sign-in is temporarily unavailable.";
      toast.error(message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAdminLogout = () => {
    setIsAdminLoggedIn(false);
    localStorage.removeItem("hut8_admin_active");
    fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    toast.info("Logged out of Admin Console");
  };

  // Node Actions
  const handleOpenEditNode = (item: SubscriptionItem) => {
    setActiveDropdown(null);
    setIsEditingNode(item);
    setIsCreatingNode(false);
    setNodeId(item.id);
    setNodeName(item.name);
    setNodeCategory(item.category);
    setNodeAmount(item.amount);
    setNodeDuration(item.duration);
    setNodeDailyProfitPct((item.dailyYield / item.amount) * 100);
    setNodeBonusPct(item.inviteBonusPercent || 10);
    setNodeImageUrl(item.imageUrl || "");
    setNodeDisabled(!!(item as any).disabled);
    setNodeOutOfStock(!!item.outOfStock);
  };

  const handleOpenCreateNode = () => {
    setIsCreatingNode(true);
    setIsEditingNode(null);
    setNodeId(`node-${Date.now().toString().slice(-4)}`);
    setNodeName("New Asset");
    setNodeCategory(siteConfig?.categories?.[0] || catalogItems[0]?.category || "General");
    setNodeAmount(80000);
    setNodeDuration(40);
    setNodeDailyProfitPct(37.5);
    setNodeBonusPct(10);
    setNodeImageUrl("");
    setNodeDisabled(false);
    setNodeOutOfStock(false);
  };

  const handleToggleOutOfStock = async (item: SubscriptionItem) => {
    try {
      setTogglingStockId(item.id);
      const newStatus = !item.outOfStock;
      const res = await fetch("/api/admin/catalog/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...item,
          outOfStock: newStatus
        })
      });
      if (!res.ok) throw new Error("Failed to update stock status.");
      toast.success(`"${item.name}" is now marked as ${newStatus ? "Out of Stock" : "In Stock"}.`);
      fetchAllAdminData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setTogglingStockId(null);
    }
  };

  // Category Management Actions
  const handleAddCategory = async () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed) return;
    const existing: string[] = siteConfig?.categories || [];
    if (existing.includes(trimmed)) {
      toast.info(`Category "${trimmed}" already exists.`);
      return;
    }
    const updatedCats = [...existing, trimmed];
    try {
      setIsLoading(true);
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...siteConfig, categories: updatedCats })
      });
      if (!res.ok) throw new Error("Failed saving category.");
      setSiteConfig({ ...siteConfig, categories: updatedCats });
      setNewCategoryInput("");
      toast.success(`Category "${trimmed}" added successfully!`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCategory = async (catToDelete: string) => {
    const existing: string[] = siteConfig?.categories || [];
    const updatedCats = existing.filter((c: string) => c !== catToDelete);
    try {
      setIsLoading(true);
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...siteConfig, categories: updatedCats })
      });
      if (!res.ok) throw new Error("Failed deleting category.");
      setSiteConfig({ ...siteConfig, categories: updatedCats });
      toast.success(`Category "${catToDelete}" removed.`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Download Sample Excel Template
  const handleDownloadExcelSample = async () => {
    const XLSX = await import("xlsx");
    const sampleData = [
      {
        "Series/Category": "GS Series",
        "Product Name": "GS-1",
        "Price (UGX)": "700,000",
        "Duration (Days)": "40 Days",
        "Daily Percentage (%)": "5.00%",
        "Daily Income (UGX)": "35,000",
        "Image URL": "https://cdn.sanity.io/images/2iccs2ie/production/4b4bb6d904403cb2abe5c37ebc3115f353619e82-2500x2500.jpg"
      },
      {
        "Series/Category": "GS Series",
        "Product Name": "GS-2",
        "Price (UGX)": "1,500,000",
        "Duration (Days)": "40 Days",
        "Daily Percentage (%)": "5.20%",
        "Daily Income (UGX)": "78,000",
        "Image URL": "https://cdn.sanity.io/images/2iccs2ie/production/ff8e575a2c98bd9772823afb29d0bd499a1b0b3a-2916x2916.jpg"
      },
      {
        "Series/Category": "AS Series",
        "Product Name": "AS-1",
        "Price (UGX)": "3,000,000",
        "Duration (Days)": "45 Days",
        "Daily Percentage (%)": "5.50%",
        "Daily Income (UGX)": "165,000",
        "Image URL": "https://cdn.sanity.io/images/2iccs2ie/production/4b4bb6d904403cb2abe5c37ebc3115f353619e82-2500x2500.jpg"
      },
      {
        "Series/Category": "U Series",
        "Product Name": "U-1",
        "Price (UGX)": "5,000,000",
        "Duration (Days)": "50 Days",
        "Daily Percentage (%)": "6.00%",
        "Daily Income (UGX)": "300,000",
        "Image URL": "https://cdn.sanity.io/images/2iccs2ie/production/ff8e575a2c98bd9772823afb29d0bd499a1b0b3a-2916x2916.jpg"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Server Nodes");
    XLSX.writeFile(workbook, "server_nodes_bulk_upload_sample.xlsx");
    toast.success("Downloaded Excel Sample Template!");
  };

  // Excel File Upload Handler (Parses sheet & displays preview)
  const handleBulkUploadFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const XLSX = await import("xlsx");
      setIsParsingExcel(true);
      setParsedExcelFileName(file.name);
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      if (!rawRows || rawRows.length === 0) {
        toast.error("Excel worksheet is empty.");
        setIsParsingExcel(false);
        return;
      }

      let currentSeries = siteConfig?.categories?.[0] || catalogItems[0]?.category || "General";
      const parsedItems: any[] = [];

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];

        const getVal = (keys: string[]): string => {
          for (const k of Object.keys(row)) {
            const cleanKey = k.trim().toLowerCase();
            for (const targetKey of keys) {
              if (cleanKey === targetKey.toLowerCase() || cleanKey.includes(targetKey.toLowerCase())) {
                const val = row[k];
                if (val !== undefined && val !== null && val !== "") {
                  return String(val).trim();
                }
              }
            }
          }
          return "";
        };

        let category = getVal(["series/category", "category / series", "series", "category", "group"]);
        if (category) {
          currentSeries = category;
        } else {
          category = currentSeries;
        }

        const name = getVal(["product name", "product", "name", "node name", "item"]);
        if (!name) continue;

        const rawAmount = getVal(["price (ugx)", "price(ugx)", "price ugx", "price", "amount", "cost"]);
        const amount = parseInt(rawAmount.replace(/[^0-9]/g, "")) || 100000;

        const rawDuration = getVal(["duration (days)", "duration(days)", "duration days", "duration", "days"]);
        const duration = parseInt(rawDuration.replace(/[^0-9]/g, "")) || 40;

        const rawDailyPct = getVal(["daily percentage (%)", "daily percentage", "daily percentage %", "daily %", "daily yield (%)"]);
        const rawDailyIncome = getVal(["daily income (ugx)", "daily income(ugx)", "daily income ugx", "daily income"]);

        let calcYield = 0;
        if (rawDailyIncome) {
          calcYield = parseInt(rawDailyIncome.replace(/[^0-9]/g, "")) || 0;
        }
        if (!calcYield && rawDailyPct) {
          const cleanPct = parseFloat(rawDailyPct.replace(/[^0-9.]/g, "")) || 5;
          const actualPct = cleanPct > 1 ? cleanPct / 100 : cleanPct;
          calcYield = Math.round(amount * actualPct);
        }
        if (!calcYield) {
          calcYield = Math.round(amount * 0.05);
        }

        const imageUrl = getVal(["image url", "imageurl", "image", "photo"]) || "https://cdn.sanity.io/images/2iccs2ie/production/4b4bb6d904403cb2abe5c37ebc3115f353619e82-2500x2500.jpg";

        parsedItems.push({
          id: `node-excel-${Date.now()}-${i}`,
          name,
          category,
          amount,
          duration,
          dailyYield: calcYield,
          inviteBonusPercent: 10,
          imageUrl,
          image: "from-blue-600 via-cyan-600 to-blue-700",
          outOfStock: false,
          disabled: false
        });
      }

      if (parsedItems.length === 0) {
        toast.error("No valid product rows found in Excel sheet.");
      } else {
        setParsedExcelNodes(parsedItems);
        toast.success(`Parsed ${parsedItems.length} server nodes! Review and confirm import.`);
      }
    } catch (err: any) {
      toast.error(`Failed parsing Excel upload: ${err.message}`);
    } finally {
      setIsParsingExcel(false);
      e.target.value = "";
    }
  };

  // Bulk Import Executor after User Confirmation
  const handleConfirmBulkImport = async () => {
    if (!parsedExcelNodes || parsedExcelNodes.length === 0) return;
    setIsImportingBulk(true);

    const total = parsedExcelNodes.length;
    for (let i = 0; i < total; i++) {
      const item = parsedExcelNodes[i];
      setBulkProgress({
        current: i + 1,
        total,
        message: `Importing ${item.name} (${item.category})...`
      });

      try {
        await fetch("/api/admin/catalog/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item)
        });
      } catch (err) {
        console.error(`Bulk import error for node index ${i}:`, err);
      }
      await new Promise((r) => setTimeout(r, 120));
    }

    toast.success(`Successfully imported ${total} server nodes into catalog!`);
    setIsImportingBulk(false);
    setBulkProgress(null);
    setParsedExcelNodes(null);
    setIsBulkUploadOpen(false);
    fetchAllAdminData();
  };

  const handleSaveNode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      const res = await fetch("/api/admin/catalog/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: nodeId,
          name: nodeName,
          category: nodeCategory,
          amount: nodeAmount,
          duration: nodeDuration,
          dailyYield: Math.round(nodeAmount * (nodeDailyProfitPct / 100)),
          inviteBonusPercent: nodeBonusPct,
          imageUrl: nodeImageUrl,
          image: "from-blue-600 via-cyan-600 to-blue-700", // Standardized generic gradient
          disabled: nodeDisabled,
          outOfStock: nodeOutOfStock
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed saving catalog node.");

      toast.success(`Successfully saved: ${nodeName}`);
      setIsEditingNode(null);
      setIsCreatingNode(false);
      fetchAllAdminData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle || !annMessage) return;
    try {
      setIsLoading(true);
      const url = editingAnnx 
        ? `/api/admin/announcements/${editingAnnx.id}`
        : "/api/admin/announcements";
      const method = editingAnnx ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          title: annTitle, 
          message: annMessage, 
          readMoreLink: annLink,
          category: annCategory,
          imageUrl: annImageUrl,
          tag: annTag,
          alertUsers: annCategory === "news" ? annAlertUsers : true
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(editingAnnx ? "Announcement updated." : "Announcement published.");
      setIsCreatingAnnx(false);
      setEditingAnnx(null);
      setAnnTitle("");
      setAnnMessage("");
      setAnnLink("");
      setAnnCategory("announcement");
      setAnnImageUrl("");
      setAnnTag("");
      fetchAllAdminData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    setActiveDropdown(null);
    setConfirmDialog({
      title: "Delete Announcement",
      message: "Are you sure you want to delete this announcement?",
      onConfirm: async () => {
        try {
          setIsLoading(true);
          const res = await fetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);

          toast.success("Announcement deleted.");
          fetchAllAdminData();
        } catch (err: any) {
          toast.error(err.message);
        } finally {
          setIsLoading(false);
          setConfirmDialog(null);
        }
      }
    });
  };

  const handleDeleteNode = async (id: string, name: string) => {
    setActiveDropdown(null);
    setConfirmDialog({
      title: "Delete Node",
      message: `Delete node ${name}? This cannot be undone.`,
      onConfirm: async () => {
        try {
          setIsLoading(true);
          const res = await fetch("/api/admin/catalog/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: id })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Deletion failed.");
          
          toast.success(`Deleted ${name}`);
          fetchAllAdminData();
        } catch (err: any) {
          toast.error(err.message);
        } finally {
          setIsLoading(false);
          setConfirmDialog(null);
        }
      }
    });
  };

  const handleToggleLockNode = async (item: SubscriptionItem) => {
    setActiveDropdown(null);
    try {
      setIsLoading(true);
      const isCurrentlyDisabled = !!(item as any).disabled;
      const res = await fetch("/api/admin/catalog/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...item,
          disabled: !isCurrentlyDisabled
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(isCurrentlyDisabled ? `Unlocked ${item.name}` : `Locked ${item.name}`);
      fetchAllAdminData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };


  const handleCreateGiftCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGiftCode.trim()) {
      toast.error("Please enter a gift code name");
      return;
    }
    if (!newGiftCodeExpiryDateTime) {
      toast.error("Please select an expiry date and time");
      return;
    }
    try {
      setIsCreatingGiftCode(true);
      const calculatedExpiry = new Date(newGiftCodeExpiryDateTime).toISOString();

      const res = await fetch("/api/admin/gift_codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            code: newGiftCode.toUpperCase().trim(),
          amount: newGiftCodeAmount, 
          maxRedemptions: newGiftCodeMax, 
          expiryDate: calculatedExpiry 
        })
      });
      if (res.ok) {
        toast.success("Gift code created successfully");
        setNewGiftCode("");
        setIsCreateGiftModalOpen(false);
        fetchAllAdminData();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create gift code");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsCreatingGiftCode(false);
    }
  };

  const handleDeleteGiftCode = async (codeId: string) => {
    try {
      setIsDeletingGiftCode(true);
      const res = await fetch(`/api/admin/gift_codes/${codeId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" }
      });
      if (res.ok) {
        toast.success("Gift code deleted successfully");
        setSelectedGiftCode(null);
        setIsDeleteGiftConfirmOpen(false);
        fetchAllAdminData();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete gift code");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsDeletingGiftCode(false);
    }
  };

  const handleSiteImageFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: "logo" | "authbg" | "dashboardbg",
    field: "logoUrl" | "authBgImage" | "dashboardBgImage",
    label: string
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const allowed = kind === "logo"
      ? ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]
      : ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error(kind === "logo" ? "Only PNG, JPG, WebP or SVG images are allowed." : "Only PNG, JPG or WebP images are allowed.");
      return;
    }
    const maxBytes = kind === "logo" ? 2 * 1024 * 1024 : 4 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error(`Image must be smaller than ${maxBytes / (1024 * 1024)} MB.`);
      return;
    }
    setUploadingField(field);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read file."));
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, data }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Upload failed.");
      setSiteConfig({ ...siteConfig, [field]: body.url });
      toast.success(`${label} uploaded. Save configuration to apply it.`);
    } catch (err: any) {
      toast.error(err.message || "Upload failed.");
    } finally {
      setUploadingField(null);
    }
  };

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) =>
    handleSiteImageFile(e, "logo", "logoUrl", "Logo");

  const handleSaveSiteConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{9,10}$/.test(siteConfig.adminPhone)) {
      toast.error("Admin phone number must be 9 or 10 digits.");
      return;
    }
    const minimumDeposit = Number(siteConfig.minimumDeposit) > 0 ? Math.floor(Number(siteConfig.minimumDeposit)) : 20000;
    const maximumDeposit = Number(siteConfig.maximumDeposit) > 0 ? Math.floor(Number(siteConfig.maximumDeposit)) : 0;
    const minimumWithdrawal = Number(siteConfig.minimumWithdrawal) > 0 ? Math.floor(Number(siteConfig.minimumWithdrawal)) : 10000;
    const maximumWithdrawal = Number(siteConfig.maximumWithdrawal) > 0 ? Math.floor(Number(siteConfig.maximumWithdrawal)) : 0;
    if (maximumDeposit > 0 && maximumDeposit < minimumDeposit) {
      toast.error("Maximum deposit cannot be lower than minimum deposit.");
      return;
    }
    if (maximumWithdrawal > 0 && maximumWithdrawal < minimumWithdrawal) {
      toast.error("Maximum withdrawal cannot be lower than minimum withdrawal.");
      return;
    }
    try {
      setIsLoading(true);
      const sanitized = sanitizeSiteConfig({ ...siteConfig, updatedAt: Date.now() });
      const payload = sanitized as any;
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to save site configuration.");
      toast.success("Site configuration updated successfully");
      const saved = data.config || {
        ...payload,
        minimumDeposit,
        maximumDeposit,
        minimumWithdrawal,
        maximumWithdrawal
      };
      setSiteConfig(saved);
      updateLocalThemeConfig(saved);
      // Notify user tabs (same browser) to refetch siteConfig immediately — prevents 60s delay
      try { 
        localStorage.setItem("siteConfigUpdatedAt", String(Date.now())); 
        window.dispatchEvent(new Event("siteConfigUpdated"));
      } catch {}
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // User Actions
  const handleOverrideUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToOverride || !newOverridePassword.trim()) return;

    try {
      setIsLoading(true);
      const res = await fetch("/api/admin/users/override-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: userToOverride.phone,
          newPassword: newOverridePassword.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(`Password updated for ${userToOverride.phone}`);
      setUserToOverride(null);
      setNewOverridePassword("");
      fetchAllAdminData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleUserLock = async (u: any) => {
    setActiveDropdown(null);
    const newLockStatus = !u.locked;
    
    setConfirmDialog({
      title: newLockStatus ? "Lock Account" : "Unlock Account",
      message: `Are you sure you want to ${newLockStatus ? 'lock' : 'unlock'} account ${u.phone}?`,
      onConfirm: async () => {
        try {
          setIsLoading(true);
          const res = await fetch("/api/admin/users/lock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: u.phone, locked: newLockStatus })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);

          toast.success(data.message);
          fetchAllAdminData();
        } catch (err: any) {
          toast.error(err.message);
        } finally {
          setIsLoading(false);
          setConfirmDialog(null);
        }
      }
    });
  };

  // Trans Actions
  const handleUpdateTxStatus = async (transId: string, targetStatus: "SUCCESSFUL" | "FAILED") => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/admin/transactions/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transId, status: targetStatus })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(`Transaction marked as ${targetStatus}`);
      fetchAllAdminData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Pagination Logic
  const adminPh = siteConfig?.adminPhone || "admin";
  const filteredUsers = usersList.filter(u => 
    u.phone !== adminPh && (
      u.phone.toLowerCase().includes(userSearchText.toLowerCase()) ||
      (u.username && u.username.toLowerCase().includes(userSearchText.toLowerCase()))
    )
  );
  
  const paginatedUsers = filteredUsers.slice((usersPage - 1) * ITEMS_PER_PAGE, usersPage * ITEMS_PER_PAGE);
  const totalUsersPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);

  const filteredTransactions = transactionsList.filter(tx => {
    const canon = canonicalTypeOf(tx.type, tx.metadata) as string;
    const isWithdraw = canon === "withdrawal";
    const isAccountDeposit = canon === "deposit";
    const isRental = canon === "product_activation";

    // Keep account deposits, product-rental debits, and withdrawals together
    // in this ledger; yield and reward events belong elsewhere.
    if (!isWithdraw && !isAccountDeposit && !isRental) return false;

    // 1. Status filter (normalized)
    if (txFilterStatus !== "ALL") {
      const st = (tx.status || "").toUpperCase();
      const isPending = st === "PENDING" || st === "PROCESSING";
      const isSuccess = st === "SUCCESSFUL" || st === "COMPLETED" || st === "APPROVED";
      const isFailed = st === "FAILED" || st === "REJECTED";

      if (txFilterStatus === "PENDING" && !isPending) return false;
      if (txFilterStatus === "SUCCESSFUL" && !isSuccess) return false;
      if (txFilterStatus === "FAILED" && !isFailed) return false;
    }

    // 2. Type filter
    if (txFilterType !== "ALL") {
      if (txFilterType === "withdrawal" && !isWithdraw) return false;
      if (txFilterType === "deposit" && !isAccountDeposit) return false;
      if (txFilterType === "rental" && !isRental) return false;
    }

    // 3. Mode filter
    if (txFilterMode !== "ALL") {
      const actualMode = String(tx.mode || "automatic").toLowerCase() === "manual" ? "manual" : "automatic";
      const requestedMode = txFilterMode.toLowerCase() === "auto" ? "automatic" : txFilterMode.toLowerCase();
      if (requestedMode !== actualMode) return false;
    }

    // 4. Search text filter
    if (txSearchText.trim()) {
      const searchLower = txSearchText.toLowerCase();
      const txIdMatch = tx.id?.toLowerCase().includes(searchLower);
      const phoneMatch = (tx.phone || "").toLowerCase().includes(searchLower) || (tx.userId || "").toLowerCase().includes(searchLower);
      const user = usersList.find(u => u.phone === tx.userId);
      const usernameMatch = user?.username?.toLowerCase().includes(searchLower);
      
      if (!txIdMatch && !phoneMatch && !usernameMatch) {
        return false;
      }
    }

    return true;
  });
  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    const tA = new Date(a.timestamp || a.createdAt || a.date || 0).getTime();
    const tB = new Date(b.timestamp || b.createdAt || b.date || 0).getTime();
    return tB - tA; // Newest first
  });
  const paginatedTransactions = sortedTransactions.slice((txPage - 1) * ITEMS_PER_PAGE, txPage * ITEMS_PER_PAGE);
  const totalTxPages = Math.ceil(sortedTransactions.length / ITEMS_PER_PAGE);

  const filteredNodes = catalogItems.filter(node =>
    node.name.toLowerCase().includes(nodeSearchText.toLowerCase()) || 
    node.category.toLowerCase().includes(nodeSearchText.toLowerCase())
  );
  const paginatedNodes = filteredNodes.slice((nodesPage - 1) * ITEMS_PER_PAGE, nodesPage * ITEMS_PER_PAGE);
  const totalNodesPages = Math.ceil(filteredNodes.length / ITEMS_PER_PAGE);

  const renderPagination = (currentPage: number, totalPages: number, setPage: (p: number) => void) => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between border-t border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] px-5 py-3">
        <span className="text-xs text-[var(--theme-text)] opacity-70">Page {currentPage} of {totalPages}</span>
        <div className="flex gap-2">
          <button 
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
            className="p-1.5 rounded-[var(--theme-radius)] border border-[var(--theme-card-border)] text-[var(--theme-text)] hover:brightness-110 disabled:opacity-50 transition-colors bg-[var(--theme-card-bg)] cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button 
            disabled={currentPage === totalPages}
            onClick={() => setPage(currentPage + 1)}
            className="p-1.5 rounded-[var(--theme-radius)] border border-[var(--theme-card-border)] text-[var(--theme-text)] hover:brightness-110 disabled:opacity-50 transition-colors bg-[var(--theme-card-bg)] cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  if (isActivateRoute) {
    return (
      <div className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] font-[var(--theme-font-family)] flex flex-col items-center justify-center p-4 relative overflow-hidden transition-colors">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="w-full max-w-sm sm:max-w-md bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] p-8 shadow-2xl z-10 relative overflow-hidden backdrop-blur-md text-center space-y-6"
        >
          <div className="flex items-center justify-center">
            {seedStatus === "pending" && (
              <div className="w-12 h-12 border-4 border-[var(--theme-primary)] border-t-transparent rounded-full animate-spin" />
            )}
            {seedStatus === "success" && (
              <div className="w-12 h-12 bg-emerald-500/15 border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-500 animate-pulse">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            )}
            {seedStatus === "error" && (
              <div className="w-12 h-12 bg-rose-500/15 border border-rose-500/30 rounded-full flex items-center justify-center text-rose-500">
                <AlertCircle className="w-6 h-6" />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h1 className="text-xl font-display font-extrabold tracking-tight text-[var(--theme-text)]">
              {seedStatus === "pending" && "Activating Admin Account..."}
              {seedStatus === "success" && "Admin Account Activated"}
              {seedStatus === "error" && "Activation Locked"}
            </h1>
            
            <div className="space-y-1 py-2 bg-[var(--theme-bg)]/50 rounded-lg border border-[var(--theme-card-border)] p-3 text-left">
              <div className="flex justify-between items-center text-xs">
                <span className="opacity-60 font-medium">Username:</span>
                <span className="font-bold text-[var(--theme-text)]">{activatedAdminInfo.username || siteConfig?.adminUsername || "admin"}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="opacity-60 font-medium">Phone:</span>
                <span className="font-bold text-[var(--theme-text)]">{activatedAdminInfo.phone || siteConfig?.adminPhone || "075269320"}</span>
              </div>
            </div>

            {seedStatus === "pending" && (
              <div className="w-full bg-[var(--theme-bg)] rounded-full h-2 overflow-hidden border border-[var(--theme-card-border)] mt-4">
                <motion.div
                  className="bg-[var(--theme-primary)] h-full"
                  initial={{ width: "10%" }}
                  animate={{ width: "90%" }}
                  transition={{ duration: 2, repeat: Infinity, repeatType: "reverse" }}
                />
              </div>
            )}

            {seedStatus === "success" && (
              <div className="w-full bg-[var(--theme-bg)] rounded-full h-2 overflow-hidden border border-[var(--theme-card-border)] mt-4">
                <div className="bg-emerald-500 h-full w-full" />
              </div>
            )}

            <p className="text-xs text-[var(--theme-text)] opacity-70 leading-relaxed">
              {seedStatus === "pending" && seedMessage}
              {seedStatus === "success" && "Your admin account is ready. Click below to sign in."}
              {seedStatus === "error" && seedError}
            </p>
          </div>

          {(seedStatus === "success" || seedStatus === "error") && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-2">
              <button
                onClick={() => {
                  window.location.href = window.location.pathname.includes("/activate") ? "/admin/access" : "#/admin/access";
                }}
                className="w-full py-3 btn-3d-primary text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                Sign In to Admin Console
              </button>
            </motion.div>
          )}
        </motion.div>
      </div>
    );
  }

  if (!isAdminLoggedIn) {
    const authBg = fixGitHubImageUrl(siteConfig?.authBgImage);
    return (
      <div 
        className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] font-[var(--theme-font-family)] flex flex-col items-center justify-center p-4 relative overflow-hidden transition-colors"
        style={{
          backgroundImage: authBg ? `linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.7)), url('${authBg}')` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="w-full max-w-sm sm:max-w-md bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-[24px] p-8 shadow-2xl z-10 relative overflow-hidden"
        >
          <div className="text-center space-y-3 mb-6">
            <BrandLogo siteConfig={siteConfig} className="w-14 h-14 mx-auto block bg-transparent shadow-none" />
            <div>
              <h2 className="font-display font-bold text-2xl tracking-tight text-[var(--theme-text)]">
                {(siteConfig?.brandName || " ") + " Admin"}
              </h2>
              <p className="text-xs font-sans font-normal text-[var(--theme-text)] opacity-50 mt-1">
                Administrative access only
              </p>
            </div>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-sans font-semibold uppercase tracking-wide text-[var(--theme-text)] opacity-60">Username / Phone</label>
              <input
                type="text"
                required
                autoComplete="username"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2.5 input-frosted bg-[var(--theme-bg)]/60 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] rounded-[14px] text-[var(--theme-text)] text-sm font-sans font-medium outline-none transition-colors select-text"
                placeholder="Enter identifier"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-sans font-semibold uppercase tracking-wide text-[var(--theme-text)] opacity-60">Password</label>
              <div className="relative">
                <input
                  type={showLoginPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 input-frosted bg-[var(--theme-bg)]/60 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] rounded-[14px] text-[var(--theme-text)] text-sm font-sans font-medium outline-none transition-colors pr-10 select-text"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--theme-text)] opacity-40 hover:opacity-100 transition-opacity"
                >
                  {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 mt-2 btn-3d-primary text-white text-sm font-sans font-bold tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Signing In...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  const NavContent = () => (
    <>
      {[
        { id: "home", label: "Home", icon: Home },
        { id: "nodes", label: "Products", icon: Package },
        { id: "users", label: "User Management", icon: Users },
        { id: "transactions", label: "Transactions", icon: Activity },
        { id: "announcements", label: "Announcements", icon: Bell },
        { id: "chat", label: "Support Desk", icon: MessageSquare },
        { id: "config", label: "Site Config", icon: Settings }
      ].map((tab) => {
        const IconComp = tab.icon;
        const isActive = activeAdminTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => { setActiveAdminTab(tab.id as any); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-2 px-2.5 py-2 pl-3 rounded-[var(--theme-radius)] text-xs font-bold transition-all outline-none cursor-pointer ${
              isActive 
                ? "btn-3d-primary text-white shadow-md" 
                : "text-[var(--theme-text)] opacity-80 hover:opacity-100 hover:bg-[var(--theme-primary)]/10"
            }`}
          >
            <IconComp className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-[var(--theme-primary)]"}`} />
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}

      <div className="flex-1" />

      <div className="pt-2 space-y-1">
        <button
          onClick={() => { setActiveAdminTab("profile"); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center justify-between px-2.5 py-2 pl-3 rounded-[var(--theme-radius)] text-xs font-bold transition-all outline-none cursor-pointer ${
            activeAdminTab === "profile" 
              ? "btn-3d-primary text-white shadow-md" 
              : "text-[var(--theme-text)] opacity-80 hover:opacity-100 hover:bg-[var(--theme-primary)]/10"
          }`}
        >
          <div className="flex items-center gap-2">
            <User className={`w-4 h-4 shrink-0 ${activeAdminTab === "profile" ? "text-white" : "text-[var(--theme-primary)]"}`} />
            <span>Profile</span>
          </div>
          <ChevronRight className={`w-3.5 h-3.5 ${activeAdminTab === "profile" ? "text-white" : "text-[var(--theme-primary)] opacity-50"}`} />
        </button>
        <button
          onClick={handleAdminLogout}
          className="w-full flex items-center gap-2 px-2.5 py-2 pl-3 rounded-[var(--theme-radius)] text-xs font-medium text-rose-500 hover:bg-rose-500/10 transition-colors outline-none cursor-pointer"
        >
          <LogOut className="w-4 h-4 shrink-0 text-rose-500" />
          <span>Sign Out</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="h-screen w-full bg-[var(--theme-bg)] text-[var(--theme-text)] font-[var(--theme-font-family)] flex z-10 overflow-hidden relative transition-colors">
      
      {/* Desktop Sidebar Navigation - Uses same background as canvas so main outlet acts as floating card */}
      <aside className="w-60 bg-[var(--theme-bg)] z-20 hidden md:flex flex-col shrink-0 transition-colors">
        <div className="h-14 flex items-center justify-start gap-2 pl-3.5 pr-4 shrink-0">
          <div className="w-7 h-7 rounded shrink-0 flex items-center justify-center">
            <BrandLogo siteConfig={siteConfig} className="w-7 h-7 mx-auto block" />
          </div>
          <span className="font-display font-bold text-xs text-[var(--theme-text)] tracking-tight truncate">{siteConfig?.brandName || ""} Admin</span>
        </div>
        <nav className="flex-1 flex flex-col px-2.5 py-4 space-y-1 overflow-y-auto w-full">
          <NavContent />
        </nav>
      </aside>

      {/* Main Content Area / Floating Card Outlet */}
      <main className="flex-1 flex flex-col overflow-hidden z-20 relative bg-[var(--theme-card-bg)] rounded-[var(--theme-radius)] border border-[var(--theme-card-border)] m-2.5 md:m-3.5 md:ml-1 shadow-lg transition-colors">
        
        {/* Mobile Header / Top Nav */}
        <header className="h-16 flex items-center justify-between px-6 bg-transparent shrink-0">
          <div className="flex items-center gap-3">
            <button 
              className="md:hidden p-1.5 text-[var(--theme-text)] opacity-80 hover:opacity-100"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <LayoutDashboard className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-extrabold text-[var(--theme-text)] capitalize hidden sm:block tracking-tight">
              {activeAdminTab === "home" && "Summary"}
              {activeAdminTab === "nodes" && "Products"}
              {activeAdminTab === "users" && "User Management"}
              {activeAdminTab === "transactions" && "Global Ledger"}
              {activeAdminTab === "announcements" && "Announcements"}
              {activeAdminTab === "chat" && "Support Chat Desk"}
              {activeAdminTab === "config" && "Global Site Configuration"}
              {activeAdminTab === "profile" && "Admin Profile"}
            </h1>
            <h1 className="text-md font-extrabold text-[var(--theme-text)] capitalize sm:hidden truncate">
              {activeAdminTab === "profile" ? "Profile" : activeAdminTab === "config" ? "Site Config" : "Admin"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchAllAdminData}
              className="px-3.5 py-1.5 btn-3d-secondary text-xs md:text-sm font-bold flex items-center gap-2 outline-none cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </header>

        {/* Mobile slide-over navigation menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <div className="fixed inset-0 z-50 flex md:hidden">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                onClick={() => setIsMobileMenuOpen(false)}
              />
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                className="relative w-64 bg-slate-950 h-full shadow-2xl flex flex-col"
              >
                <div className="h-16 flex items-center justify-between px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 flex items-center justify-center"><BrandLogo siteConfig={siteConfig} className="w-6 h-6 mx-auto block" /></div>
                    <span className="font-display font-medium text-slate-100 text-sm tracking-tight">{siteConfig?.brandName || ""} Admin</span>
                  </div>
                  <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 text-slate-400">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <nav className="flex-1 flex flex-col px-4 py-6 space-y-2 overflow-y-auto">
                  <NavContent />
                </nav>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <div className={`flex-1 ${activeAdminTab === "chat" ? "overflow-hidden flex flex-col p-4" : "overflow-y-auto p-6 md:p-8 lg:p-10 pb-28"}`}>
          <div className={activeAdminTab === "chat" ? "flex-1 w-full overflow-hidden flex flex-col" : "max-w-6xl mx-auto space-y-6"}>

            {/* TAB: HOME */}
            {activeAdminTab === "home" && (() => {
              const totalWithdrawFees = transactionsList
                .filter(tx => canonicalTypeOf(tx.type, tx.metadata) === "withdrawal" && isSettledTransaction(tx))
                .reduce((sum, tx) => sum + ((tx.feeAmount || tx.metadata?.feeAmount) || 0), 0);

              return (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Grid of 4 metric cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {/* Card 1: Total Deposits */}
                    <div className="p-6 theme-card transition-all flex flex-col justify-between relative overflow-hidden group">
                      <div className="absolute right-6 top-6 text-[var(--theme-primary)]">
                        <Coins className="w-5 h-5" />
                      </div>
                      <div className="space-y-4">
                        <span className="text-[11px] font-sans text-[var(--theme-text)] opacity-70 uppercase font-semibold tracking-wider block">Total Deposits</span>
                        <div>
                          <h4 className="text-2xl font-sans font-extrabold text-[var(--theme-text)] tracking-tight">
                            {formatCurrency(transactionsList.filter(tx => canonicalTypeOf(tx.type, tx.metadata) === "deposit" && isSettledTransaction(tx)).reduce((sum, tx) => sum + (tx.amount || 0), 0))}
                          </h4>
                          <p className="text-[12px] font-sans text-[var(--theme-text)] opacity-60 mt-1">
                            {transactionsList.filter(tx => canonicalTypeOf(tx.type, tx.metadata) === "deposit" && isSettledTransaction(tx)).length} successful account deposits
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Total Cashout */}
                    <div className="p-6 theme-card transition-all flex flex-col justify-between relative overflow-hidden group">
                      <div className="absolute right-6 top-6 text-[var(--theme-primary)]">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div className="space-y-4">
                        <span className="text-[11px] font-sans text-[var(--theme-text)] opacity-70 uppercase font-semibold tracking-wider block">Total Cashout</span>
                        <div>
                          <h4 className="text-2xl font-sans font-extrabold text-[var(--theme-text)] tracking-tight">
                            {formatCurrency(transactionsList.filter(tx => canonicalTypeOf(tx.type, tx.metadata) === "withdrawal" && isSettledTransaction(tx)).reduce((sum, tx) => sum + (tx.amount || 0), 0))}
                          </h4>
                          <p className="text-[12px] font-sans text-[var(--theme-text)] opacity-60 mt-1">
                            {transactionsList.filter(tx => canonicalTypeOf(tx.type, tx.metadata) === "withdrawal" && isSettledTransaction(tx)).length} paid requests
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Card 3: Total Users */}
                    <div className="p-6 theme-card transition-all flex flex-col justify-between relative overflow-hidden group">
                      <div className="absolute right-6 top-6 text-[var(--theme-primary)]">
                        <Users className="w-5 h-5" />
                      </div>
                      <div className="space-y-4">
                        <span className="text-[11px] font-sans text-[var(--theme-text)] opacity-70 uppercase font-semibold tracking-wider block">Users</span>
                        <div>
                          <h4 className="text-2xl font-sans font-extrabold text-[var(--theme-text)] tracking-tight">
                            {usersList.length.toLocaleString()}
                          </h4>
                        </div>
                      </div>
                    </div>

                    {/* Card 4: Withdraw Revenue */}
                    <div className="p-6 theme-card transition-all flex flex-col justify-between relative overflow-hidden group">
                      <div className="absolute right-6 top-6">
                        <span className="px-2 py-0.5 bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] text-[12px] font-sans rounded border border-[var(--theme-primary)]/20 inline-block align-middle font-bold">
                          Fee: {siteConfig?.withdrawFee || 0}%
                        </span>
                      </div>
                      <div className="space-y-4">
                        <span className="text-[11px] font-sans text-[var(--theme-text)] opacity-70 uppercase font-semibold tracking-wider block">Withdraw Revenue</span>
                        <div>
                          <h4 className="text-2xl font-sans font-extrabold text-[var(--theme-text)] tracking-tight">
                            {formatCurrency(totalWithdrawFees)}
                          </h4>
                          <p className="text-[12px] font-sans text-[var(--theme-text)] opacity-60 mt-1">
                            Total collected withdrawal transaction fees
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-8">
                    <AdminChart transactionsList={transactionsList} />
                  </div>
                </div>
              );
            })()}
            
            {/* TAB: NODES / PRODUCTS */}
            {activeAdminTab === "nodes" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 py-2">
                  {/* Left: Search Bar */}
                  <div className="relative w-full sm:w-72 shrink-0">
                    <Search className="w-4 h-4 text-[var(--theme-text)] opacity-50 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search products..."
                      value={nodeSearchText}
                      onChange={(e) => {
                        setNodeSearchText(e.target.value);
                        setNodesPage(1);
                      }}
                      className="w-full pl-9 pr-4 py-2 bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-primary)] transition-colors"
                    />
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-3 justify-end w-full sm:w-auto shrink-0">
                    <button
                      onClick={handleOpenCreateNode}
                      className="px-4 py-2 theme-btn-primary text-sm flex items-center gap-2 shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Product</span>
                    </button>

                    {/* Ellipsis More Menu */}
                    <div className="relative shrink-0">
                      <button
                        onClick={() => setIsNodesMoreMenuOpen(!isNodesMoreMenuOpen)}
                        className="px-3.5 py-2 theme-btn-secondary text-sm flex items-center gap-2 shrink-0"
                      >
                        <MoreVertical className="w-4 h-4 text-[var(--theme-text)] opacity-80" />
                        <span>More</span>
                      </button>

                      {isNodesMoreMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsNodesMoreMenuOpen(false)} />
                          <div className="absolute right-0 top-11 w-52 bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)] rounded-[var(--theme-radius)] shadow-2xl z-50 py-1.5 flex flex-col text-xs font-sans overflow-hidden animate-in fade-in zoom-in-95">
                            <button
                              onClick={() => {
                                setIsNodesMoreMenuOpen(false);
                                setIsCategoryModalOpen(true);
                              }}
                              className="px-4 py-2.5 text-left hover:bg-[var(--theme-bg)] text-[var(--theme-text)] flex items-center gap-2.5 cursor-pointer font-medium"
                            >
                              <Tags className="w-4 h-4 text-[var(--theme-primary)]" />
                              <span>Categories</span>
                            </button>
                            <button
                              onClick={() => {
                                setIsNodesMoreMenuOpen(false);
                                setIsBulkUploadOpen(true);
                              }}
                              className="px-4 py-2.5 text-left hover:bg-[var(--theme-bg)] text-[var(--theme-text)] flex items-center gap-2.5 cursor-pointer font-medium"
                            >
                              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                              <span>Bulk Upload</span>
                            </button>
                            <div className="h-px bg-[var(--theme-card-border)] my-1 mx-2" />
                            <button
                              onClick={() => {
                                setIsNodesMoreMenuOpen(false);
                                setIsConfirmDeleteAllModalOpen(true);
                              }}
                              className="px-4 py-2.5 text-left hover:bg-[var(--theme-bg)] text-rose-400 flex items-center gap-2.5 cursor-pointer font-medium"
                            >
                              <Trash2 className="w-4 h-4 text-rose-400" />
                              <span>Delete All Products</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-[var(--theme-text)] opacity-65">
                  Users can rent the same product more than once. The count below shows active rentals, and edits apply to new rentals while existing rentals keep their original terms.
                </p>

                <div className="theme-card overflow-hidden flex flex-col text-[var(--theme-text)] transition-all">
                  <div className="overflow-x-auto min-h-[400px]">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead>
                        <tr className="bg-[var(--theme-bg)] border-b border-[var(--theme-card-border)]">
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70">Product</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70">Category</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70 text-right">Cost</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70 text-right">Profits/Day</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70 text-center">Duration</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70 text-center">Active rentals</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70 text-center">Status</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--theme-card-border)]/30">
                        {paginatedNodes.map((item) => {
                          const isLocked = !!(item as any).disabled;
                          const activeSubs = (item as any).activeSubscribers || 0;
                          return (
                            <tr key={item.id} className="hover:bg-[var(--theme-bg)]/50 transition-colors border-b border-[var(--theme-card-border)]/30">
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-3">
                                  {item.imageUrl ? (
                                    <img src={item.imageUrl} alt="" className="w-8 h-8 rounded border border-[var(--theme-card-border)] object-cover bg-[var(--theme-card-bg)]" />
                                  ) : (
                                    <div className="w-8 h-8 rounded bg-[var(--theme-bg)] flex items-center justify-center text-[var(--theme-text)] opacity-50">
                                      <Cpu className="w-4 h-4" />
                                    </div>
                                  )}
                                  <div>
                                    <div className="font-bold text-[var(--theme-text)]">{item.name}</div>
                                    <div className="text-[12px] text-[var(--theme-text)] opacity-50 font-mono mt-0.5">{item.id}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-4">
                                <span className="text-xs font-bold text-[var(--theme-text)] bg-[var(--theme-bg)] px-2 py-1 rounded border border-[var(--theme-card-border)] uppercase">
                                  {item.category}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-right text-[var(--theme-text)] font-bold">
                                {formatCurrency(item.amount)}
                              </td>
                              <td className="px-5 py-4 text-right text-[var(--theme-text)] opacity-80 font-bold">
                                +{formatCurrency(item.dailyYield)}
                              </td>
                              <td className="px-5 py-4 text-center text-[var(--theme-text)] opacity-70 font-bold">
                                {item.duration}d
                              </td>
                              <td className="px-5 py-4 text-center">
                                <span className="text-[var(--theme-primary)] font-bold">{activeSubs}</span>
                              </td>
                              <td className="px-5 py-4 text-center">
                                {item.outOfStock ? (
                                  <span className="px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-rose-500/15 text-rose-400 border border-rose-500/30 uppercase inline-block">Out of Stock</span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase inline-block">In Stock</span>
                                )}
                              </td>
                              <td className="px-5 py-4 text-right relative">
                                <button 
                                  onClick={() => setActiveDropdown(activeDropdown === item.id ? null : item.id)}
                                  className="p-1.5 text-[var(--theme-text)] opacity-70 hover:opacity-100 hover:bg-[var(--theme-bg)] rounded-lg outline-none transition-colors cursor-pointer"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                                
                                {activeDropdown === item.id && (
                                  <>
                                    <div className="fixed inset-0 z-40" onClick={() => setActiveDropdown(null)}></div>
                                    <div className="absolute right-8 top-8 w-48 bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)] rounded-[var(--theme-radius)] shadow-xl z-50 py-1 flex flex-col text-sm overflow-hidden animate-in fade-in zoom-in-95">
                                      <button onClick={() => handleOpenEditNode(item)} className="px-4 py-2.5 text-left hover:bg-[var(--theme-bg)] text-[var(--theme-text)] flex items-center gap-2 cursor-pointer font-bold transition-all">
                                        <Edit className="w-4 h-4 text-[var(--theme-primary)]" /> <span>Edit Product</span>
                                      </button>
                                      <button
                                        onClick={() => { setActiveDropdown(null); handleToggleOutOfStock(item); }}
                                        disabled={togglingStockId === item.id}
                                        className="px-4 py-2.5 text-left hover:bg-[var(--theme-bg)] text-[var(--theme-text)] flex items-center gap-2 cursor-pointer disabled:opacity-50 font-bold transition-all"
                                      >
                                        {togglingStockId === item.id ? (
                                          <Loader2 className="w-4 h-4 text-[var(--theme-primary)] animate-spin" />
                                        ) : (
                                          <PackageX className="w-4 h-4 text-[var(--theme-accent)]" />
                                        )}
                                        <span>{item.outOfStock ? "Mark In Stock" : "Mark Out of Stock"}</span>
                                      </button>
                                      <div className="h-px bg-[var(--theme-card-border)] my-1 mx-2"></div>
                                      <button
                                        onClick={() => handleDeleteNode(item.id, item.name)}
                                        disabled={deletingNodeId === item.id}
                                        className="px-4 py-2.5 text-left hover:bg-[var(--theme-bg)] text-rose-500 flex items-center gap-2 cursor-pointer disabled:opacity-50 font-bold transition-all"
                                      >
                                        {deletingNodeId === item.id ? (
                                          <Loader2 className="w-4 h-4 text-rose-500 animate-spin" />
                                        ) : (
                                          <Trash2 className="w-4 h-4 text-rose-500" />
                                        )}
                                        <span>Delete</span>
                                      </button>
                                    </div>
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {renderPagination(nodesPage, totalNodesPages, setNodesPage)}
                </div>
              </div>
            )}

            {/* TAB: USERS */}
            {activeAdminTab === "users" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 py-2">
                  <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 text-[var(--theme-text)] opacity-50 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search phone or username..."
                      value={userSearchText}
                      onChange={(e) => {
                        setUserSearchText(e.target.value);
                        setUsersPage(1); // reset to page 1 on search
                      }}
                      className="w-full pl-9 pr-4 py-2 bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-primary)] transition-colors"
                    />
                  </div>
                </div>

                <div className="theme-card overflow-hidden flex flex-col text-[var(--theme-text)] transition-all shadow-lg">
                  <div className="overflow-x-auto min-h-[400px]">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead>
                        <tr className="bg-[var(--theme-bg)] border-b border-[var(--theme-card-border)]">
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70">User / Phone</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70 text-center">Joined At</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70 text-center">Invites</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70 text-center">Products</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70 text-right">Balance</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70 text-right">Deposits</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70 text-right">Withdraws</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70 text-center">Status</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--theme-card-border)]/30">
                        {paginatedUsers.map((u) => {
                          const nodesCount = (u as any).activeNodesCount || 0;
                          const isLocked = !!(u as any).locked;
                          const successWithdrawals = transactionsList
                            .filter(tx => tx.userId === u.phone && canonicalTypeOf(tx.type, tx.metadata) === "withdrawal" && isSettledTransaction(tx))
                            .reduce((sum, tx) => sum + (tx.amount || 0), 0);
                          return (
                            <tr key={u.phone} className={`hover:bg-[var(--theme-bg)]/50 transition-colors border-b border-[var(--theme-card-border)]/30 ${isLocked ? 'opacity-60' : ''}`}>
                              <td className="px-5 py-4">
                                <div className="font-bold text-[var(--theme-text)]">{u.username || "Unknown"}</div>
                                <div className="text-xs text-[var(--theme-text)] opacity-60 mt-0.5">{u.phone}</div>
                              </td>
                              <td className="px-5 py-4 text-center text-xs text-[var(--theme-text)] opacity-70 font-medium">
                                {u.createdAt ? new Date(u.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : "—"}
                              </td>
                              <td className="px-5 py-4 text-center">
                                <span className="font-bold text-[var(--theme-text)]">{u.invitesCount || 0}</span>
                              </td>
                              <td className="px-5 py-4 text-center">
                                <span className="font-bold text-[var(--theme-primary)]">{nodesCount}</span>
                              </td>
                              <td className="px-5 py-4 text-right">
                                <div className="font-bold text-[var(--theme-text)]">{formatCurrency(u.points || 0)}</div>
                              </td>
                              <td className="px-5 py-4 text-right">
                                <div className="font-bold text-[var(--theme-text)]">{formatCurrency(u.totalDeposits || 0)}</div>
                              </td>
                              <td className="px-5 py-4 text-right">
                                <div className="font-bold text-[var(--theme-text)]">{formatCurrency(successWithdrawals)}</div>
                              </td>
                              <td className="px-5 py-4 text-center">
                                {isLocked ? (
                                  <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 text-[12px] rounded border border-rose-500/20 uppercase font-extrabold">Locked</span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[12px] rounded border border-emerald-500/20 uppercase font-extrabold">Active</span>
                                )}
                              </td>
                              <td className="px-5 py-4 text-right relative">
                                <button 
                                  onClick={() => setActiveDropdown(activeDropdown === u.phone ? null : u.phone)}
                                  className="p-1.5 text-[var(--theme-text)] opacity-70 hover:opacity-100 hover:bg-[var(--theme-bg)] rounded-lg outline-none transition-colors cursor-pointer"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                                
                                {activeDropdown === u.phone && (
                                  <>
                                    <div className="fixed inset-0 z-40" onClick={() => setActiveDropdown(null)}></div>
                                    <div className="absolute right-8 top-8 w-48 bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)] rounded-[var(--theme-radius)] shadow-xl z-50 py-1 flex flex-col text-sm overflow-hidden animate-in fade-in zoom-in-95">
                                      <button 
                                        onClick={() => {
                                          setUserToOverride(u);
                                          setNewOverridePassword("");
                                          setActiveDropdown(null);
                                        }} 
                                        className="px-4 py-2.5 text-left hover:bg-[var(--theme-bg)] text-[var(--theme-text)] flex items-center gap-2 font-medium cursor-pointer"
                                      >
                                        <Key className="w-4 h-4 text-amber-400" /> Reset Password
                                      </button>
                                      <div className="h-px bg-[var(--theme-card-border)] my-1 mx-2"></div>
                                      <button 
                                        onClick={() => handleToggleUserLock(u)} 
                                        className="px-4 py-2.5 text-left hover:bg-[var(--theme-bg)] text-[var(--theme-text)] flex items-center gap-2 font-medium cursor-pointer"
                                      >
                                        {isLocked ? <Unlock className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4 text-rose-400" />}
                                        {isLocked ? "Unlock Account" : "Lock Account"}
                                      </button>
                                    </div>
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {paginatedUsers.length === 0 && (
                          <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-500">No users found.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {renderPagination(usersPage, totalUsersPages, setUsersPage)}
                </div>
              </div>
            )}

            {/* TAB: TRANSACTIONS */}
            {activeAdminTab === "transactions" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 py-2">
                  {/* Search Input */}
                  <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 text-[var(--theme-text)] opacity-50 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search ref or user..."
                      value={txSearchText}
                      onChange={(e) => {
                        setTxSearchText(e.target.value);
                        setTxPage(1);
                      }}
                      className="w-full pl-9 pr-4 py-2 bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-primary)] transition-colors"
                    />
                  </div>

                  {/* Filter group with Filter Icon */}
                  <div className="flex items-center gap-2 bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] p-2 px-3 shadow-sm shrink-0">
                    <Filter className="w-3.5 h-3.5 text-[var(--theme-text)] opacity-60 shrink-0" />
                    <div className="flex items-center gap-2 text-xs">
                      {/* Status Select */}
                      <select
                        value={txFilterStatus}
                        onChange={(e) => {
                          setTxFilterStatus(e.target.value);
                          setTxPage(1);
                        }}
                        className="bg-transparent text-[var(--theme-text)] outline-none cursor-pointer font-bold"
                      >
                        <option value="ALL" className="bg-[var(--theme-card-bg)] text-[var(--theme-text)]">All Status</option>
                        <option value="PENDING" className="bg-[var(--theme-card-bg)] text-[var(--theme-text)]">Pending</option>
                        <option value="SUCCESSFUL" className="bg-[var(--theme-card-bg)] text-[var(--theme-text)]">Successful</option>
                        <option value="FAILED" className="bg-[var(--theme-card-bg)] text-[var(--theme-text)]">Failed</option>
                      </select>
                      <span className="text-[var(--theme-card-border)] font-mono">|</span>
                      {/* Type Select */}
                      <select
                        value={txFilterType}
                        onChange={(e) => {
                          setTxFilterType(e.target.value);
                          setTxPage(1);
                        }}
                        className="bg-transparent text-[var(--theme-text)] outline-none cursor-pointer font-bold"
                      >
                        <option value="ALL" className="bg-[var(--theme-card-bg)] text-[var(--theme-text)]">All Types</option>
                        <option value="deposit" className="bg-[var(--theme-card-bg)] text-[var(--theme-text)]">Deposit (Account Credit)</option>
                        <option value="rental" className="bg-[var(--theme-card-bg)] text-[var(--theme-text)]">Product Rental</option>
                        <option value="withdrawal" className="bg-[var(--theme-card-bg)] text-[var(--theme-text)]">Withdrawal</option>
                      </select>
                      <span className="text-[var(--theme-card-border)] font-mono">|</span>
                      {/* Mode Select */}
                      <select
                        value={txFilterMode}
                        onChange={(e) => {
                          setTxFilterMode(e.target.value);
                          setTxPage(1);
                        }}
                        className="bg-transparent text-[var(--theme-text)] outline-none cursor-pointer font-bold"
                      >
                        <option value="ALL" className="bg-[var(--theme-card-bg)] text-[var(--theme-text)]">All Modes</option>
                        <option value="automatic" className="bg-[var(--theme-card-bg)] text-[var(--theme-text)]">Automated</option>
                        <option value="manual" className="bg-[var(--theme-card-bg)] text-[var(--theme-text)]">Manual</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="theme-card overflow-hidden flex flex-col text-[var(--theme-text)] transition-all shadow-lg">
                  <div className="overflow-x-auto min-h-[400px]">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead>
                        <tr className="bg-[var(--theme-bg)] border-b border-[var(--theme-card-border)]">
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70">Ref ID / Time</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70">User</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70">Type</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70 text-center">Mode</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70 text-right">Amount</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70 text-center">Status</th>
                          <th className="px-5 py-4 font-bold text-[var(--theme-text)] opacity-70 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--theme-card-border)]/30">
                        {paginatedTransactions.map((tx) => {
                          const canon = canonicalTypeOf(tx.type, tx.metadata) as string;
                          const isWithdraw = canon === "withdrawal";
                          const isGpu = canon === "product_activation";
                          const isManual = String(tx.mode || "").toLowerCase() === "manual";
                          const isAutomaticWithdrawal = isWithdraw && !isManual;
                          const txMetadata = tx.metadata && typeof tx.metadata === "object" ? tx.metadata : {};
                          const requestedAmount = Number(txMetadata.requestedAmount ?? tx.amount ?? 0);
                          const payoutAmount = Number(txMetadata.payoutAmount ?? requestedAmount);
                          const feeAmount = Number(txMetadata.feeAmount ?? Math.max(0, requestedAmount - payoutAmount));
                          return (
                            <tr key={tx.id} className="hover:bg-[var(--theme-bg)]/50 transition-colors border-b border-[var(--theme-card-border)]/30">
                              <td className="px-5 py-4">
                                <div className="font-mono text-[var(--theme-text)] font-bold">{tx.id}</div>
                                <div className="text-[12px] text-[var(--theme-text)] opacity-60 mt-0.5">
                                  {(() => {
                                    const rawDate = tx.timestamp || tx.createdAt || tx.date;
                                    if (!rawDate) return "N/A";
                                    try {
                                      const d = new Date(rawDate);
                                      return isNaN(d.getTime()) ? String(rawDate) : d.toLocaleString();
                                    } catch {
                                      return String(rawDate);
                                    }
                                  })()}
                                </div>
                                {txMetadata.externalReference && (
                                  <div className="text-[11px] text-[var(--theme-text)] opacity-55 mt-1 font-mono truncate max-w-[210px]" title={String(txMetadata.externalReference)}>
                                    External: {String(txMetadata.externalReference)}
                                  </div>
                                )}
                              </td>
                              <td className="px-5 py-4">
                                <div className="font-bold text-[var(--theme-text)]">
                                  {usersList.find((u) => u.phone === tx.userId)?.username || tx.userId}
                                </div>
                                <div className="text-xs text-[var(--theme-text)] opacity-60 flex items-center gap-1.5 mt-0.5">
                                  <span className="truncate max-w-[150px]" title={tx.withdrawPhone || tx.senderPhone || tx.phone || tx.userId}>
                                    {tx.withdrawPhone || tx.senderPhone || tx.phone || tx.userId}
                                  </span>
                                  {(tx.operator === "USDT" || tx.senderPhone === "USDT_TRANSFER") && (
                                    <button
                                      title="Copy USDT Address"
                                      onClick={() => {
                                        const addr = tx.withdrawPhone || tx.senderPhone || tx.phone;
                                        if (addr) {
                                          navigator.clipboard.writeText(addr);
                                          toast.success("Copied address: " + addr);
                                        }
                                      }}
                                      className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                                {tx.referenceId && (
                                  <div className="text-[12px] text-teal-500 font-mono mt-1 break-all">
                                    Ref/TxID: {tx.referenceId}
                                  </div>
                                )}
                              </td>
                              <td className="px-5 py-4">
                                <span className={`px-2.5 py-1 rounded-md text-[12px] font-medium uppercase ${
                                  isWithdraw ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : isGpu ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                }`}>
                                  {isWithdraw ? "Withdrawal Payout" : isGpu ? "Product Rental (Recharge Balance)" : "Deposit: Account Credit"}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-center">
                                <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold tracking-tight border ${
                                  isManual ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                }`}>
                                  {isManual ? "MANUAL" : "AUTOMATIC"}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-right">
                                <span className="font-extrabold text-[var(--theme-text)]">{formatCurrency(requestedAmount)}</span>
                                {isWithdraw && payoutAmount !== requestedAmount && (
                                  <div className="text-[12px] text-[var(--theme-text)] font-medium opacity-60 mt-0.5">
                                    Fee {formatCurrency(feeAmount)}
                                  </div>
                                )}
                              </td>
                              <td className="px-5 py-4 text-center">
                                {(() => {
                                  const st = (tx.status || "").toUpperCase();
                                  if (st === "SUCCESSFUL" || st === "COMPLETED" || st === "APPROVED") {
                                    return <span className="px-2.5 py-1 rounded-md text-[12px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">Successful</span>;
                                  }
                                  if (st === "FAILED" || st === "REJECTED") {
                                    return <span className="px-2.5 py-1 rounded-md text-[12px] font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20">Failed</span>;
                                  }
                                  return <span className="px-2.5 py-1 rounded-md text-[12px] font-medium text-amber-400 bg-amber-400/10 border border-amber-500/20 animate-pulse">Pending</span>;
                                })()}
                              </td>
                              <td className="px-5 py-4 text-right relative">
                                {(() => {
                                  const st = (tx.status || "").toUpperCase();
                                  const isPending = st === "PENDING" || st === "PROCESSING";
                                  if (isPending && isAutomaticWithdrawal) {
                                    return <span className="text-xs text-blue-400 font-mono">Webhook</span>;
                                  }
                                  if (isPending) {
                                    return (
                                      <>
                                        <button 
                                          onClick={() => setActiveDropdown(activeDropdown === tx.id ? null : tx.id)}
                                          className="p-1.5 text-[var(--theme-text)] opacity-70 hover:opacity-100 hover:bg-[var(--theme-bg)] rounded-lg outline-none transition-colors cursor-pointer"
                                        >
                                          <MoreVertical className="w-4 h-4" />
                                        </button>
                                        {activeDropdown === tx.id && (
                                          <>
                                            <div className="fixed inset-0 z-40" onClick={() => setActiveDropdown(null)}></div>
                                            <div className="absolute right-8 top-8 w-36 bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)] rounded-[var(--theme-radius)] shadow-xl z-50 py-1 flex flex-col text-sm overflow-hidden animate-in fade-in zoom-in-95">
                                              <button 
                                                onClick={() => { handleUpdateTxStatus(tx.id, "SUCCESSFUL"); setActiveDropdown(null); }} 
                                                className="px-4 py-2.5 text-left hover:bg-[var(--theme-bg)] text-emerald-400 flex items-center gap-2 cursor-pointer font-medium"
                                              >
                                                <CheckCircle2 className="w-4 h-4" /> Approve
                                              </button>
                                              <div className="h-px bg-[var(--theme-card-border)] my-1 mx-2"></div>
                                              <button 
                                                onClick={() => { handleUpdateTxStatus(tx.id, "FAILED"); setActiveDropdown(null); }} 
                                                className="px-4 py-2.5 text-left hover:bg-[var(--theme-bg)] text-rose-400 flex items-center gap-2 cursor-pointer font-medium"
                                              >
                                                <X className="w-4 h-4" /> Reject
                                              </button>
                                            </div>
                                          </>
                                        )}
                                      </>
                                    );
                                  }
                                  return <span className="text-xs text-[var(--theme-text)] opacity-40 font-mono">Resolved</span>;
                                })()}
                              </td>
                            </tr>
                          );
                        })}
                        {paginatedTransactions.length === 0 && (
                          <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No transactions found.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {renderPagination(txPage, totalTxPages, setTxPage)}
                </div>
              </div>
            )}

            {/* TAB: ANNOUNCEMENTS */}
            {activeAdminTab === "announcements" && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6 text-[var(--theme-text)]">
                
                {/* Sub-tab Navigation */}
                <div className="flex border-b border-[var(--theme-card-border)] gap-6 w-full mb-6">
                  <button
                    onClick={() => setAnnSubTab("announcements")}
                    className={`pb-3 text-sm font-bold transition-all border-b-2 outline-none cursor-pointer ${annSubTab === "announcements" ? "border-[var(--theme-primary)] text-[var(--theme-text)]" : "border-transparent text-[var(--theme-text)] opacity-60 hover:opacity-100"}`}
                  >
                    User Alerts
                  </button>
                  <button
                    onClick={() => setAnnSubTab("news")}
                    className={`pb-3 text-sm font-bold transition-all border-b-2 outline-none cursor-pointer ${annSubTab === "news" ? "border-[var(--theme-primary)] text-[var(--theme-text)]" : "border-transparent text-[var(--theme-text)] opacity-60 hover:opacity-100"}`}
                  >
                    Home News Carousel
                  </button>
                </div>

                <div className="flex justify-between items-center py-2">
                  <div>
                    <h2 className="text-lg font-extrabold text-[var(--theme-text)]">{annSubTab === "news" ? "Home News Carousel" : "Global Announcements"}</h2>
                    <p className="text-sm text-[var(--theme-text)] opacity-70 mt-1">{annSubTab === "news" ? "Create news items that appear in the dashboard slider." : "Create updates that broadcast to all users via Alerts."}</p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingAnnx(null);
                      setAnnTitle("");
                      setAnnMessage("");
                      setAnnLink("");
                      setAnnCategory(annSubTab === "news" ? "news" : "announcement");
                      setAnnImageUrl("");
                      setAnnTag("");
                      setAnnAlertUsers(false);
                      setIsCreatingAnnx(true);
                  }}
                  className="btn-3d-primary px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white cursor-pointer active:translate-y-1 transition-all"
                >
                  {annSubTab === "news" ? "+ Add News" : "+ Add Announcement"}
                </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {announcements.filter(a => annSubTab === "news" ? a.category === "news" : a.category !== "news").map((ann) => (
                    <div key={ann.id} className="border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] text-[var(--theme-text)] rounded-[var(--theme-radius)] p-5 relative shadow-md transition-all">
                      <div className="flex justify-between items-start mb-2">
                        <span className="px-2 py-0.5 rounded text-[12px] font-mono font-bold uppercase bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] border border-[var(--theme-primary)]/20">
                          {ann.category}
                        </span>
                        <div className="flex gap-2.5">
                          <button
                            onClick={() => {
                              setEditingAnnx(ann);
                              setAnnTitle(ann.title);
                              setAnnMessage(ann.message);
                              setAnnLink(ann.readMoreLink || ann.metadata?.link || "");
                              setAnnCategory(ann.category || "announcement");
                              setAnnImageUrl(ann.imageUrl || ann.metadata?.imageUrl || "");
                              setAnnTag(ann.tag || ann.metadata?.tag || "");
                              setAnnAlertUsers(!!(ann.metadata?.alertUsers ?? true));
                              setIsCreatingAnnx(true);
                            }}
                            className="text-[var(--theme-text)] opacity-70 hover:opacity-100 transition-colors cursor-pointer"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteAnnouncement(ann.id)} 
                            className="text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <h3 className="text-sm font-extrabold text-[var(--theme-text)] mb-1 leading-snug">{ann.title}</h3>
                      <p className="text-xs text-[var(--theme-text)] opacity-70 line-clamp-2">{ann.message}</p>
                      <div className="text-[12px] text-[var(--theme-text)] opacity-50 mt-3 font-mono">
                        {new Date(ann.timestamp).toLocaleString()}
                      </div>
                    </div>
                  ))}
                  {announcements.filter(a => annSubTab === "news" ? a.category === "news" : a.category !== "news").length === 0 && (
                    <div className="col-span-full text-center py-10 text-[var(--theme-text)] opacity-50 font-mono text-sm">
                      No {annSubTab === "news" ? "news items" : "global announcements"} currently published.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: SUPPORT CHAT DESK */}
            {activeAdminTab === "chat" && (
              <div className="animate-in fade-in duration-300 flex-1 w-full flex flex-col overflow-hidden">
                <AdminChatDesk usersList={usersList} />
              </div>
            )}

            {/* TAB: CONFIG */}
            {activeAdminTab === "config" && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* SUB-TABS NAVIGATION */}
                <div className="flex border-b border-[var(--theme-card-border)] gap-6 w-full mb-6 overflow-x-auto no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setConfigSubTab("brand")}
                    className={`pb-3 text-sm font-bold transition-all border-b-2 outline-none cursor-pointer shrink-0 ${
                      configSubTab === "brand" ? "border-[var(--theme-primary)] text-[var(--theme-text)]" : "border-transparent text-[var(--theme-text)] opacity-60 hover:opacity-100"
                    }`}
                  >
                    Brand Identity
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfigSubTab("theme")}
                    className={`pb-3 text-sm font-bold transition-all border-b-2 outline-none cursor-pointer shrink-0 ${
                      configSubTab === "theme" ? "border-[var(--theme-primary)] text-[var(--theme-text)]" : "border-transparent text-[var(--theme-text)] opacity-60 hover:opacity-100"
                    }`}
                  >
                    Theme & Aesthetic
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfigSubTab("rewards")}
                    className={`pb-3 text-sm font-bold transition-all border-b-2 outline-none cursor-pointer shrink-0 ${
                      configSubTab === "rewards" ? "border-[var(--theme-primary)] text-[var(--theme-text)]" : "border-transparent text-[var(--theme-text)] opacity-60 hover:opacity-100"
                    }`}
                  >
                    Rewards
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfigSubTab("referral")}
                    className={`pb-3 text-sm font-bold transition-all border-b-2 outline-none cursor-pointer shrink-0 ${
                      configSubTab === "referral" ? "border-[var(--theme-primary)] text-[var(--theme-text)]" : "border-transparent text-[var(--theme-text)] opacity-60 hover:opacity-100"
                    }`}
                  >
                    Referral Levels
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfigSubTab("vipTasks")}
                    className={`pb-3 text-sm font-bold transition-all border-b-2 outline-none cursor-pointer shrink-0 ${
                      configSubTab === "vipTasks" ? "border-[var(--theme-primary)] text-[var(--theme-text)]" : "border-transparent text-[var(--theme-text)] opacity-60 hover:opacity-100"
                    }`}
                  >
                    Milestones
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setConfigSubTab("gateways")}
                    className={`pb-3 text-sm font-bold transition-all border-b-2 outline-none cursor-pointer shrink-0 ${
                      configSubTab === "gateways" ? "border-[var(--theme-primary)] text-[var(--theme-text)]" : "border-transparent text-[var(--theme-text)] opacity-60 hover:opacity-100"
                    }`}
                  >
                    Payment Config & Gateways
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfigSubTab("giftcodes")}
                    className={`pb-3 text-sm font-bold transition-all border-b-2 outline-none cursor-pointer shrink-0 ${
                      configSubTab === "giftcodes" ? "border-[var(--theme-primary)] text-[var(--theme-text)]" : "border-transparent text-[var(--theme-text)] opacity-60 hover:opacity-100"
                    }`}
                  >
                    Gift Codes
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfigSubTab("checkin")}
                    className={`pb-3 text-sm font-bold transition-all border-b-2 outline-none cursor-pointer shrink-0 ${
                      configSubTab === "checkin" ? "border-[var(--theme-primary)] text-[var(--theme-text)]" : "border-transparent text-[var(--theme-text)] opacity-60 hover:opacity-100"
                    }`}
                  >
                    Daily Check-in
                  </button>
                </div>

                {(configSubTab === "brand" || configSubTab === "theme" || configSubTab === "rewards" || configSubTab === "referral" || configSubTab === "vipTasks") && (
                  <form onSubmit={handleSaveSiteConfig} className="space-y-0">
                    {/* SUBTAB: BRAND */}
                  {configSubTab === "brand" && (
                    <div className="space-y-0">
                      {/* General Branding */}
                      <div className="flex flex-col md:flex-row md:gap-12 py-8">
                        <div className="md:w-1/3 mb-6 md:mb-0 shrink-0">
                          <h3 className="text-sm font-extrabold text-[var(--theme-text)]">Brand Identity</h3>
                          <p className="text-xs text-[var(--theme-text)] opacity-70 mt-2 leading-relaxed">The name of the website, which will be displayed in headers, emails, and alerts.</p>
                        </div>
                        <div className="md:w-2/3 max-w-xl space-y-4">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">Website Name</label>
                            <input
                              type="text"
                              value={siteConfig.brandName || ""}
                              onChange={(e) => setSiteConfig({ ...siteConfig, brandName: e.target.value })}
                              className="theme-input w-full px-4 py-3 text-sm"
                              placeholder="e.g. Acme Nodes"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">Logo URL or SVG String</label>
                            <div className="flex gap-4 items-center">
                              <input
                                type="text"
                                value={siteConfig.logoUrl || ""}
                                onChange={(e) => setSiteConfig({ ...siteConfig, logoUrl: e.target.value })}
                                className="theme-input flex-1 px-4 py-3 text-sm font-mono"
                                placeholder="<svg>...</svg> or logo URL"
                              />
                              <div className="w-12 h-12 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] flex items-center justify-center p-2 shrink-0 shadow-sm" title="Logo Preview">
                                <BrandLogo siteConfig={siteConfig} className="w-full h-full object-contain" />
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <label className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-xs font-bold text-[var(--theme-text)] transition-all active:scale-[0.97] ${uploadingField === "logoUrl" ? "opacity-60 pointer-events-none" : "cursor-pointer hover:border-[var(--theme-primary)]"}`}>
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                  className="hidden"
                                  disabled={uploadingField === "logoUrl"}
                                  onChange={handleLogoFile}
                                />
                                {uploadingField === "logoUrl" ? "Uploading…" : "Upload logo from disk"}
                              </label>
                              <span className="text-[11px] text-[var(--theme-text)] opacity-60">PNG / JPG / WebP / SVG, max 2 MB. Saved on the server — then Save configuration.</span>
                            </div>
                          </div>

                          <div className="border-t border-[var(--theme-card-border)] pt-4 mt-4 space-y-4">
                            <h4 className="text-xs font-black uppercase text-[var(--theme-primary)] tracking-wider">Progressive Web App (PWA) Settings</h4>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">PWA Short Name</label>
                                <input
                                  type="text"
                                  value={siteConfig.manifestShortName || ""}
                                  onChange={(e) => setSiteConfig({ ...siteConfig, manifestShortName: e.target.value })}
                                  className="theme-input w-full px-4 py-3 text-sm"
                                  placeholder="e.g. Canan AI"
                                />
                              </div>
                              
                              <div className="space-y-2">
                                <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">PWA Theme Color</label>
                                <input
                                  type="text"
                                  value={siteConfig.manifestThemeColor || ""}
                                  onChange={(e) => setSiteConfig({ ...siteConfig, manifestThemeColor: e.target.value })}
                                  className="theme-input w-full px-4 py-3 text-sm font-mono"
                                  placeholder="e.g. #020617"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">PWA Background Color</label>
                                <input
                                  type="text"
                                  value={siteConfig.manifestBgColor || ""}
                                  onChange={(e) => setSiteConfig({ ...siteConfig, manifestBgColor: e.target.value })}
                                  className="theme-input w-full px-4 py-3 text-sm font-mono"
                                  placeholder="e.g. #020617"
                                />
                              </div>

                              <div className="space-y-2">
                                <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">PWA Description</label>
                                <input
                                  type="text"
                                  value={siteConfig.manifestDescription || ""}
                                  onChange={(e) => setSiteConfig({ ...siteConfig, manifestDescription: e.target.value })}
                                  className="theme-input w-full px-4 py-3 text-sm"
                                  placeholder="Uganda High-Yield AI GPU Mining Network"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Support Channels */}
                      <div className="flex flex-col md:flex-row md:gap-12 py-4">
                        <div className="md:w-1/3 mb-6 md:mb-0 shrink-0">
                          <h3 className="text-sm font-extrabold text-[var(--theme-text)]">Support Channels</h3>
                          <p className="text-xs text-[var(--theme-text)] opacity-70 mt-2 leading-relaxed">Configure official communication links for your community customer support channels.</p>
                        </div>
                        <div className="md:w-2/3 max-w-xl space-y-6">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider flex items-center gap-1.5">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0 fill-emerald-500"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.26-1.38a9.87 9.87 0 004.78 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.91-7.99zM12.05 20.04a8.13 8.13 0 01-4.15-1.13l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 01-1.27-4.29c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.41a8.18 8.18 0 012.42 5.83c0 4.54-3.7 8.24-8.27 8.24zm6.74-6.05c-.37-.19-2.2-1.09-2.54-1.21-.34-.12-.59-.19-.84.19-.25.37-.97 1.21-1.19 1.46-.22.25-.44.28-.81.09-.37-.19-1.57-.58-2.99-1.85-.91-.81-1.52-1.81-1.7-2.12-.18-.31-.02-.48.13-.63.14-.14.37-.37.56-.56.18-.19.25-.31.37-.52.12-.22.06-.4-.03-.56-.09-.19-.84-2.02-1.15-2.77-.3-.73-.61-.63-.84-.64l-.72-.01c-.25 0-.65.09-.99.47-.34.37-1.3 1.27-1.3 3.1s1.33 3.6 1.52 3.85c.19.25 2.62 4 6.35 5.61.89.38 1.58.61 2.12.78.89.28 1.7.24 2.34.15.71-.11 2.2-.9 2.51-1.77.31-.87.31-1.61.22-1.77-.09-.16-.34-.25-.71-.43z"/></svg>
                                <span>WhatsApp Support Link</span>
                              </label>
                              <input
                                type="url"
                                value={siteConfig.whatsappLink || ""}
                                onChange={(e) => setSiteConfig({ ...siteConfig, whatsappLink: e.target.value })}
                                className="theme-input w-full px-4 py-3 text-sm focus:border-emerald-500"
                                placeholder="https://wa.me/..."
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider flex items-center gap-1.5">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0 fill-sky-500"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z"/></svg>
                                <span>Telegram Channel Link</span>
                              </label>
                              <input
                                type="url"
                                value={siteConfig.telegramLink || ""}
                                onChange={(e) => setSiteConfig({ ...siteConfig, telegramLink: e.target.value })}
                                className="theme-input w-full px-4 py-3 text-sm focus:border-sky-500"
                                placeholder="https://t.me/..."
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUBTAB: THEME & AESTHETIC — hut12 minimal (2 presets, fixed tokens) */}
                  {configSubTab === "theme" && (
                    <div className="py-2 space-y-6">
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        <div className="lg:col-span-7 space-y-5 text-[var(--theme-text)] font-sans">
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider">Theme Preset</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {HUT12_PRESET_OPTIONS.map((preset) => {
                                const isActive = (siteConfig.themePreset || "hut12-light") === preset.id;
                                return (
                                  <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => {
                                      const details = HUT12_PRESETS[preset.id];
                                      setSiteConfig({
                                        ...siteConfig,
                                        themePreset: preset.id,
                                        primaryColor: details.primary,
                                        accentColor: details.accent,
                                        secondaryColor: details.secondary,
                                        bgColor: details.bg,
                                        cardBgColor: details.cardBg,
                                        cardStyle: preset.cardStyle,
                                        borderRadius: preset.radius,
                                        themeMode: details.isDark ? "dark" : "light",
                                        textColor: details.textColor || "",
                                      });
                                    }}
                                    className={`p-4 rounded-[var(--theme-radius)] border text-left transition-all ${isActive ? "border-[var(--theme-primary)] bg-[var(--theme-primary)]/10" : "border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] hover:border-[var(--theme-primary)]/40"}`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <span className="text-lg">{preset.icon}</span>
                                      <div>
                                        <div className="text-sm font-bold">{preset.name}</div>
                                        <div className="text-xs opacity-60">{preset.description}</div>
                                      </div>
                                    </div>
                                    <div className="flex gap-1.5 mt-3">
                                      <span className="w-6 h-6 rounded-full border border-black/10" style={{ background: preset.primary }} />
                                      <span className="w-6 h-6 rounded-full border border-black/10" style={{ background: preset.accent }} />
                                      <span className="w-6 h-6 rounded-full border border-black/10" style={{ background: preset.secondary }} />
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            <div className="flex gap-2 mt-3 items-center">
                              <span className="text-[11px] font-bold opacity-60">Mode</span>
                              <select
                                value={siteConfig.themeMode || "light"}
                                onChange={(e) => setSiteConfig({ ...siteConfig, themeMode: e.target.value as ThemeMode })}
                                className="theme-input px-3 py-1.5 text-xs font-bold"
                              >
                                <option value="light">light</option>
                                <option value="dark">dark</option>
                                <option value="system">system</option>
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="p-3 rounded-xl border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)]">
                              <div className="text-[11px] font-bold opacity-60 uppercase">Font</div>
                              <div className="text-sm font-bold">Sora</div>
                            </div>
                            <div className="p-3 rounded-xl border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)]">
                              <div className="text-[11px] font-bold opacity-60 uppercase">Card</div>
                              <div className="text-sm font-bold">{migrateCardStyle(siteConfig.cardStyle)}</div>
                            </div>
                            <div className="p-3 rounded-xl border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)]">
                              <div className="text-[11px] font-bold opacity-60 uppercase">Button</div>
                              <div className="text-sm font-bold">pill-gradient</div>
                            </div>
                            <div className="p-3 rounded-xl border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)]">
                              <div className="text-[11px] font-bold opacity-60 uppercase">Radius</div>
                              <div className="text-sm font-bold">rounded-2xl</div>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold block">Custom Wallpapers</label>
                            <div className="space-y-2">
                              <div>
                                <span className="text-[11px] opacity-70 block mb-1">Auth View Background Image URL</span>
                                <div className="flex gap-3 items-center">
                                  <input
                                    type="text"
                                    value={siteConfig.authBgImage || ""}
                                    onChange={(e) => setSiteConfig({ ...siteConfig, authBgImage: e.target.value })}
                                    placeholder="https://images.unsplash.com/..."
                                    className="theme-input flex-1 px-3.5 py-2 text-xs font-mono"
                                  />
                                  <div className="w-10 h-10 rounded-lg bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] overflow-hidden shrink-0 flex items-center justify-center">
                                    {siteConfig.authBgImage ? (
                                      <img src={fixGitHubImageUrl(siteConfig.authBgImage)} referrerPolicy="no-referrer" className="w-full h-full object-cover" alt="Auth Preview" />
                                    ) : (
                                      <div className="w-full h-full bg-slate-200 flex items-center justify-center text-[10px] text-slate-400">N/A</div>
                                    )}
                                  </div>
                                </div>
                                <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[11px] font-bold text-[var(--theme-text)] transition-all active:scale-[0.97] w-fit ${uploadingField === "authBgImage" ? "opacity-60 pointer-events-none" : "cursor-pointer hover:border-[var(--theme-primary)]"}`}>
                                  <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="hidden"
                                    disabled={uploadingField === "authBgImage"}
                                    onChange={(e) => handleSiteImageFile(e, "authbg", "authBgImage", "Auth background")}
                                  />
                                  {uploadingField === "authBgImage" ? "Uploading…" : "Upload from disk (max 4 MB)"}
                                </label>
                              </div>
                              <div>
                                <span className="text-[11px] opacity-70 block mb-1">Dashboard Wallpaper / Pattern URL</span>
                                <div className="flex gap-3 items-center">
                                  <input
                                    type="text"
                                    value={siteConfig.dashboardBgImage || ""}
                                    onChange={(e) => setSiteConfig({ ...siteConfig, dashboardBgImage: e.target.value })}
                                    placeholder="https://images.unsplash.com/..."
                                    className="theme-input flex-1 px-3.5 py-2 text-xs font-mono"
                                  />
                                  <div className="w-10 h-10 rounded-lg bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] overflow-hidden shrink-0 flex items-center justify-center">
                                    {siteConfig.dashboardBgImage ? (
                                      <img src={fixGitHubImageUrl(siteConfig.dashboardBgImage)} referrerPolicy="no-referrer" className="w-full h-full object-cover" alt="Dashboard Preview" />
                                    ) : (
                                      <div className="w-full h-full bg-slate-200 flex items-center justify-center text-[10px] text-slate-400">N/A</div>
                                    )}
                                  </div>
                                </div>
                                <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[11px] font-bold text-[var(--theme-text)] transition-all active:scale-[0.97] w-fit ${uploadingField === "dashboardBgImage" ? "opacity-60 pointer-events-none" : "cursor-pointer hover:border-[var(--theme-primary)]"}`}>
                                  <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="hidden"
                                    disabled={uploadingField === "dashboardBgImage"}
                                    onChange={(e) => handleSiteImageFile(e, "dashboardbg", "dashboardBgImage", "Dashboard wallpaper")}
                                  />
                                  {uploadingField === "dashboardBgImage" ? "Uploading…" : "Upload from disk (max 4 MB)"}
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="lg:col-span-5 lg:sticky lg:top-20 space-y-2">
                          <div className="flex items-center justify-between px-1">
                            <h4 className="text-xs font-bold uppercase tracking-wider opacity-70 flex items-center gap-1.5">
                              <Sparkles className="w-4 h-4 text-amber-500" /> Preview
                            </h4>
                            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[var(--theme-card-bg)] text-[var(--theme-primary)] font-mono uppercase border border-[var(--theme-card-border)]">
                              {siteConfig.themePreset || "hut12-light"}
                            </span>
                          </div>
                          {(() => {
                            const activePresetKey = (siteConfig.themePreset || "hut12-light") as ThemePreset;
                            const presetDefaults = HUT12_PRESETS[activePresetKey] || HUT12_PRESETS["hut12-light"];
                            const pPrimary = presetDefaults.primary;
                            const pAccent = presetDefaults.accent;
                            const pPrimaryShadow = presetDefaults.primaryShadow;
                            const pAccentShadow = presetDefaults.accentShadow;
                            const pCardBg = presetDefaults.cardBg;
                            const pCardBorder = presetDefaults.cardBorder;
                            const pBg = presetDefaults.bg;
                            const pText = presetDefaults.textColor || "#1c1917";
                            const pRadius = "1.25rem";
                            const cStyle = migrateCardStyle(siteConfig.cardStyle);
                            let cardBgStyle = pCardBg;
                            let cardBorderStyle = pCardBorder;
                            let cardShadowStyle = cStyle === "glass" ? "0 8px 32px 0 rgba(0,0,0,0.18)" : "0 2px 8px 0 rgba(0,0,0,0.08)";
                            let backdropBlurStyle: string | undefined = cStyle === "glass" ? "blur(16px)" : undefined;
                            if (cStyle === "glass") {
                              cardBgStyle = presetDefaults.isDark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.82)";
                              cardBorderStyle = presetDefaults.isDark ? "rgba(255,255,255,0.10)" : "rgba(15, 23, 42, 0.12)";
                            }
                            const pFontSize = "15px";
                            return (
                              <div
                                className="theme-card p-5 space-y-4 relative transition-all overflow-hidden rounded-2xl"
                                data-card-style={cStyle}
                                style={
                                  {
                                    backgroundColor: cardBgStyle,
                                    borderColor: cardBorderStyle,
                                    borderWidth: "1px",
                                    borderStyle: "solid",
                                    boxShadow: cardShadowStyle,
                                    backdropFilter: backdropBlurStyle,
                                    WebkitBackdropFilter: backdropBlurStyle,
                                    color: pText,
                                    borderRadius: pRadius,
                                    fontSize: pFontSize,
                                    fontFamily: "'Sora', sans-serif",
                                    backgroundImage: siteConfig.dashboardBgImage ? `linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.4)), url('${siteConfig.dashboardBgImage}')` : undefined,
                                    backgroundSize: "cover",
                                    backgroundPosition: "center",
                                  } as React.CSSProperties
                                }
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-sm shrink-0" style={{ backgroundColor: `${pPrimary}25` }}>
                                      ⚡
                                    </div>
                                    <div>
                                      <h5 className="text-sm font-extrabold leading-tight" style={{ color: pText }}>
                                        {siteConfig.brandName || "System"}
                                      </h5>
                                      <p className="text-[11px] opacity-70" style={{ color: pText }}>
                                        Sora · {cStyle}
                                      </p>
                                    </div>
                                  </div>
                                  <span
                                    className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shrink-0"
                                    style={{ backgroundColor: pAccent, borderRadius: pRadius, boxShadow: `0 2px 0 ${pAccentShadow}` }}
                                  >
                                    Live
                                  </span>
                                </div>
                                <div className="space-y-1.5">
                                  <div className="flex justify-between text-xs font-bold">
                                    <span style={{ color: pPrimary }}>85%</span>
                                  </div>
                                  <div className="w-full h-2.5 rounded-full overflow-hidden p-0.5 border" style={{ backgroundColor: pBg, borderColor: pCardBorder }}>
                                    <div className="h-full rounded-full transition-all duration-300 shadow-sm" style={{ width: "85%", backgroundColor: pPrimary, boxShadow: `0 2px 0 ${pPrimaryShadow}` }} />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <input
                                    type="text"
                                    readOnly
                                    value={`Active Preset: ${activePresetKey}`}
                                    style={{ backgroundColor: pBg, borderColor: pCardBorder, color: pText, borderRadius: pRadius }}
                                    className="w-full border px-3 py-1.5 text-xs outline-none font-mono transition-all"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2.5 pt-1" data-button-style="pill-gradient">
                                  <button type="button" style={{ borderRadius: pRadius, color: "#ffffff" }} className="btn-3d-primary py-2 px-3 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all">
                                    <span>Primary Action</span>
                                  </button>
                                  <button type="button" style={{ borderRadius: pRadius, color: "#ffffff" }} className="btn-3d-accent py-2 px-3 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all">
                                    <span>Secondary</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUBTAB: REWARDS */}

                  {configSubTab === "rewards" && false && (
                    <div className="flex flex-col md:flex-row md:gap-12 py-4">
                      <div className="md:w-1/3 mb-6 md:mb-0 shrink-0">
                        <h3 className="text-sm font-extrabold text-[var(--theme-text)]">Rewards & Referral</h3>
                        <p className="text-xs text-[var(--theme-text)] opacity-70 mt-2 leading-relaxed">Define welcome bonuses, four referral commission levels, and the admin-backed milestone board.</p>
                      </div>
                      <div className="md:w-2/3 max-w-3xl space-y-8">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">Welcome Bonus ({currency})</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={siteConfig.registrationBonus || 1000}
                            onChange={(e) => setSiteConfig({ ...siteConfig, registrationBonus: Number(e.target.value) })}
                            className="theme-input w-full px-4 py-3 text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">Base Invite Bonus ({currency})</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={siteConfig.inviteBonus || 3000}
                            onChange={(e) => setSiteConfig({ ...siteConfig, inviteBonus: Number(e.target.value) })}
                            className="theme-input w-full px-4 py-3 text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">Level 1 Commission (%)</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={siteConfig.level1InviteIncomePct ?? 15}
                            onChange={(e) => setSiteConfig({ ...siteConfig, level1InviteIncomePct: Number(e.target.value) })}
                            className="theme-input w-full px-4 py-3 text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">Level 2 Commission (%)</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={siteConfig.level2InviteIncomePct ?? 5}
                            onChange={(e) => setSiteConfig({ ...siteConfig, level2InviteIncomePct: Number(e.target.value) })}
                            className="theme-input w-full px-4 py-3 text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">Level 3 Commission (%)</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            min="0"
                            max="100"
                            value={siteConfig.level3InviteIncomePct ?? 0}
                            onChange={(e) => setSiteConfig({ ...siteConfig, level3InviteIncomePct: Number(e.target.value) })}
                            className="theme-input w-full px-4 py-3 text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">Level 4 Commission (%)</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            min="0"
                            max="100"
                            value={siteConfig.level4InviteIncomePct ?? 0}
                            onChange={(e) => setSiteConfig({ ...siteConfig, level4InviteIncomePct: Number(e.target.value) })}
                            className="theme-input w-full px-4 py-3 text-sm"
                          />
                        </div>
                        </div>

                        <div className="border-t border-[var(--theme-card-border)] pt-6 space-y-4">
                          <div>
                            <h4 className="text-sm font-extrabold text-[var(--theme-text)] flex items-center gap-2"><Tags className="w-4 h-4 text-[var(--theme-primary)]" />VIP Taskboard</h4>
                            <p className="text-xs text-[var(--theme-text)] opacity-65 mt-1">Create tasks using the user's total credited referral income across Levels 1–4. Tasks are saved inside site configuration and rewards are validated on the server.</p>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <input type="text" value={vipTaskTitle} onChange={(e) => setVipTaskTitle(e.target.value)} placeholder="Task title" className="theme-input px-3 py-2.5 text-sm" />
                            <input type="text" value={vipTaskCategory} onChange={(e) => setVipTaskCategory(e.target.value)} placeholder="Category (e.g. Bronze)" className="theme-input px-3 py-2.5 text-sm" />
                            <input type="text" value={vipTaskDescription} onChange={(e) => setVipTaskDescription(e.target.value)} placeholder="Short description (optional)" className="theme-input px-3 py-2.5 text-sm sm:col-span-2" />
                            <label className="text-xs font-bold opacity-75">Required referral bonus ({currency})<input type="text" inputMode="numeric" value={vipTaskRequiredBonus || ""} onChange={(e) => setVipTaskRequiredBonus(Number(e.target.value) || 0)} className="theme-input w-full px-3 py-2.5 text-sm mt-1" /></label>
                            <label className="text-xs font-bold opacity-75">Reward ({currency})<input type="text" inputMode="numeric" value={vipTaskReward || ""} onChange={(e) => setVipTaskReward(Number(e.target.value) || 0)} className="theme-input w-full px-3 py-2.5 text-sm mt-1" /></label>
                          </div>
                          <button type="button" onClick={handleAddVipTask} className="btn-3d-secondary px-4 py-2.5 text-xs font-black flex items-center gap-2 cursor-pointer"><Plus className="w-4 h-4" />Add VIP Task</button>

                          {getVipTasks().length === 0 ? (
                            <div className="rounded-[var(--theme-radius)] border border-dashed border-[var(--theme-card-border)] p-4 text-xs opacity-65">No VIP tasks configured. Add the first task above.</div>
                          ) : (
                            <div className="space-y-2">
                              {getVipTasks().map((task) => (
                                <div key={task.id} className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] p-3 flex items-center gap-3">
                                  <div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap"><span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-[var(--theme-primary)]/10 text-[var(--theme-primary)]">{task.category}</span><span className="text-sm font-bold truncate">{task.title}</span></div><p className="text-[11px] opacity-60 mt-1">Unlock at {formatCurrency(task.requiredBonus)} · Reward {formatCurrency(task.reward)}</p></div>
                                  <button type="button" onClick={() => handleToggleVipTask(task.id)} className={`text-[10px] font-black px-2.5 py-1.5 rounded-full border cursor-pointer ${task.active === false ? "opacity-50 border-[var(--theme-card-border)]" : "text-emerald-500 border-emerald-500/30 bg-emerald-500/10"}`}>{task.active === false ? "INACTIVE" : "ACTIVE"}</button>
                                  <button type="button" onClick={() => handleRemoveVipTask(task.id)} aria-label={`Remove ${task.title}`} className="p-2 rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {configSubTab === "rewards" && (
                    <div className="flex flex-col md:flex-row md:gap-12 py-4">
                      <div className="md:w-1/3 mb-6 md:mb-0 shrink-0">
                        <h3 className="text-sm font-extrabold text-[var(--theme-text)]">Rewards</h3>
                        <p className="text-xs text-[var(--theme-text)] opacity-70 mt-2 leading-relaxed">Set the welcome bonus issued during registration and the one-time bonus for a new referral.</p>
                      </div>
                      <div className="md:w-2/3 max-w-xl grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label className="text-xs font-bold opacity-80 uppercase tracking-wider">Registration Bonus ({currency})
                          <input type="text" inputMode="numeric" value={siteConfig.registrationBonus ?? 1000} onChange={(e) => setSiteConfig({ ...siteConfig, registrationBonus: Number(e.target.value) || 0 })} className="theme-input w-full px-4 py-3 text-sm mt-2" />
                        </label>
                        <label className="text-xs font-bold opacity-80 uppercase tracking-wider">Base Invite Bonus ({currency})
                          <input type="text" inputMode="numeric" value={siteConfig.inviteBonus ?? 3000} onChange={(e) => setSiteConfig({ ...siteConfig, inviteBonus: Number(e.target.value) || 0 })} className="theme-input w-full px-4 py-3 text-sm mt-2" />
                        </label>
                      </div>
                    </div>
                  )}

                  {configSubTab === "referral" && (
                    <div className="flex flex-col md:flex-row md:gap-12 py-4">
                      <div className="md:w-1/3 mb-6 md:mb-0 shrink-0">
                        <h3 className="text-sm font-extrabold text-[var(--theme-text)]">Referral Levels</h3>
                        <p className="text-xs text-[var(--theme-text)] opacity-70 mt-2 leading-relaxed">Configure commission earned when the network activates products. Levels 3 and 4 are enabled by setting a percentage above zero.</p>
                      </div>
                      <div className="md:w-2/3 max-w-xl grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[1, 2, 3, 4].map((level) => {
                          const key = `level${level}InviteIncomePct`;
                          const fallback = level === 1 ? 15 : level === 2 ? 5 : 0;
                          return (
                            <label key={level} className="text-xs font-bold opacity-80 uppercase tracking-wider">Level {level} Commission (%)
                              <input type="text" inputMode="decimal" value={siteConfig[key] ?? fallback} onChange={(e) => setSiteConfig({ ...siteConfig, [key]: Number(e.target.value) || 0 })} className="theme-input w-full px-4 py-3 text-sm mt-2" />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {configSubTab === "vipTasks" && false && (
                    <div className="flex flex-col md:flex-row md:gap-12 py-4">
                      <div className="md:w-1/3 mb-6 md:mb-0 shrink-0">
                        <h3 className="text-sm font-extrabold text-[var(--theme-text)] flex items-center gap-2"><Tags className="w-4 h-4 text-[var(--theme-primary)]" />VIP Taskboard</h3>
                        <p className="text-xs text-[var(--theme-text)] opacity-70 mt-2 leading-relaxed">Create tasks using the server-calculated credited referral income across all four levels.</p>
                      </div>
                      <div className="md:w-2/3 max-w-3xl space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <input type="text" value={vipTaskTitle} onChange={(e) => setVipTaskTitle(e.target.value)} placeholder="Task title" className="theme-input px-3 py-2.5 text-sm" />
                          <input type="text" value={vipTaskCategory} onChange={(e) => setVipTaskCategory(e.target.value)} placeholder="Category (e.g. Bronze)" className="theme-input px-3 py-2.5 text-sm" />
                          <input type="text" value={vipTaskDescription} onChange={(e) => setVipTaskDescription(e.target.value)} placeholder="Short description (optional)" className="theme-input px-3 py-2.5 text-sm sm:col-span-2" />
                          <label className="text-xs font-bold opacity-75">Required referral bonus ({currency})<input type="text" inputMode="numeric" value={vipTaskRequiredBonus || ""} onChange={(e) => setVipTaskRequiredBonus(Number(e.target.value) || 0)} className="theme-input w-full px-3 py-2.5 text-sm mt-1" /></label>
                          <label className="text-xs font-bold opacity-75">Reward ({currency})<input type="text" inputMode="numeric" value={vipTaskReward || ""} onChange={(e) => setVipTaskReward(Number(e.target.value) || 0)} className="theme-input w-full px-3 py-2.5 text-sm mt-1" /></label>
                        </div>
                        <button type="button" onClick={handleAddVipTask} className="btn-3d-secondary px-4 py-2.5 text-xs font-black flex items-center gap-2 cursor-pointer"><Plus className="w-4 h-4" />Add VIP Task</button>
                        {getVipTasks().length === 0 ? (
                          <div className="rounded-[var(--theme-radius)] border border-dashed border-[var(--theme-card-border)] p-4 text-xs opacity-65">No VIP tasks configured. Add the first task above.</div>
                        ) : (
                          <div className="space-y-2">
                            {getVipTasks().map((task) => (
                              <div key={task.id} className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] p-3 flex items-center gap-3">
                                <div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap"><span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-[var(--theme-primary)]/10 text-[var(--theme-primary)]">{task.category}</span><span className="text-sm font-bold truncate">{task.title}</span></div><p className="text-[11px] opacity-60 mt-1">Unlock at {formatCurrency(task.requiredBonus)} · Reward {formatCurrency(task.reward)}</p></div>
                                <button type="button" onClick={() => handleToggleVipTask(task.id)} className={`text-[10px] font-black px-2.5 py-1.5 rounded-full border cursor-pointer ${task.active === false ? "opacity-50 border-[var(--theme-card-border)]" : "text-emerald-500 border-emerald-500/30 bg-emerald-500/10"}`}>{task.active === false ? "INACTIVE" : "ACTIVE"}</button>
                                <button type="button" onClick={() => handleRemoveVipTask(task.id)} aria-label={`Remove ${task.title}`} className="p-2 rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {configSubTab === "vipTasks" && (
                    <div className="space-y-5 py-4">
                      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--theme-radius)] bg-[var(--theme-primary)]/12 text-[var(--theme-primary)]"><Tags className="w-4 h-4" /></span>
                          <div>
                            <h3 className="text-base font-extrabold text-[var(--theme-text)]">Milestone board</h3>
                            <p className="text-xs text-[var(--theme-text)] opacity-65 mt-0.5">Tasks unlock from the user's server-calculated operator lifetime points.</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button type="button" onClick={() => setIsVipCategoryModalOpen(true)} className="btn-3d-secondary px-3.5 py-2.5 text-xs font-black flex items-center gap-2 cursor-pointer"><Folder className="w-3.5 h-3.5" />Manage tiers</button>
                          <button type="button" onClick={() => { setEditingVipTaskId(null); resetVipTaskForm(); setVipTaskCategory(getVipTaskCategories()[0] || ""); setIsVipTaskModalOpen(true); }} className="btn-3d-primary text-white px-4 py-2.5 text-xs font-black flex items-center gap-2 cursor-pointer"><Plus className="w-4 h-4" />Create milestone</button>
                        </div>
                      </div>

                      <div className="rounded-[var(--theme-radius)] border border-[var(--theme-card-border)] overflow-hidden bg-[var(--theme-card-bg)]">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead>
                              <tr className="bg-[var(--theme-bg)] border-b border-[var(--theme-card-border)]">
                                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider opacity-65">Task</th>
                                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider opacity-65">Category</th>
                                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider opacity-65 text-right"></th>
                                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider opacity-65 text-right">Reward</th>
                                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider opacity-65 text-center">Users</th>
                                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider opacity-65 text-center">Status</th>
                                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider opacity-65 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--theme-card-border)]/40">
                              {getVipTasks().map((task) => {
                                const claimedUsers = usersList.filter((user) => (user.claimedVipTasks || []).includes(task.id)).length;
                                return (
                                  <tr key={task.id} className="hover:bg-[var(--theme-bg)]/45 transition-colors">
                                    <td className="px-4 py-4 min-w-[220px]"><div className="flex items-center gap-2.5"><div className="w-9 h-9 rounded-lg bg-[var(--theme-bg)] border border-[var(--theme-card-border)] overflow-hidden shrink-0 flex items-center justify-center">{task.imageUrl ? <img src={fixGitHubImageUrl(task.imageUrl)} alt="" className="w-full h-full object-cover" /> : <span className="text-[10px] opacity-40 font-black">{task.title.charAt(0).toUpperCase()}</span>}</div><div className="min-w-0"><div className="font-bold text-[var(--theme-text)] truncate">{task.title}</div><div className="text-[11px] opacity-55 mt-1 max-w-[290px] truncate">{task.description || "No description"}</div></div></div></td>
                                    <td className="px-4 py-4"><span className="rounded-full bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] px-2 py-1 text-[10px] font-black uppercase">{task.category}</span></td>
                                    <td className="px-4 py-4 text-right font-bold">{formatCurrency(task.requiredBonus)}</td>
                                    <td className="px-4 py-4 text-right font-bold text-[var(--theme-primary)]">+{formatCurrency(task.reward)}</td>
                                    <td className="px-4 py-4 text-center font-bold">{claimedUsers}</td>
                                    <td className="px-4 py-4 text-center"><button type="button" onClick={() => void handleToggleVipTask(task.id)} className={`rounded-full border px-2.5 py-1 text-[10px] font-black cursor-pointer ${task.active === false ? "border-[var(--theme-card-border)] opacity-55" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"}`}>{task.active === false ? "INACTIVE" : "ACTIVE"}</button></td>
                                    <td className="px-4 py-4 text-right">
                                      <div className="relative inline-flex">
                                        <button
                                          type="button"
                                          onClick={() => setOpenVipTaskMenuId((currentId) => currentId === task.id ? null : task.id)}
                                          aria-label={`Actions for ${task.title}`}
                                          aria-haspopup="menu"
                                          aria-expanded={openVipTaskMenuId === task.id}
                                          className="inline-flex p-2 rounded-lg text-[var(--theme-text)] opacity-65 hover:opacity-100 hover:bg-[var(--theme-bg)] cursor-pointer"
                                        >
                                          <MoreVertical className="w-4 h-4" />
                                        </button>
                                        {openVipTaskMenuId === task.id && (
                                          <div role="menu" className="absolute right-0 top-full mt-2 z-30 min-w-32 rounded-[var(--theme-radius)] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] p-1 shadow-xl text-left">
                                            <button type="button" role="menuitem" onClick={() => handleOpenVipTaskEditor(task)} className="w-full flex items-center gap-2 rounded-[calc(var(--theme-radius)-2px)] px-3 py-2 text-xs font-bold hover:bg-[var(--theme-bg)] cursor-pointer">
                                              <Edit className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
                                              Edit
                                            </button>
                                            <button type="button" role="menuitem" onClick={() => { setOpenVipTaskMenuId(null); void handleRemoveVipTask(task.id); }} className="w-full flex items-center gap-2 rounded-[calc(var(--theme-radius)-2px)] px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-500/10 cursor-pointer">
                                              <Trash2 className="w-3.5 h-3.5" />
                                              Delete
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {getVipTasks().length === 0 && <div className="p-10 text-center text-xs opacity-60">No milestones published. Create one to make it available to users.</div>}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end sticky bottom-6 z-10 pt-4">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="btn-3d-primary text-white px-8 py-3.5 rounded-[var(--theme-radius)] text-sm font-black shadow-xl flex items-center gap-2 transition-all cursor-pointer active:translate-y-1 disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Save className="w-4 h-4 text-white" />}
                      Save Configuration
                    </button>
                  </div>
                </form>
              )}

              <AnimatePresence>
                {isVipTaskModalOpen && (
                  <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsVipTaskModalOpen(false)} className="absolute inset-0 bg-black/70 backdrop-blur-xs" />
                    <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} className="relative w-full max-w-lg theme-card bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] shadow-2xl overflow-hidden text-[var(--theme-text)]">
                      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--theme-card-border)]">
                        <div><h3 className="text-base font-black">{editingVipTaskId ? "Edit milestone" : "Create milestone"}</h3><p className="text-xs opacity-60 mt-1">{editingVipTaskId ? "Update the reward, category, art, metric, or requirement." : "Publish a one-shot reward that unlocks from a real operator event."}</p></div>
                        <button type="button" onClick={() => setIsVipTaskModalOpen(false)} className="p-2 rounded-full hover:bg-[var(--theme-bg)] cursor-pointer opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button>
                      </div>
                      <form onSubmit={(event) => { event.preventDefault(); void handleAddVipTask(); }} className="p-5 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <label className="text-xs font-bold uppercase tracking-wider opacity-75">Task title
                            <input type="text" required value={vipTaskTitle} onChange={(event) => setVipTaskTitle(event.target.value)} placeholder="e.g. Bronze bonus run" className="theme-input w-full px-3 py-2.5 text-sm mt-1.5" />
                          </label>
                          <label className="text-xs font-bold uppercase tracking-wider opacity-75">Milestone tier
                            <div className="flex gap-2 mt-1.5">
                              <select required value={vipTaskCategory} onChange={(event) => setVipTaskCategory(event.target.value)} className="theme-input min-w-0 flex-1 px-3 py-2.5 text-sm">
                                <option value="" disabled>Select category</option>
                                {getVipTaskCategories().map((category) => <option key={category} value={category}>{category}</option>)}
                              </select>
                              <button type="button" onClick={() => setIsVipCategoryModalOpen(true)} className="btn-3d-secondary px-2.5 cursor-pointer" title="Create category"><Plus className="w-4 h-4" /></button>
                            </div>
                          </label>
                        </div>
                        <label className="text-xs font-bold uppercase tracking-wider opacity-75">Description
                          <textarea value={vipTaskDescription} onChange={(event) => setVipTaskDescription(event.target.value)} placeholder="Explain what this reward unlocks." rows={3} className="theme-input w-full px-3 py-2.5 text-sm mt-1.5 resize-none" />
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <label className="text-xs font-bold uppercase tracking-wider opacity-75">Unlocks from
                            <select value={vipTaskMetric} onChange={(event) => setVipTaskMetric(event.target.value)} className="theme-input w-full px-3 py-2.5 text-sm mt-1.5">
                              <option value="operator_points">Operator lifetime points</option>
                              <option value="runs_started">Runs started</option>
                              <option value="active_runs">Active runs</option>
                              <option value="completed_runs">Completed runs</option>
                              <option value="streak_days">Check-in streak (days)</option>
                              <option value="lifetime_yield">Lifetime run yield ({currency})</option>
                            </select>
                          </label>
                          <label className="text-xs font-bold uppercase tracking-wider opacity-75">Requirement {(vipTaskMetric === "operator_points" || vipTaskMetric === "lifetime_yield") ? `(${currency})` : vipTaskMetric === "streak_days" ? "(days)" : "(runs)"}
                            <input type="text" inputMode="numeric" required value={vipTaskRequiredBonus || ""} onChange={(event) => setVipTaskRequiredBonus(Number(event.target.value) || 0)} placeholder={vipTaskMetric === "streak_days" ? "7" : vipTaskMetric === "runs_started" ? "1" : "500000"} className="theme-input w-full px-3 py-2.5 text-sm mt-1.5" />
                          </label>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <label className="text-xs font-bold uppercase tracking-wider opacity-75">Reward ({currency})
                            <input type="text" inputMode="numeric" required value={vipTaskReward || ""} onChange={(event) => setVipTaskReward(Number(event.target.value) || 0)} placeholder="50000" className="theme-input w-full px-3 py-2.5 text-sm mt-1.5" />
                          </label>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-xs font-bold uppercase tracking-wider opacity-75 block">Milestone art</span>
                          <div className="flex gap-3 items-center">
                            <input
                              type="text"
                              value={vipTaskImageUrl}
                              onChange={(event) => setVipTaskImageUrl(event.target.value)}
                              placeholder="https://… or /uploads/…"
                              className="theme-input min-w-0 flex-1 px-3 py-2.5 text-sm font-mono"
                            />
                            <div className="w-10 h-10 rounded-lg bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] overflow-hidden shrink-0 flex items-center justify-center">
                              {vipTaskImageUrl ? (
                                <img src={fixGitHubImageUrl(vipTaskImageUrl)} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[10px] text-slate-400">N/A</span>
                              )}
                            </div>
                          </div>
                          <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[11px] font-bold text-[var(--theme-text)] transition-all active:scale-[0.97] w-fit cursor-pointer hover:border-[var(--theme-primary)]`}>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="hidden"
                              onChange={handleVipTaskImageFile}
                            />
                            Upload from disk (max 2 MB)
                          </label>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                          <button type="button" onClick={() => setIsVipTaskModalOpen(false)} className="px-4 py-2.5 text-xs font-bold opacity-70 hover:opacity-100 cursor-pointer">Cancel</button>
                          <button type="submit" disabled={isLoading || getVipTaskCategories().length === 0} className="btn-3d-primary text-white px-4 py-2.5 text-xs font-black flex items-center gap-2 cursor-pointer disabled:opacity-50"><Save className="w-4 h-4" />{editingVipTaskId ? "Save changes" : "Publish task"}</button>
                        </div>
                      </form>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {isVipCategoryModalOpen && (
                  <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsVipCategoryModalOpen(false)} className="absolute inset-0 bg-black/70 backdrop-blur-xs" />
                    <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} className="relative w-full max-w-md theme-card bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] shadow-2xl overflow-hidden text-[var(--theme-text)]">
                      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--theme-card-border)]"><div><h3 className="text-base font-black">Milestone tiers</h3><p className="text-xs opacity-60 mt-1">Create reusable labels for task tiers.</p></div><button type="button" onClick={() => setIsVipCategoryModalOpen(false)} className="p-2 rounded-full hover:bg-[var(--theme-bg)] cursor-pointer opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button></div>
                      <div className="p-5 space-y-4">
                        <div className="flex gap-2"><input type="text" value={newVipCategory} onChange={(event) => setNewVipCategory(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void handleAddVipCategory(); } }} placeholder="e.g. Bronze" className="theme-input min-w-0 flex-1 px-3 py-2.5 text-sm" /><button type="button" onClick={() => void handleAddVipCategory()} disabled={isLoading} className="btn-3d-primary text-white px-3.5 text-xs font-black cursor-pointer disabled:opacity-50"><Plus className="w-4 h-4" /></button></div>
                        <div className="space-y-2 max-h-56 overflow-y-auto">{getVipTaskCategories().length === 0 ? <p className="text-xs opacity-60 text-center py-5">No categories yet. Add your first tier above.</p> : getVipTaskCategories().map((category) => <div key={category} className="flex items-center justify-between gap-3 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] px-3 py-2.5"><span className="text-sm font-bold">{category}</span><button type="button" onClick={() => void handleRemoveVipCategory(category)} className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button></div>)}</div>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              {/* SUBTAB: GIFT CODES */}
                  {configSubTab === "giftcodes" && (
                    <div className="space-y-6 py-4 animate-in fade-in duration-200">
                      {/* Subtab Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h3 className="text-base font-bold text-[var(--theme-text)] flex items-center gap-2">
                            <Gift className="w-5 h-5 text-[var(--theme-primary)]" />
                            Manage Gift Codes
                          </h3>
                          <p className="text-xs text-[var(--theme-text)] opacity-70 mt-1">Generate and distribute bonus gift codes with precise custom expirations.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setNewGiftCode("");
                            setNewGiftCodeAmount(5000);
                            setNewGiftCodeMax(100);
                            const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
                            setNewGiftCodeExpiryDateTime(d.toISOString().slice(0, 16));
                            setIsCreateGiftModalOpen(true);
                          }}
                          className="btn-3d-primary text-white font-extrabold text-xs px-4 py-2.5 rounded-[var(--theme-radius)] transition-all shadow-md active:translate-y-1 flex items-center gap-2 cursor-pointer shrink-0"
                        >
                          <Plus className="w-4 h-4" />
                          Create Gift Code
                        </button>
                      </div>

                      {/* Gift Code Folders Grid */}
                      {giftCodesList.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-dashed border-[var(--theme-card-border)] text-center">
                          <Gift className="w-8 h-8 text-[var(--theme-text)] opacity-40 mb-2 stroke-1" />
                          <p className="text-xs text-[var(--theme-text)] opacity-60">No active gift folders. Click the button above to launch one.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                          {giftCodesList.map((gc: any) => {
                            const isExpired = new Date(gc.expiryDate).getTime() < Date.now();
                            const isActive = gc.status === "active" && !isExpired;
                            return (
                              <motion.div
                                key={gc.id}
                                onClick={() => {
                                  setSelectedGiftCode(gc);
                                  setIsDeleteGiftConfirmOpen(false);
                                }}
                                whileHover={{ y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                className="bg-[var(--theme-card-bg)] p-4 rounded-[var(--theme-radius)] border border-[var(--theme-card-border)] hover:border-[var(--theme-primary)] cursor-pointer transition-all duration-200 relative shadow-md flex flex-col justify-between min-h-[120px] overflow-hidden group select-none"
                              >
                                {/* Folder Tab Design Accent */}
                                <div className="absolute -top-[1px] left-4 h-[3px] w-12 bg-amber-500 rounded-b-md shadow-sm group-hover:bg-amber-400 transition-colors" />
                                
                                <div className="flex justify-between items-start">
                                  <div className="p-2 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] group-hover:border-[var(--theme-primary)] transition-colors">
                                    <Gift className={`w-4 h-4 ${isActive ? 'text-[var(--theme-primary)]' : 'text-[var(--theme-text)] opacity-40'}`} />
                                  </div>
                                  <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                                </div>

                                <div className="mt-3">
                                  <h5 className="text-xs font-bold text-[var(--theme-text)] tracking-wider font-mono truncate uppercase">
                                    {gc.code}
                                  </h5>
                                  <div className="text-[12px] text-[var(--theme-text)] opacity-70 font-mono mt-1.5 flex items-center justify-between gap-1 border-t border-[var(--theme-card-border)] pt-1.5">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3 text-[var(--theme-text)] opacity-50 shrink-0" />
                                      <span>Timer:</span>
                                    </span>
                                    <GiftCountdown expiryDate={gc.expiryDate} />
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      )}

                      {/* MODAL 1: Create Gift Code */}
                      <AnimatePresence>
                        {isCreateGiftModalOpen && (
                          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                            {/* Backdrop with backdrop blur */}
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              onClick={() => {
                                if (!isCreatingGiftCode) setIsCreateGiftModalOpen(false);
                              }}
                              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            />

                            {/* Modal Container */}
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: 15 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: 15 }}
                              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                              className="bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)] rounded-[var(--theme-radius)] p-6 w-full max-w-md relative z-10 shadow-2xl overflow-hidden"
                            >
                              {/* Header */}
                              <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center gap-2.5">
                                  <div className="p-2 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] text-[var(--theme-primary)]">
                                    <Gift className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-extrabold text-[var(--theme-text)]">Create Gift Code</h4>
                                    <p className="text-[11px] text-[var(--theme-text)] opacity-70 mt-0.5">Define name, values and exact expiration date.</p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setIsCreateGiftModalOpen(false)}
                                  disabled={isCreatingGiftCode}
                                  className="p-1 text-[var(--theme-text)] opacity-60 hover:opacity-100 hover:bg-[var(--theme-bg)] rounded-lg transition-colors cursor-pointer"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>

                              {/* Form */}
                              <form onSubmit={handleCreateGiftCode} className="space-y-4">
                                <div>
                                  <label className="block text-xs font-bold text-[var(--theme-text)] opacity-80 mb-1.5 uppercase tracking-wider">Code Name</label>
                                  <input
                                    type="text"
                                    value={newGiftCode}
                                    onChange={(e) => setNewGiftCode(e.target.value)}
                                    placeholder="e.g. SPECIAL777"
                                    required
                                    disabled={isCreatingGiftCode}
                                    className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-primary)] transition-colors uppercase font-mono"
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-xs font-bold text-[var(--theme-text)] opacity-80 mb-1.5 uppercase tracking-wider">Reward Amount ({currency})</label>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={newGiftCodeAmount}
                                      onChange={(e) => setNewGiftCodeAmount(Number(e.target.value))}
                                      min={1}
                                      required
                                      disabled={isCreatingGiftCode}
                                      className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-primary)] transition-colors"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-[var(--theme-text)] opacity-80 mb-1.5 uppercase tracking-wider">Max Claims</label>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={newGiftCodeMax}
                                      onChange={(e) => setNewGiftCodeMax(Number(e.target.value))}
                                      min={1}
                                      required
                                      disabled={isCreatingGiftCode}
                                      className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-primary)] transition-colors"
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-xs font-bold text-[var(--theme-text)] opacity-80 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
                                    Expiration Date & Time
                                  </label>
                                  <input
                                    type="datetime-local"
                                    value={newGiftCodeExpiryDateTime}
                                    onChange={(e) => setNewGiftCodeExpiryDateTime(e.target.value)}
                                    required
                                    disabled={isCreatingGiftCode}
                                    className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-primary)] transition-colors"
                                  />
                                </div>

                                {/* Actions */}
                                <div className="flex gap-3 justify-end pt-4 border-t border-[var(--theme-card-border)] mt-6">
                                  <button
                                    type="button"
                                    onClick={() => setIsCreateGiftModalOpen(false)}
                                    disabled={isCreatingGiftCode}
                                    className="px-4 py-2 text-[var(--theme-text)] opacity-70 hover:opacity-100 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={isCreatingGiftCode}
                                    className="btn-3d-primary text-white font-extrabold text-xs px-5 py-2.5 rounded-[var(--theme-radius)] shadow-md transition-all active:translate-y-1 cursor-pointer disabled:opacity-50 flex items-center gap-2"
                                  >
                                    {isCreatingGiftCode ? (
                                      <>
                                        <Loader2 className="animate-spin w-3.5 h-3.5" />
                                        Creating...
                                      </>
                                    ) : (
                                      "Deploy Code"
                                    )}
                                  </button>
                                </div>
                              </form>
                            </motion.div>
                          </div>
                        )}
                      </AnimatePresence>

                      {/* MODAL 2: View Gift Code Details & Inspector */}
                      <AnimatePresence>
                        {selectedGiftCode && (
                          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                            {/* Backdrop with backdrop blur */}
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              onClick={() => {
                                if (!isDeletingGiftCode) setSelectedGiftCode(null);
                              }}
                              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            />

                            {/* Modal Container */}
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: 15 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: 15 }}
                              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                              className="bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)] rounded-[var(--theme-radius)] p-6 w-full max-w-md relative z-10 shadow-2xl overflow-hidden"
                            >
                              {/* Header */}
                              <div className="flex justify-between items-start mb-5">
                                <div className="flex items-center gap-2.5">
                                  <div className="p-2 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] text-[var(--theme-primary)]">
                                    <Folder className="w-5 h-5 fill-[var(--theme-primary)]/10" />
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-bold text-[var(--theme-text)] flex items-center gap-1.5 uppercase font-mono tracking-wider">
                                      {selectedGiftCode.code}
                                    </h4>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setSelectedGiftCode(null)}
                                  disabled={isDeletingGiftCode}
                                  className="p-1 text-[var(--theme-text)] opacity-60 hover:opacity-100 hover:bg-[var(--theme-bg)] rounded-lg transition-colors cursor-pointer"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>

                              {/* Inner Content */}
                              <div className="space-y-4">
                                {/* Code Copy Row */}
                                <div className="flex items-center justify-between p-2.5 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)]/55">
                                  <span className="text-xs font-mono font-bold text-[var(--theme-text)] pl-1">{selectedGiftCode.code}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(selectedGiftCode.code);
                                      toast.success("Code copied to clipboard!");
                                    }}
                                    className="p-1.5 hover:bg-[var(--theme-card-bg)] text-[var(--theme-text)] opacity-70 hover:opacity-100 rounded-lg transition-all cursor-pointer"
                                    title="Copy Code"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                {/* Information stats list */}
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="p-3 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)]/30 rounded-[var(--theme-radius)]">
                                    <span className="text-[12px] text-[var(--theme-text)] opacity-60 block mb-0.5">Bonus Amount</span>
                                    <span className="text-sm font-bold text-[var(--theme-text)]">{formatCurrency(selectedGiftCode.amount)}</span>
                                  </div>
                                  <div className="p-3 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)]/30 rounded-[var(--theme-radius)]">
                                    <span className="text-[12px] text-[var(--theme-text)] opacity-60 block mb-0.5">Folder Status</span>
                                    <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 uppercase ${
                                      selectedGiftCode.status === 'active' && new Date(selectedGiftCode.expiryDate).getTime() > Date.now()
                                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                        : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                                    }`}>
                                      {selectedGiftCode.status === 'active' && new Date(selectedGiftCode.expiryDate).getTime() > Date.now() ? 'active' : 'expired'}
                                    </span>
                                  </div>
                                </div>

                                {/* Live Countdown row */}
                                <div className="space-y-1 bg-[var(--theme-bg)] p-3.5 rounded-[var(--theme-radius)] border border-[var(--theme-card-border)]/40">
                                  <div className="flex justify-between items-center text-[11px]">
                                    <span className="text-[var(--theme-text)] opacity-70 font-medium">Time Remaining:</span>
                                    <GiftCountdown expiryDate={selectedGiftCode.expiryDate} />
                                  </div>
                                </div>

                                {/* Claims progress bar */}
                                <div className="p-3.5 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)]/30 rounded-[var(--theme-radius)] space-y-2">
                                  <div className="flex justify-between items-center text-xs">
                                    <span className="text-[var(--theme-text)] opacity-70 font-medium">Claims Redeemed</span>
                                    <span className="font-mono font-semibold text-[var(--theme-text)]">
                                      {selectedGiftCode.currentRedemptions} / {selectedGiftCode.maxRedemptions}
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full bg-[var(--theme-card-bg)] rounded-full overflow-hidden border border-[var(--theme-card-border)]/20">
                                    <div
                                      className="h-full bg-[var(--theme-primary)] transition-all duration-300"
                                      style={{
                                        width: `${Math.min(
                                          100,
                                          (selectedGiftCode.currentRedemptions / selectedGiftCode.maxRedemptions) * 100
                                        )}%`,
                                      }}
                                    />
                                  </div>
                                </div>

                                {/* Full Date & Time detail */}
                                <div className="space-y-1 bg-[var(--theme-bg)] p-3 rounded-[var(--theme-radius)] border border-[var(--theme-card-border)]/30">
                                  <div className="flex justify-between items-center text-[11px]">
                                    <span className="text-[var(--theme-text)] opacity-50">Scheduled Expiry:</span>
                                    <span className="text-[var(--theme-text)] font-mono font-medium">
                                      {new Date(selectedGiftCode.expiryDate).toLocaleString()}
                                    </span>
                                  </div>
                                </div>

                                {/* Deletion/Revocation Options with Confirmation inside */}
                                <div className="border-t border-[var(--theme-card-border)] pt-4 mt-6">
                                  {isDeleteGiftConfirmOpen ? (
                                    <div className="bg-rose-500/10 border border-rose-500/25 p-3.5 rounded-[var(--theme-radius)] space-y-3">
                                      <p className="text-xs text-rose-500 leading-relaxed font-medium">
                                        Are you absolutely sure? This will delete the gift code permanently and end any future claims.
                                      </p>
                                      <div className="flex justify-end gap-2.5">
                                        <button
                                          type="button"
                                          disabled={isDeletingGiftCode}
                                          onClick={() => setIsDeleteGiftConfirmOpen(false)}
                                          className="px-3 py-1.5 theme-btn-secondary text-xs"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          disabled={isDeletingGiftCode}
                                          onClick={() => handleDeleteGiftCode(selectedGiftCode.id)}
                                          className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-[var(--theme-radius)] text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                                        >
                                          {isDeletingGiftCode ? (
                                            <>
                                              <Loader2 className="animate-spin w-3 h-3" />
                                              Deleting...
                                            </>
                                          ) : (
                                            "Confirm Delete"
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex justify-between items-center">
                                      <span className="text-[12px] text-[var(--theme-text)] opacity-50">Deleted codes cannot be redeemed.</span>
                                      <button
                                        type="button"
                                        onClick={() => setIsDeleteGiftConfirmOpen(true)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/15 text-rose-500 hover:bg-rose-500/25 border border-rose-500/25 rounded-[var(--theme-radius)] text-xs font-semibold transition-colors cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Delete Gift Code
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          </div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {(configSubTab === "checkin" || configSubTab === "gateways") && (
                    <form onSubmit={handleSaveSiteConfig} className="space-y-0">
                      {/* SUBTAB: CHECKIN */}
                  {configSubTab === "checkin" && (
                    <div className="space-y-6 py-4">
                      <div className="flex flex-col md:flex-row md:gap-12">
                        <div className="md:w-1/3 mb-6 md:mb-0 shrink-0">
                          <h3 className="text-sm font-extrabold text-[var(--theme-text)]">Daily Check-in Config</h3>
                          <p className="text-xs text-[var(--theme-text)] opacity-70 mt-2 leading-relaxed">Configure the base bonus amount and increment for consecutive daily check-ins.</p>
                        </div>
                        <div className="flex-1 space-y-6">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider mb-2">Base Bonus ({currency})</label>
                              <input type="text" inputMode="numeric" value={siteConfig.checkinBaseBonus || ""} onChange={e => setSiteConfig({ ...siteConfig, checkinBaseBonus: Number(e.target.value) || 0 })} className="theme-input w-full px-4 py-2.5 text-sm" />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider mb-2">Daily Increment ({currency})</label>
                              <input type="text" inputMode="numeric" value={siteConfig.checkinIncrement || ""} onChange={e => setSiteConfig({ ...siteConfig, checkinIncrement: Number(e.target.value) || 0 })} className="theme-input w-full px-4 py-2.5 text-sm" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUBTAB: GATEWAYS */}
                  {configSubTab === "gateways" && (
                    <div className="space-y-0">
                      {/* Deposit and withdrawal limits */}
                      <div className="flex flex-col md:flex-row md:gap-12 py-4 border-b border-[var(--theme-card-border)]">
                        <div className="md:w-1/3 mb-6 md:mb-0 shrink-0">
                          <h3 className="text-sm font-extrabold text-[var(--theme-text)]">Transaction Limits</h3>
                          <p className="text-xs text-[var(--theme-text)] opacity-70 mt-2 leading-relaxed">
                            These limits are enforced on the server for automatic, manual, and legacy deposit/withdrawal requests. Enter 0 for no maximum.
                          </p>
                        </div>
                        <div className="md:w-2/3 max-w-xl grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">Minimum Deposit ({currency})</label>
                            <input
                              type="number"
                              min="1"
                              value={siteConfig.minimumDeposit ?? 20000}
                              onChange={(e) => setSiteConfig({ ...siteConfig, minimumDeposit: Number(e.target.value) || 0 })}
                              className="theme-input w-full px-4 py-3 text-sm"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">Maximum Deposit ({currency})</label>
                            <input
                              type="number"
                              min="0"
                              value={siteConfig.maximumDeposit ?? 0}
                              onChange={(e) => setSiteConfig({ ...siteConfig, maximumDeposit: Number(e.target.value) || 0 })}
                              className="theme-input w-full px-4 py-3 text-sm"
                              placeholder="0 = no maximum"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">Minimum Withdrawal ({currency})</label>
                            <input
                              type="number"
                              min="1"
                              value={siteConfig.minimumWithdrawal ?? 10000}
                              onChange={(e) => setSiteConfig({ ...siteConfig, minimumWithdrawal: Number(e.target.value) || 0 })}
                              className="theme-input w-full px-4 py-3 text-sm"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">Maximum Withdrawal ({currency})</label>
                            <input
                              type="number"
                              min="0"
                              value={siteConfig.maximumWithdrawal ?? 5000000}
                              onChange={(e) => setSiteConfig({ ...siteConfig, maximumWithdrawal: Number(e.target.value) || 0 })}
                              className="theme-input w-full px-4 py-3 text-sm"
                              placeholder="0 = no maximum"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Fees */}
                      <div className="flex flex-col md:flex-row md:gap-12 py-4">
                        <div className="md:w-1/3 mb-6 md:mb-0 shrink-0">
                          <h3 className="text-sm font-extrabold text-[var(--theme-text)]">Fees</h3>
                          <p className="text-xs text-[var(--theme-text)] opacity-70 mt-2 leading-relaxed">Adjust withdrawal taxes across the platform.</p>
                        </div>
                        <div className="md:w-2/3 max-w-xl space-y-6">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">Global Withdrawal Fee (%)</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              step="0.1"
                              min="0"
                              max="100"
                              value={siteConfig.withdrawFee !== undefined ? siteConfig.withdrawFee : "0"}
                              onChange={(e) => setSiteConfig({ ...siteConfig, withdrawFee: parseFloat(e.target.value) || 0 })}
                              className="theme-input w-full px-4 py-3 text-sm"
                              placeholder="e.g. 5"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Transaction Logic */}
                      <div className="flex flex-col md:flex-row md:gap-12 py-4">
                        <div className="md:w-1/3 mb-6 md:mb-0 shrink-0">
                          <h3 className="text-sm font-extrabold text-[var(--theme-text)]">Transaction Modes</h3>
                          <p className="text-xs text-[var(--theme-text)] opacity-70 mt-2 leading-relaxed">Toggle between automated integrations and manual processing workflows for deposits and withdrawals.</p>
                        </div>
                        <div className="md:w-2/3 max-w-xl grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Auto Deposit Toggle */}
                          <div className="theme-card p-4 transition-all flex items-center justify-between cursor-pointer hover:border-[var(--theme-primary)]" onClick={() => setSiteConfig({ ...siteConfig, allowAutoDeposit: siteConfig.allowAutoDeposit === false ? true : false })}>
                            <div>
                              <label className="text-sm font-extrabold text-[var(--theme-text)] block cursor-pointer">Auto Deposits</label>
                              <span className="text-xs text-[var(--theme-text)] opacity-70 mt-0.5 block">API gateway based</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={siteConfig.allowAutoDeposit !== false}
                              readOnly
                              className="w-4 h-4 rounded text-[var(--theme-primary)] border-[var(--theme-card-border)] focus:ring-[var(--theme-primary)] cursor-pointer pointer-events-none"
                            />
                          </div>
                          {/* Manual Deposit Toggle */}
                          <div className="theme-card p-4 transition-all flex items-center justify-between cursor-pointer hover:border-[var(--theme-primary)]" onClick={() => setSiteConfig({ ...siteConfig, allowManualDeposit: siteConfig.allowManualDeposit === true ? false : true })}>
                            <div>
                              <label className="text-sm font-extrabold text-[var(--theme-text)] block cursor-pointer">Manual Deposits</label>
                              <span className="text-xs text-[var(--theme-text)] opacity-70 mt-0.5 block">Peer-to-peer transfers</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={siteConfig.allowManualDeposit === true}
                              readOnly
                              className="w-4 h-4 rounded text-[var(--theme-primary)] border-[var(--theme-card-border)] focus:ring-[var(--theme-primary)] cursor-pointer pointer-events-none"
                            />
                          </div>
                          {/* Auto Withdraw Toggle */}
                          <div className="theme-card p-4 transition-all flex items-center justify-between cursor-pointer hover:border-[var(--theme-primary)]" onClick={() => {
                            const nextAuto = currentWithdrawMode !== "automatic";
                            setSiteConfig({
                              ...siteConfig,
                              allowAutoWithdraw: nextAuto,
                              allowManualWithdraw: nextAuto ? false : true
                            });
                          }}>
                            <div>
                              <label className="text-sm font-extrabold text-[var(--theme-text)] block cursor-pointer">Auto Payouts</label>
                              <span className="text-xs text-[var(--theme-text)] opacity-70 mt-0.5 block">API gateway based</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={currentWithdrawMode === "automatic"}
                              readOnly
                              className="w-4 h-4 rounded text-[var(--theme-primary)] border-[var(--theme-card-border)] focus:ring-[var(--theme-primary)] cursor-pointer pointer-events-none"
                            />
                          </div>
                          {/* Manual Withdraw Toggle */}
                          <div className="theme-card p-4 transition-all flex items-center justify-between cursor-pointer hover:border-[var(--theme-primary)]" onClick={() => {
                            const nextManual = currentWithdrawMode !== "manual";
                            setSiteConfig({
                              ...siteConfig,
                              allowManualWithdraw: nextManual,
                              allowAutoWithdraw: nextManual ? false : true
                            });
                          }}>
                            <div>
                              <label className="text-sm font-extrabold text-[var(--theme-text)] block cursor-pointer">Manual Payouts</label>
                              <span className="text-xs text-[var(--theme-text)] opacity-70 mt-0.5 block">Peer-to-peer transfers</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={currentWithdrawMode === "manual"}
                              readOnly
                              className="w-4 h-4 rounded text-[var(--theme-primary)] border-[var(--theme-card-border)] focus:ring-[var(--theme-primary)] cursor-pointer pointer-events-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Manual Account Details */}
                      <div className="flex flex-col md:flex-row md:gap-12 py-8 border-y border-[var(--theme-card-border)] mb-6">
                        <div className="md:w-1/3 mb-6 md:mb-0 shrink-0">
                          <h3 className="text-sm font-extrabold text-[var(--theme-text)]">Manual Gateway Accounts</h3>
                          <p className="text-xs text-[var(--theme-text)] opacity-70 mt-2 leading-relaxed">Configure the MTN, Airtel, and USDT receiving details displayed to users during manual deposits.</p>
                        </div>
                        <div className="md:w-2/3 max-w-xl space-y-6">
                          {/* MTN Receiver */}
                          <div className="theme-card p-5 space-y-4">
                            <h4 className="text-xs font-black text-amber-500 uppercase tracking-widest">MTN Mobile Money</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">Receiver Phone</label>
                                <input
                                  type="text"
                                  value={siteConfig.mtnReceiverPhone || ""}
                                  onChange={(e) => setSiteConfig({ ...siteConfig, mtnReceiverPhone: e.target.value })}
                                  className="theme-input w-full px-4 py-3 text-sm focus:border-yellow-500"
                                  placeholder="e.g. 0771234567"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">Account Name</label>
                                <input
                                  type="text"
                                  value={siteConfig.mtnReceiverName || ""}
                                  onChange={(e) => setSiteConfig({ ...siteConfig, mtnReceiverName: e.target.value })}
                                  className="theme-input w-full px-4 py-3 text-sm focus:border-yellow-500"
                                  placeholder="e.g. SYSTEM NODE MTN"
                                />
                              </div>
                              <div className="space-y-2 col-span-1 sm:col-span-2">
                                <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">MTN Logo URL</label>
                                <input
                                  type="text"
                                  value={siteConfig.mtnLogoUrl || ""}
                                  onChange={(e) => setSiteConfig({ ...siteConfig, mtnLogoUrl: e.target.value })}
                                  className="theme-input w-full px-4 py-3 text-sm focus:border-yellow-500"
                                  placeholder="https://example.com/mtn-logo.png"
                                />
                              </div>
                            </div>
                          </div>
                          
                          {/* Airtel Receiver */}
                          <div className="theme-card p-5 space-y-4">
                            <h4 className="text-xs font-black text-rose-500 uppercase tracking-widest">Airtel Money</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">Receiver Phone</label>
                                <input
                                  type="text"
                                  value={siteConfig.airtelReceiverPhone || ""}
                                  onChange={(e) => setSiteConfig({ ...siteConfig, airtelReceiverPhone: e.target.value })}
                                  className="theme-input w-full px-4 py-3 text-sm focus:border-rose-500"
                                  placeholder="e.g. 0701234567"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">Account Name</label>
                                <input
                                  type="text"
                                  value={siteConfig.airtelReceiverName || ""}
                                  onChange={(e) => setSiteConfig({ ...siteConfig, airtelReceiverName: e.target.value })}
                                  className="theme-input w-full px-4 py-3 text-sm focus:border-rose-500"
                                  placeholder="e.g. SYSTEM NODE AIRTEL"
                                />
                              </div>
                              <div className="space-y-2 col-span-1 sm:col-span-2">
                                <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">Airtel Logo URL</label>
                                <input
                                  type="text"
                                  value={siteConfig.airtelLogoUrl || ""}
                                  onChange={(e) => setSiteConfig({ ...siteConfig, airtelLogoUrl: e.target.value })}
                                  className="theme-input w-full px-4 py-3 text-sm focus:border-rose-500"
                                  placeholder="https://example.com/airtel-logo.png"
                                />
                              </div>
                            </div>
                          </div>

                          {/* USDT Receiver */}
                          <div className="theme-card p-5 space-y-4">
                            <h4 className="text-xs font-black text-teal-500 uppercase tracking-widest">USDT Cryptocurrency</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-2 col-span-1 sm:col-span-2">
                                <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">Wallet Address</label>
                                <input
                                  type="text"
                                  value={siteConfig.usdtAddress || ""}
                                  onChange={(e) => setSiteConfig({ ...siteConfig, usdtAddress: e.target.value })}
                                  className="theme-input w-full px-4 py-3 text-sm focus:border-teal-500"
                                  placeholder="e.g. T..."
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">Network Type</label>
                                <input
                                  type="text"
                                  value={siteConfig.usdtNetwork || ""}
                                  onChange={(e) => setSiteConfig({ ...siteConfig, usdtNetwork: e.target.value })}
                                  className="theme-input w-full px-4 py-3 text-sm focus:border-teal-500"
                                  placeholder="e.g. TRC20"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">USDT to {currency} Rate</label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={siteConfig.usdtRate || 3700}
                                  onChange={(e) => setSiteConfig({ ...siteConfig, usdtRate: Number(e.target.value) })}
                                  className="theme-input w-full px-4 py-3 text-sm focus:border-teal-500"
                                  placeholder="e.g. 3700"
                                />
                              </div>
                              <div className="space-y-2 col-span-1 sm:col-span-2">
                                <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">USDT Logo URL (For USDT contexts)</label>
                                <div className="flex gap-4 items-center">
                                  <input
                                    type="text"
                                    value={siteConfig.usdtLogoUrl || ""}
                                    onChange={(e) => setSiteConfig({ ...siteConfig, usdtLogoUrl: e.target.value })}
                                    className="theme-input flex-1 px-4 py-3 text-sm font-mono focus:border-teal-500"
                                    placeholder="https://example.com/usdt-logo.png"
                                  />
                                  <div className="w-12 h-12 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] flex items-center justify-center p-1.5 shrink-0 shadow-sm" title="USDT Logo Preview">
                                    {siteConfig.usdtLogoUrl ? (
                                      <img src={siteConfig.usdtLogoUrl} alt="USDT Logo" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                                    ) : (
                                      <span className="text-[12px] text-[var(--theme-text)] opacity-60 font-mono uppercase font-black">Tether</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="space-y-2 col-span-1 sm:col-span-2">
                                <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-wider block">USDT QR Code URL</label>
                                <div className="flex gap-4 items-center">
                                  <input
                                    type="text"
                                    value={siteConfig.usdtQrUrl || ""}
                                    onChange={(e) => setSiteConfig({ ...siteConfig, usdtQrUrl: e.target.value })}
                                    className="theme-input flex-1 px-4 py-3 text-sm font-mono focus:border-teal-500"
                                    placeholder="https://example.com/qr.png"
                                  />
                                  <div className="w-12 h-12 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] flex items-center justify-center p-1.5 shrink-0 shadow-sm" title="QR Code Preview">
                                    {siteConfig.usdtQrUrl ? (
                                      <img src={siteConfig.usdtQrUrl} alt="QR Code" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                                    ) : (
                                      <span className="text-[12px] text-[var(--theme-text)] opacity-60 font-mono uppercase font-black">QR</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end sticky bottom-6 z-10 pt-4">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="btn-3d-primary text-white px-8 py-3.5 rounded-[var(--theme-radius)] text-sm font-black shadow-xl flex items-center gap-2 transition-all cursor-pointer active:translate-y-1 disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Save className="w-4 h-4 text-white" />}
                      Save Configuration
                    </button>
                  </div>
                </form>
              )}
              </div>
            )}

            {/* TAB: PROFILE */}
            {activeAdminTab === "profile" && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
                <form onSubmit={handleSaveSiteConfig} className="theme-card p-6 sm:p-8 max-w-xl space-y-6">
                  <div>
                    <h3 className="text-base font-black text-[var(--theme-text)]">Admin Profile Credentials</h3>
                    <p className="text-xs text-[var(--theme-text)] opacity-70 mt-1">Manage system password and override standard administrator login details.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[var(--theme-text)] opacity-70 uppercase tracking-widest block">Role</label>
                      <input type="text" disabled value="System Administrator" className="theme-input w-full px-4 py-3 text-sm text-[var(--theme-text)] opacity-50 font-sans cursor-not-allowed" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-widest block">Admin Username</label>
                      <input
                        type="text"
                        value={siteConfig.adminUsername}
                        onChange={(e) => setSiteConfig({ ...siteConfig, adminUsername: e.target.value })}
                        className="theme-input w-full px-4 py-3 text-sm font-sans"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-widest block">Admin Phone Number</label>
                      <input
                        type="text"
                        value={siteConfig.adminPhone}
                        onChange={(e) => setSiteConfig({ ...siteConfig, adminPhone: e.target.value })}
                        className="theme-input w-full px-4 py-3 text-sm font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[var(--theme-text)] opacity-80 uppercase tracking-widest block">Admin Password</label>
                      <input
                        type="password"
                        value={siteConfig.adminPass}
                        onChange={(e) => setSiteConfig({ ...siteConfig, adminPass: e.target.value })}
                        className="theme-input w-full px-4 py-3 text-sm font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex justify-start pt-2">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="btn-3d-primary text-white px-8 py-3.5 rounded-[var(--theme-radius)] text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer active:translate-y-1 disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Save className="w-4 h-4 text-white" />}
                      Save Profile Settings
                    </button>
                  </div>
                </form>
              </div>
            )}
            
          </div>
        </div>
      </main>

      {/* Editor Modals */}
      <AnimatePresence>
        {isCreatingAnnx && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => { setIsCreatingAnnx(false); setEditingAnnx(null); }}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative w-full max-w-lg bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)] rounded-[var(--theme-radius)] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="px-6 py-4 border-b border-[var(--theme-card-border)] flex justify-between items-center bg-[var(--theme-bg)]">
                <h3 className="text-lg font-extrabold text-[var(--theme-text)]">
                  {editingAnnx ? (editingAnnx.category === "news" ? "Edit News Item" : "Edit Announcement") : (annCategory === "news" ? "Create News Item" : "Create Announcement")}
                </h3>
                <button onClick={() => { setIsCreatingAnnx(false); setEditingAnnx(null); }} className="text-[var(--theme-text)] opacity-60 hover:opacity-100 transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                <form id="ann-form" onSubmit={handleSaveAnnouncement} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-[var(--theme-text)] opacity-80 font-bold uppercase tracking-wider block">Title</label>
                    <input type="text" required value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} className="w-full px-3.5 py-2.5 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-primary)] transition-colors" placeholder="e.g. System Maintenance" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-[var(--theme-text)] opacity-80 font-bold uppercase tracking-wider block">Message</label>
                    <textarea required value={annMessage} onChange={(e) => setAnnMessage(e.target.value)} rows={4} className="w-full px-3.5 py-2.5 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-primary)] transition-colors resize-none" placeholder="Details of the announcement..." />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-[var(--theme-text)] opacity-80 font-bold uppercase tracking-wider block">Category</label>
                    <select value={annCategory} onChange={(e) => setAnnCategory(e.target.value)} className="w-full px-3.5 py-2.5 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-primary)] transition-colors">
                      <option value="announcement">Announcement (Alerts)</option>
                      <option value="news">News (Dashboard Carousel)</option>
                    </select>
                  </div>
                  {annCategory === "news" && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs text-[var(--theme-text)] opacity-80 font-bold uppercase tracking-wider block">Image URL (For News)</label>
                        <input type="url" value={annImageUrl} onChange={(e) => setAnnImageUrl(e.target.value)} className="w-full px-3.5 py-2.5 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-primary)] transition-colors" placeholder="https://images.unsplash.com/..." />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-[var(--theme-text)] opacity-80 font-bold uppercase tracking-wider block">Tag (For News)</label>
                        <input type="text" value={annTag} onChange={(e) => setAnnTag(e.target.value)} className="w-full px-3.5 py-2.5 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-primary)] transition-colors" placeholder="e.g. GRID OPTIMIZATION" />
                      </div>
                      <div className="flex items-center gap-2 pt-1 pb-1">
                        <input
                          type="checkbox"
                          id="alert-users-news"
                          checked={annAlertUsers}
                          onChange={(e) => setAnnAlertUsers(e.target.checked)}
                          className="w-4 h-4 rounded bg-[var(--theme-bg)] border-[var(--theme-card-border)] text-[var(--theme-primary)] focus:ring-0 focus:ring-offset-0"
                        />
                        <label htmlFor="alert-users-news" className="text-xs text-[var(--theme-text)] opacity-80 font-bold cursor-pointer select-none">
                          Alert Users (Broadcast to User Alerts history)
                        </label>
                      </div>
                    </>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-xs text-[var(--theme-text)] opacity-80 font-bold uppercase tracking-wider block">Read More URL (optional)</label>
                    <input type="url" value={annLink} onChange={(e) => setAnnLink(e.target.value)} className="w-full px-3.5 py-2.5 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-primary)] transition-colors" placeholder="https://..." />
                  </div>
                </form>
              </div>
              <div className="px-6 py-4 border-t border-[var(--theme-card-border)] bg-[var(--theme-bg)] flex justify-end gap-3 shrink-0">
                <button type="button" onClick={() => { setIsCreatingAnnx(false); setEditingAnnx(null); }} className="px-4 py-2 text-[var(--theme-text)] opacity-70 hover:opacity-100 text-sm font-bold transition-colors cursor-pointer">Cancel</button>
                <button type="submit" form="ann-form" disabled={isLoading} className="btn-3d-primary text-white font-extrabold text-xs px-6 py-2.5 rounded-[var(--theme-radius)] transition-all shadow-md active:translate-y-1 cursor-pointer disabled:opacity-50 flex items-center gap-2">
                  {isLoading ? <Loader className="w-4 h-4 animate-spin" /> : (editingAnnx ? "Save Changes" : "Publish")}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(isEditingNode || isCreatingNode) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              onClick={() => { setIsEditingNode(null); setIsCreatingNode(false); }}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative w-full max-w-xl bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)] rounded-[var(--theme-radius)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-6 py-4 border-b border-[var(--theme-card-border)] flex justify-between items-center bg-[var(--theme-bg)]">
                <div>
                  <h3 className="text-lg font-extrabold text-[var(--theme-text)]">{isCreatingNode ? "Create Product" : "Edit Product"}</h3>
                  {!isCreatingNode && <p className="text-[11px] text-[var(--theme-text)] opacity-60 mt-1">Changes apply to future rentals; current rentals keep their saved terms.</p>}
                </div>
                <button onClick={() => { setIsEditingNode(null); setIsCreatingNode(false); }} className="text-[var(--theme-text)] opacity-60 hover:opacity-100 transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto">
                <form id="node-form" onSubmit={handleSaveNode} className="space-y-5">
                  <div className="flex flex-col sm:flex-row gap-5">
                    {/* Left Column: Image Preview + URL */}
                    <div className="sm:w-1/3 flex flex-col gap-3">
                      <div className="w-full aspect-square bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] flex items-center justify-center overflow-hidden relative group">
                        {nodeImageUrl ? (
                          <img src={nodeImageUrl} alt="Product Preview" className="w-full h-full object-cover" />
                        ) : (
                          <Cpu className="w-10 h-10 text-[var(--theme-text)] opacity-40" />
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-[var(--theme-card-bg)] p-2 text-center text-[12px] text-[var(--theme-text)] font-bold border-t border-[var(--theme-card-border)]">Product Thumbnail</div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-[var(--theme-text)] font-bold opacity-80 uppercase tracking-wider block">Image URL</label>
                        <input type="text" placeholder="https://..." value={nodeImageUrl} onChange={(e) => setNodeImageUrl(e.target.value)} className="w-full px-3 py-2 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] text-[var(--theme-text)] text-sm focus:border-[var(--theme-primary)] outline-none" />
                      </div>
                    </div>

                    {/* Right Column: Other inputs */}
                    <div className="sm:w-2/3 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs text-[var(--theme-text)] font-bold opacity-80 uppercase tracking-wider block">Product ID</label>
                          <input type="text" required disabled={!isCreatingNode} value={nodeId} onChange={(e) => setNodeId(e.target.value)} className="w-full px-3 py-2 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] text-[var(--theme-text)] text-sm disabled:opacity-50" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs text-[var(--theme-text)] font-bold opacity-80 uppercase tracking-wider block">Name</label>
                          <input type="text" required value={nodeName} onChange={(e) => setNodeName(e.target.value)} className="w-full px-3 py-2 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] text-[var(--theme-text)] text-sm focus:border-[var(--theme-primary)] outline-none" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-[var(--theme-text)] font-bold opacity-80 uppercase tracking-wider block">Category</label>
                            <button
                              type="button"
                              onClick={() => setIsCategoryModalOpen(true)}
                              className="text-[11px] text-[var(--theme-primary)] font-extrabold hover:underline cursor-pointer"
                            >
                              + Manage
                            </button>
                          </div>
                          <select 
                            value={nodeCategory} 
                            onChange={(e) => setNodeCategory(e.target.value)} 
                            className="w-full px-3 py-2 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-primary)]"
                          >
                            {Array.from(new Set([
                              ...(siteConfig?.categories || []),
                              ...catalogItems.map(i => i.category).filter(Boolean),
                              ...(nodeCategory ? [nodeCategory] : [])
                            ])).map(cat => (
                              <option key={cat} value={cat} className="bg-[var(--theme-card-bg)] text-[var(--theme-text)]">{cat}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs text-[var(--theme-text)] font-bold opacity-80 uppercase tracking-wider block">Cost</label>
                          <input type="text" inputMode="numeric" required value={nodeAmount} onChange={(e) => setNodeAmount(parseInt(e.target.value, 10) || 0)} className="w-full px-3 py-2 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] text-[var(--theme-text)] text-sm focus:border-[var(--theme-primary)] outline-none" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs text-[var(--theme-text)] font-bold opacity-80 uppercase tracking-wider block">Daily Profits (%)</label>
                          <input type="text" inputMode="decimal" required value={nodeDailyProfitPct} onChange={(e) => setNodeDailyProfitPct(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] text-[var(--theme-text)] text-sm focus:border-[var(--theme-primary)] outline-none" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs text-[var(--theme-text)] font-bold opacity-80 uppercase tracking-wider block">Duration (Days)</label>
                          <input type="text" inputMode="numeric" required value={nodeDuration} onChange={(e) => setNodeDuration(parseInt(e.target.value, 10) || 0)} className="w-full px-3 py-2 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] text-[var(--theme-text)] text-sm focus:border-[var(--theme-primary)] outline-none" />
                        </div>
                      </div>
                      
                      <div className="bg-[var(--theme-bg)] p-3 rounded-[var(--theme-radius)] border border-[var(--theme-card-border)] space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-[var(--theme-text)] opacity-70">Calculated Daily Profit:</span>
                          <span className="font-bold text-[var(--theme-text)]">{formatCurrency(nodeAmount * (nodeDailyProfitPct / 100))}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-[var(--theme-text)] opacity-70">Total Return ({nodeDuration || 0} days):</span>
                          <span className="font-bold text-[var(--theme-text)]">{formatCurrency(nodeAmount * (nodeDailyProfitPct / 100) * (nodeDuration || 0))}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Toggles Row */}
                  <div className="grid grid-cols-1 gap-3">
                    <label className="flex items-center gap-3 cursor-pointer bg-[var(--theme-bg)] p-3.5 rounded-[var(--theme-radius)] border border-rose-900/40 hover:border-rose-800/80 transition-colors select-none">
                      <input 
                        type="checkbox" 
                        checked={nodeOutOfStock} 
                        onChange={(e) => setNodeOutOfStock(e.target.checked)} 
                        className="w-4 h-4 rounded text-rose-600 bg-[var(--theme-card-bg)] border-[var(--theme-card-border)]" 
                      />
                      <div>
                        <span className="text-xs font-bold text-rose-500 block uppercase tracking-wider">Mark as Out of Stock</span>
                        <span className="text-[11px] text-[var(--theme-text)] opacity-70">Visible to users in catalog but purchase button is blocked</span>
                      </div>
                    </label>
                  </div>
                </form>
              </div>
              <div className="px-6 py-4 border-t border-[var(--theme-card-border)] bg-[var(--theme-bg)] flex justify-end gap-3 shrink-0">
                <button type="button" onClick={() => { setIsEditingNode(null); setIsCreatingNode(false); }} className="px-4 py-2 text-[var(--theme-text)] opacity-70 hover:opacity-100 text-sm font-medium transition-colors cursor-pointer">Cancel</button>
                <button type="submit" form="node-form" disabled={isLoading} className="btn-3d-primary text-white px-5 py-2.5 rounded-[var(--theme-radius)] text-xs font-black transition-all shadow-md active:translate-y-1 disabled:opacity-50 flex items-center gap-2 cursor-pointer">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Save className="w-4 h-4 text-white" />}
                  <span>Save Product</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {userToOverride && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              onClick={() => setUserToOverride(null)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative w-full max-w-sm bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)] rounded-[var(--theme-radius)] shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-[var(--theme-card-border)] bg-[var(--theme-bg)] flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-extrabold text-[var(--theme-text)]">Reset User Password</h3>
                  <p className="text-xs text-[var(--theme-text)] opacity-70 mt-1">For {userToOverride.phone}</p>
                </div>
                <button onClick={() => setUserToOverride(null)} className="text-[var(--theme-text)] opacity-60 hover:opacity-100 transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                <form id="pass-form" onSubmit={handleOverrideUserPassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-[var(--theme-text)] font-bold opacity-80 uppercase tracking-wider block">New Password</label>
                    <input type="text" required value={newOverridePassword} onChange={(e) => setNewOverridePassword(e.target.value)} className="w-full px-3 py-2 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-primary)]" placeholder="e.g. 123456" />
                  </div>
                </form>
              </div>
              <div className="px-6 py-4 border-t border-[var(--theme-card-border)] bg-[var(--theme-bg)] flex justify-end gap-3 shrink-0">
                <button type="button" onClick={() => setUserToOverride(null)} className="px-4 py-2 text-[var(--theme-text)] opacity-70 hover:opacity-100 text-sm font-medium transition-colors cursor-pointer">Cancel</button>
                <button type="submit" form="pass-form" disabled={isLoading} className="btn-3d-primary text-white px-5 py-2.5 rounded-[var(--theme-radius)] text-sm font-black transition-all shadow-md active:translate-y-1 cursor-pointer disabled:opacity-50">
                  Update Password
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {confirmDialog && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              onClick={() => !isLoading && setConfirmDialog(null)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative w-full max-w-sm bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)] rounded-[var(--theme-radius)] shadow-2xl overflow-hidden"
            >
               <div className="px-6 py-4 border-b border-[var(--theme-card-border)] bg-[var(--theme-bg)]">
                 <h3 className="text-lg font-extrabold text-[var(--theme-text)]">{confirmDialog.title}</h3>
               </div>
               <div className="p-6 text-sm text-[var(--theme-text)] leading-relaxed">
                 {confirmDialog.message}
               </div>
               <div className="px-6 py-4 border-t border-[var(--theme-card-border)] bg-[var(--theme-bg)] flex justify-end gap-3 shrink-0">
                  <button type="button" onClick={() => setConfirmDialog(null)} disabled={isLoading} className="px-4 py-2 text-[var(--theme-text)] opacity-70 hover:opacity-100 text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer">Cancel</button>
                  <button type="button" onClick={() => confirmDialog.onConfirm()} disabled={isLoading} className="btn-3d-primary text-white px-5 py-2.5 rounded-[var(--theme-radius)] text-sm font-black transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer active:translate-y-1">
                    {isLoading ? <Loader className="w-4 h-4 animate-spin text-white" /> : "Confirm"}
                  </button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Category Management Dialog */}
      <AnimatePresence>
        {isCategoryModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              onClick={() => setIsCategoryModalOpen(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative w-full max-w-md bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)] rounded-[var(--theme-radius)] shadow-2xl overflow-hidden flex flex-col font-sans"
            >
              <div className="px-6 py-5 border-b border-[var(--theme-card-border)] flex justify-between items-center bg-[var(--theme-bg)]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-[var(--theme-primary)]/10 border border-[var(--theme-primary)]/20 rounded-[var(--theme-radius)] text-[var(--theme-primary)]">
                    <Tags className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-[var(--theme-text)]">Manage Product Categories</h3>
                    <p className="text-[11px] text-[var(--theme-text)] opacity-70 mt-0.5">Add or remove product categories</p>
                  </div>
                </div>
                <button onClick={() => setIsCategoryModalOpen(false)} className="text-[var(--theme-text)] opacity-60 hover:opacity-100 p-1.5 rounded-lg transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Add new category form */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. GS Series, AS Series, U Series"
                    value={newCategoryInput}
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    className="flex-1 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] px-4 py-2.5 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-primary)] transition-colors"
                  />
                  <button
                    onClick={handleAddCategory}
                    disabled={!newCategoryInput.trim() || isLoading}
                    className="btn-3d-primary px-4 py-2.5 text-white font-black text-xs rounded-[var(--theme-radius)] transition-all disabled:opacity-50 flex items-center gap-1.5 shrink-0 cursor-pointer active:translate-y-1"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add</span>
                  </button>
                </div>

                {/* Categories List */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--theme-text)] opacity-80 block">Existing Categories</label>
                  <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
                    {Array.from(new Set([...(siteConfig?.categories || []), ...catalogItems.map(i => i.category).filter(Boolean)])).map((cat) => {
                      return (
                        <div
                          key={cat}
                          className="flex items-center gap-2 px-3 py-1.5 bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] rounded-[var(--theme-radius)] text-xs font-bold text-[var(--theme-text)] group"
                        >
                          <span className="font-mono text-[var(--theme-primary)] uppercase">{cat}</span>
                          <button
                            onClick={() => handleDeleteCategory(cat)}
                            title="Delete category"
                            className="text-[var(--theme-text)] opacity-50 hover:text-rose-500 hover:opacity-100 transition-colors p-0.5 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Excel Bulk Upload Dialog */}
      <AnimatePresence>
        {isBulkUploadOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => {
                if (!isImportingBulk) {
                  setIsBulkUploadOpen(false);
                  setParsedExcelNodes(null);
                }
              }}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative w-full max-w-2xl theme-card shadow-2xl overflow-hidden flex flex-col font-sans max-h-[85vh] rounded-[var(--theme-radius)] text-[var(--theme-text)]"
            >
              <div className="px-6 py-5 border-b border-[var(--theme-card-border)] flex justify-between items-center bg-[var(--theme-card-bg)] shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-[var(--theme-primary)]/10 border border-[var(--theme-primary)]/20 rounded-xl text-[var(--theme-primary)]">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-[var(--theme-text)] font-display">Excel Bulk Server Upload</h3>
                    <p className="text-[11px] text-[var(--theme-text)] opacity-70 mt-0.5">Import product catalogs directly from Excel (.xlsx)</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsBulkUploadOpen(false);
                    setParsedExcelNodes(null);
                  }}
                  disabled={isImportingBulk}
                  className="text-[var(--theme-text)] opacity-70 hover:opacity-100 hover:bg-[var(--theme-primary)]/10 p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                {isParsingExcel ? (
                  <div className="py-12 text-center space-y-3">
                    <Loader2 className="w-8 h-8 text-[var(--theme-primary)] animate-spin mx-auto" />
                    <p className="text-sm text-[var(--theme-text)] font-medium">Parsing Excel sheet parameters...</p>
                  </div>
                ) : !parsedExcelNodes ? (
                  <>
                    <div className="p-4 bg-[var(--theme-primary)]/10 border border-[var(--theme-primary)]/20 rounded-2xl flex flex-col gap-2">
                      <span className="text-[11px] font-mono text-[var(--theme-primary)] uppercase font-bold tracking-widest block">Excel Template Format</span>
                      <p className="text-xs text-[var(--theme-text)] leading-relaxed">
                        Download the prefilled Excel template matching your calculations before uploading.
                      </p>
                      <button
                        type="button"
                        onClick={handleDownloadExcelSample}
                        className="mt-2 w-max btn-3d-primary px-3.5 py-2 text-xs font-bold font-mono flex items-center gap-2 outline-none cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Sample Excel Template (.xlsx)
                      </button>
                    </div>

                    {/* Upload drag drop zone */}
                    <div className="relative border-2 border-dashed border-[var(--theme-card-border)] hover:border-[var(--theme-primary)] transition-colors rounded-3xl p-8 text-center flex flex-col items-center justify-center gap-3 bg-[var(--theme-card-bg)]/50 group">
                      <input
                        type="file"
                        accept=".xlsx, .xls, .csv"
                        onChange={handleBulkUploadFileSelected}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="w-12 h-12 rounded-full bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] flex items-center justify-center text-[var(--theme-text)] group-hover:scale-105 transition-transform">
                        <FileSpreadsheet className="w-6 h-6 text-[var(--theme-primary)]" />
                      </div>
                      <div>
                        <span className="text-[var(--theme-text)] text-sm font-semibold block">Click or drag Excel file here</span>
                        <span className="text-xs text-[var(--theme-text)] opacity-60 mt-1 block font-mono">Supports .xlsx, .xls and .csv</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-5 py-2">
                    {/* Document Icon & File Info */}
                    <div className="p-6 bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] rounded-3xl text-center flex flex-col items-center justify-center gap-3">
                      <div className="w-16 h-16 rounded-2xl bg-[var(--theme-primary)]/10 border border-[var(--theme-primary)]/20 flex items-center justify-center text-[var(--theme-primary)]">
                        <FileSpreadsheet className="w-8 h-8" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-[var(--theme-text)] truncate max-w-md">{parsedExcelFileName}</h4>
                        <span className="text-xs font-mono text-[var(--theme-primary)] font-bold block mt-1">
                          {parsedExcelNodes.length} product document{parsedExcelNodes.length === 1 ? "" : "s"} ready to import
                        </span>
                      </div>
                    </div>

                    {/* Import Progress Bar inside modal when active */}
                    {isImportingBulk && bulkProgress && (
                      <div className="p-4 bg-[var(--theme-primary)]/10 border border-[var(--theme-primary)]/20 rounded-2xl space-y-2">
                        <div className="flex justify-between items-center text-xs font-mono">
                          <span className="text-[var(--theme-primary)] font-bold flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {bulkProgress.message}
                          </span>
                          <span className="text-[var(--theme-text)] opacity-70">{bulkProgress.current} / {bulkProgress.total}</span>
                        </div>
                        <div className="w-full bg-[var(--theme-card-bg)] rounded-full h-2 overflow-hidden border border-[var(--theme-card-border)]">
                          <div
                            className="bg-[var(--theme-primary)] h-full rounded-full transition-all duration-200"
                            style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal footer controls when file is parsed */}
              {parsedExcelNodes && !isParsingExcel && (
                <div className="px-6 py-4 border-t border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] flex justify-between items-center shrink-0">
                  <button
                    type="button"
                    disabled={isImportingBulk}
                    onClick={() => {
                      setParsedExcelNodes(null);
                      setBulkProgress(null);
                    }}
                    className="px-4 py-2 text-[var(--theme-text)] opacity-70 hover:opacity-100 text-xs font-mono font-semibold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Choose Other File
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmBulkImport}
                    disabled={isImportingBulk}
                    className="btn-3d-primary px-5 py-2.5 font-mono text-xs font-bold disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                  >
                    {isImportingBulk ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Importing...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Approve &amp; Import ({parsedExcelNodes.length} Documents)</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete All Products Confirmation Modal */}
      <AnimatePresence>
        {isConfirmDeleteAllModalOpen && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 font-sans">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                if (!isDeletingAllNodes) setIsConfirmDeleteAllModalOpen(false);
              }}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative w-full max-w-md bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)] rounded-[var(--theme-radius)] shadow-2xl overflow-hidden flex flex-col p-6 space-y-4"
            >
              <div className="w-12 h-12 rounded-[var(--theme-radius)] bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-[var(--theme-text)]">Delete All Products?</h3>
                <p className="text-xs text-[var(--theme-text)] opacity-70 mt-1 leading-relaxed">
                  Are you sure you want to delete <span className="text-rose-500 font-bold">{catalogItems.length}</span> catalog products? This operation will remove all catalog products from the database, even those with active user subscriptions.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={isDeletingAllNodes}
                  onClick={() => setIsConfirmDeleteAllModalOpen(false)}
                  className="px-4 py-2 text-[var(--theme-text)] opacity-70 hover:opacity-100 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeletingAllNodes}
                  onClick={handleDeleteAllNodes}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold rounded-[var(--theme-radius)] transition-all shadow-md active:translate-y-1 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {isDeletingAllNodes ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Deleting All...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Confirm Delete All</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
