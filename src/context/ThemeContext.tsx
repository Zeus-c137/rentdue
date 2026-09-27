import React, { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { SiteConfig, ThemePreset, ThemeMode, CardStyle, ButtonStyle, BorderRadiusStyle } from "../types";
import { fixGitHubImageUrl } from "../utils/imageUtils";
import {
  HUT12_PRESETS,
  HUT12_FONTS_MAP,
  migratePreset,
  migrateCardStyle,
  migrateButtonStyle,
  migrateBorderRadius,
  migrateFontFamily,
} from "../utils/themeTokens";

export interface ThemePresetDetails {
  primary: string;
  primaryShadow: string;
  accent: string;
  accentShadow: string;
  secondary: string;
  secondaryShadow: string;
  bg: string;
  cardBg: string;
  cardBorder: string;
  cardShadow: string;
  textColor?: string;
  isDark?: boolean;
}

export interface ThemePresetOption {
  id: ThemePreset;
  name: string;
  icon: string;
  description: string;
  primary: string;
  accent: string;
  secondary: string;
  cardStyle: CardStyle;
  radius: BorderRadiusStyle;
}

function darkenColor(hex: string, percent: number = 20): string {
  if (!hex || !hex.startsWith("#")) return hex || "#92400e";
  let num = parseInt(hex.replace("#", ""), 16);
  let r = (num >> 16) - Math.round(255 * (percent / 100));
  let g = ((num >> 8) & 0x00ff) - Math.round(255 * (percent / 100));
  let b = (num & 0x0000ff) - Math.round(255 * (percent / 100));
  r = Math.max(0, r);
  g = Math.max(0, g);
  b = Math.max(0, b);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

interface ThemeContextType {
  siteConfig: SiteConfig | null;
  themePreset: ThemePreset;
  themeMode: ThemeMode;
  cardStyle: CardStyle;
  buttonStyle: ButtonStyle;
  borderRadius: BorderRadiusStyle;
  primaryColor: string;
  accentColor: string;
  secondaryColor: string;
  bgColor: string;
  cardBgColor: string;
  authBgImage: string;
  dashboardBgImage: string;
  fontFamily: string;
  fontSizeScale: "sm" | "md" | "lg" | "xl";
  textColor: string;
  updateLocalThemeConfig: (newConfig: Partial<SiteConfig>) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{
  siteConfig: SiteConfig | null;
  children: React.ReactNode;
}> = ({ siteConfig: initialConfig, children }) => {
  const [config, setConfig] = useState<SiteConfig | null>(() => {
    return initialConfig || null;
  });

  useEffect(() => {
    if (!initialConfig) return;
    setConfig(prev => {
      if (!prev) return initialConfig;
      const prevAny = prev as any;
      const nextAny = initialConfig as any;
      if (nextAny.fontFamily === undefined && prevAny.fontFamily) return prev;
      if (prevAny.fontFamily && nextAny.fontFamily && prevAny.fontFamily !== nextAny.fontFamily) {
        const prevT = Number(prevAny.updatedAt || 0);
        const nextT = Number(nextAny.updatedAt || 0);
        if (prevT && nextT) return nextT >= prevT ? initialConfig : prev;
        return prev;
      }
      return initialConfig;
    });
  }, [initialConfig]);

  const themePreset = migratePreset(config?.themePreset as string);
  const themeMode = (config?.themeMode || "light") as ThemeMode;
  const cardStyle = migrateCardStyle(config?.cardStyle as string);
  const buttonStyle = migrateButtonStyle(config?.buttonStyle as string);
  const borderRadius: BorderRadiusStyle = "rounded-2xl";
  // migrate to keep sanitized even if raw stored differently
  void migrateBorderRadius;
  const preset = HUT12_PRESETS[themePreset] || HUT12_PRESETS["hut12-light"];
  const primaryColor = config?.primaryColor || preset.primary;
  const accentColor = config?.accentColor || preset.accent;
  const secondaryColor = config?.secondaryColor || preset.secondary;
  const bgColor = config?.bgColor || preset.bg;
  const cardBgColor = config?.cardBgColor || preset.cardBg;
  const rawAuthBg = config?.authBgImage || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1600&q=80";
  const authBgImage = fixGitHubImageUrl(rawAuthBg);
  const dashboardBgImage = fixGitHubImageUrl(config?.dashboardBgImage || "");
  const fontFamily = migrateFontFamily(config?.fontFamily);
  const fontSizeScale = config?.fontSizeScale || "md";
  const textColor = config?.textColor || "";

  useLayoutEffect(() => {
    const activePreset = HUT12_PRESETS[themePreset] || HUT12_PRESETS["hut12-light"];

    const activePrimary = activePreset.primary;
    const activePrimaryShadow = activePreset.primaryShadow;
    const activeAccent = activePreset.accent;
    const activeAccentShadow = activePreset.accentShadow;
    const activeSecondary = activePreset.secondary;
    const activeSecondaryShadow = activePreset.secondaryShadow;
    const activeBg = activePreset.bg;
    const activeCardBgBase = activePreset.cardBg;

    const isDark = themeMode === "dark" || (themeMode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches) || !!activePreset.isDark;

    let activeCardBg = activeCardBgBase;
    let activeCardBorder = activePreset.cardBorder;
    let activeCardShadow = activePreset.cardShadow;
    const activeInputBorder = activePreset.cardBorder || activePrimary;

    if (cardStyle === "glass") {
      activeCardBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.82)";
      activeCardBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(15, 23, 42, 0.12)";
      activeCardShadow = isDark ? "0 8px 32px 0 rgba(0, 0, 0, 0.35)" : "0 4px 20px rgba(0, 0, 0, 0.08)";
    } else {
      activeCardBg = isDark ? "#1a1a1a" : "#ffffff";
      activeCardBorder = isDark ? "#334155" : "#e7e5e4";
      activeCardShadow = isDark ? "0 4px 12px rgba(0, 0, 0, 0.3)" : "0 2px 8px rgba(0, 0, 0, 0.06)";
      if (!isDark) {
        activeCardBg = HUT12_PRESETS["hut12-light"].cardBg;
        activeCardBorder = HUT12_PRESETS["hut12-light"].cardBorder;
        activeCardShadow = HUT12_PRESETS["hut12-light"].cardShadow;
      }
    }

    const root = document.documentElement;
    root.setAttribute("data-card-style", cardStyle || "solid");
    root.setAttribute("data-button-style", buttonStyle || "pill-gradient");
    root.setAttribute("data-theme-preset", themePreset || "hut12-light");

    root.style.setProperty("--theme-primary", activePrimary);
    root.style.setProperty("--theme-primary-shadow", activePrimaryShadow);
    root.style.setProperty("--theme-accent", activeAccent);
    root.style.setProperty("--theme-accent-shadow", activeAccentShadow);
    root.style.setProperty("--theme-secondary", activeSecondary);
    root.style.setProperty("--theme-secondary-shadow", activeSecondaryShadow);
    root.style.setProperty("--theme-bg", activeBg);
    root.style.setProperty("--theme-card-bg", activeCardBg);
    root.style.setProperty("--theme-card-border", activeCardBorder);
    root.style.setProperty("--theme-input-border", activeInputBorder);
    root.style.setProperty("--theme-card-shadow", activeCardShadow);

    root.style.setProperty("--theme-radius", "1.25rem");

    const fontUrl = HUT12_FONTS_MAP[fontFamily] || HUT12_FONTS_MAP["Sora"];
    let fontLink = document.getElementById("dynamic-theme-font") as HTMLLinkElement | null;
    if (!fontLink) {
      fontLink = document.createElement("link");
      fontLink.id = "dynamic-theme-font";
      fontLink.rel = "stylesheet";
      document.head.appendChild(fontLink);
    }
    if (fontLink.href !== fontUrl) {
      fontLink.href = fontUrl;
    }
    root.style.setProperty("--theme-font-family", `'${fontFamily}', 'Outfit', sans-serif`);

    const fontScaleMap = { sm: "14px", md: "16px", lg: "18px", xl: "20px" };
    root.style.setProperty("--theme-font-base", fontScaleMap[fontSizeScale as keyof typeof fontScaleMap] || "16px");

    if (textColor) {
      root.style.setProperty("--theme-text", textColor);
    } else if (activePreset.textColor) {
      root.style.setProperty("--theme-text", activePreset.textColor);
    } else {
      root.style.removeProperty("--theme-text");
    }

    if (isDark) {
      root.classList.add("dark");
      root.style.setProperty("--theme-text-muted", "#A3B18A");
      root.style.setProperty("--theme-on-primary", "#1A2E05");
    } else {
      root.classList.remove("dark");
      root.style.setProperty("--theme-text-muted", "#5B6B4C");
      root.style.setProperty("--theme-on-primary", "#FFFFFF");
    }
    void darkenColor;
  }, [themePreset, themeMode, cardStyle, buttonStyle, borderRadius, primaryColor, accentColor, secondaryColor, bgColor, cardBgColor, fontFamily, fontSizeScale, textColor]);

  const updateLocalThemeConfig = (newFields: Partial<SiteConfig>) => {
    setConfig((prev) => ({ ...(prev || {}), ...newFields }));
  };

  return (
    <ThemeContext.Provider
      value={{
        siteConfig: config,
        themePreset,
        themeMode,
        cardStyle,
        buttonStyle,
        borderRadius,
        primaryColor,
        accentColor,
        secondaryColor,
        bgColor,
        cardBgColor,
        authBgImage,
        dashboardBgImage,
        fontFamily,
        fontSizeScale,
        textColor,
        updateLocalThemeConfig
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
