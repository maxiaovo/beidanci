// 主题系统：预设 + 自定义颜色

export interface ThemeVars {
  background: string; // 页面背景
  foreground: string; // 主文字
  accent: string;     // 主强调色（按钮、高亮）
  accent2: string;    // 次强调色（进度条、装饰）
  surface?: string;
  surfaceMuted?: string;
  border?: string;
  navActive?: string;
  navActiveForeground?: string;
  heroBackground?: string;
  heroForeground?: string;
  heroBorder?: string;
  heroEyebrow?: string;
  heroControlBackground?: string;
  actionBackground?: string;
  actionForeground?: string;
  moduleWordBackground?: string;
  moduleWordBorder?: string;
  moduleWritingBackground?: string;
  moduleWritingAccent?: string;
  moduleFutureBorder?: string;
  sectionEyebrow?: string;
  heroImageOpacity?: number;
  heroResourceVisibility?: "visible" | "hidden";
}

export interface ThemeState {
  presetId: string;   // 预设 id 或 "custom"
  custom: ThemeVars;  // 自定义颜色（仅 presetId === "custom" 时生效）
}

export const DEFAULT_THEME: ThemeState = {
  presetId: "macaron",
  custom: {
    background: "#FFF7ED",
    foreground: "#4F3642",
    accent: "#D95E78",
    accent2: "#B8E3D1",
  },
};

export const THEME_PRESETS: { id: string; name: string; vars: ThemeVars }[] = [
  {
    id: "macaron",
    name: "经典马卡龙",
    vars: {
      background: "#FFF7ED",
      foreground: "#4F3642",
      accent: "#D95E78",
      accent2: "#B8E3D1",
      surface: "#FFFCF8",
      surfaceMuted: "#FFF2F4",
      border: "#F2D8D9",
      navActive: "#B8E3D1",
      navActiveForeground: "#3E4240",
      heroBackground: "#FFF8E9",
      heroForeground: "#4F3642",
      heroBorder: "#F4A9B6",
      heroEyebrow: "#EF8C9D",
      heroControlBackground: "#FFFFFFB8",
      actionBackground: "#D95E78",
      actionForeground: "#FFFFFF",
      moduleWordBackground: "#EFFAF6",
      moduleWordBorder: "#52B9A9",
      moduleWritingBackground: "#FAF4FF",
      moduleWritingAccent: "#A987D5",
      moduleFutureBorder: "#F4A9B6",
      sectionEyebrow: "#A987D5",
      heroImageOpacity: 0.44,
      heroResourceVisibility: "visible",
    },
  },
  {
    id: "aegean",
    name: "爱琴海",
    vars: {
      background: "#F8F1E4",
      foreground: "#17324D",
      accent: "#1557A6",
      accent2: "#2F8F88",
      surface: "#FFFDF8",
      surfaceMuted: "#EDF6F3",
      border: "#E1D5C4",
      navActive: "#0D3F77",
      navActiveForeground: "#FFFFFF",
      heroBackground: "#154C79",
      heroForeground: "#FFFFFF",
      heroBorder: "#154C79",
      heroEyebrow: "#F59A3E",
      heroControlBackground: "#FFFFFF12",
      actionBackground: "#1557A6",
      actionForeground: "#FFFFFF",
      moduleWordBackground: "#FFFDF8",
      moduleWordBorder: "#1557A6",
      moduleWritingBackground: "#FFFDF8",
      moduleWritingAccent: "#7C654F",
      moduleFutureBorder: "#D8C8B1",
      sectionEyebrow: "#2F8F88",
      heroImageOpacity: 0,
      heroResourceVisibility: "hidden",
    },
  },
  {
    id: "purple",
    name: "青春紫",
    vars: {
      background: "#f7f5ff",
      foreground: "#3a2e5c",
      accent: "#9b8cff",
      accent2: "#5ee9d4",
    },
  },
  {
    id: "green",
    name: "清新绿",
    vars: {
      background: "#f0fdf4",
      foreground: "#14532d",
      accent: "#22c55e",
      accent2: "#86efac",
    },
  },
  {
    id: "blue",
    name: "天空蓝",
    vars: {
      background: "#f0f9ff",
      foreground: "#0c4a6e",
      accent: "#0ea5e9",
      accent2: "#7dd3fc",
    },
  },
  {
    id: "warm",
    name: "暖橙",
    vars: {
      background: "#fff7ed",
      foreground: "#7c2d12",
      accent: "#f97316",
      accent2: "#fdba74",
    },
  },
  {
    id: "dark",
    name: "暗夜",
    vars: {
      background: "#0f172a",
      foreground: "#e2e8f0",
      accent: "#818cf8",
      accent2: "#38bdf8",
    },
  },
  {
    id: "custom",
    name: "自定义",
    vars: {
      background: "#ffffff",
      foreground: "#171717",
      accent: "#22c55e",
      accent2: "#86efac",
    },
  },
];

export function getPreset(id: string) {
  return THEME_PRESETS.find((p) => p.id === id);
}

export function getThemeVars(state?: ThemeState | null): ThemeVars {
  if (!state) return DEFAULT_THEME.custom;
  if (state.presetId === "custom") {
    return state.custom && Object.keys(state.custom).length
      ? state.custom
      : DEFAULT_THEME.custom;
  }
  return getPreset(state.presetId)?.vars ?? DEFAULT_THEME.custom;
}

export function styleObjectFromVars(vars: ThemeVars): Record<string, string> {
  const semantic = semanticThemeVars(vars);
  return {
    "--background": vars.background,
    "--foreground": vars.foreground,
    "--color-accent": vars.accent,
    "--color-accent-2": vars.accent2,
    ...semantic,
  };
}

export function applyThemeVars(vars: ThemeVars) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(styleObjectFromVars(vars))) {
    root.style.setProperty(key, value);
  }
}

function semanticThemeVars(vars: ThemeVars): Record<string, string> {
  return {
    "--surface": vars.surface ?? "#FFFFFF",
    "--surface-muted": vars.surfaceMuted ?? vars.background,
    "--theme-border": vars.border ?? `${vars.foreground}1A`,
    "--nav-active": vars.navActive ?? vars.foreground,
    "--nav-active-foreground": vars.navActiveForeground ?? "#FFFFFF",
    "--hero-background": vars.heroBackground ?? vars.foreground,
    "--hero-foreground": vars.heroForeground ?? "#FFFFFF",
    "--hero-border": vars.heroBorder ?? vars.foreground,
    "--hero-eyebrow": vars.heroEyebrow ?? vars.accent2,
    "--hero-control-background": vars.heroControlBackground ?? "#FFFFFF1A",
    "--action-background": vars.actionBackground ?? "#FFFFFF",
    "--action-foreground": vars.actionForeground ?? vars.foreground,
    "--module-word-background": vars.moduleWordBackground ?? "#FFFFFF",
    "--module-word-border": vars.moduleWordBorder ?? vars.foreground,
    "--module-writing-background": vars.moduleWritingBackground ?? "#FFFFFFB8",
    "--module-writing-accent": vars.moduleWritingAccent ?? vars.foreground,
    "--module-future-border": vars.moduleFutureBorder ?? `${vars.foreground}24`,
    "--section-eyebrow": vars.sectionEyebrow ?? vars.accent,
    "--hero-image-opacity": String(vars.heroImageOpacity ?? 0),
    "--hero-resource-visibility": vars.heroResourceVisibility ?? "hidden",
  };
}

export function hexColor(value: string): string {
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#000000";
}

export function parseThemeCustom(raw: string | null | undefined): ThemeVars {
  if (!raw) return DEFAULT_THEME.custom;
  try {
    const parsed = JSON.parse(raw);
    return {
      background: hexColor(parsed.background),
      foreground: hexColor(parsed.foreground),
      accent: hexColor(parsed.accent),
      accent2: hexColor(parsed.accent2),
    };
  } catch {
    return DEFAULT_THEME.custom;
  }
}

export function themeStateFromDb(
  preset: string | null | undefined,
  customRaw: string | null | undefined
): ThemeState {
  return {
    presetId: preset || DEFAULT_THEME.presetId,
    custom: parseThemeCustom(customRaw),
  };
}
