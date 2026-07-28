// 主题系统：预设 + 自定义颜色

export interface ThemeVars {
  background: string; // 页面背景
  foreground: string; // 主文字
  accent: string;     // 主强调色（按钮、高亮）
  accent2: string;    // 次强调色（进度条、装饰）
}

export interface ThemeState {
  presetId: string;   // 预设 id 或 "custom"
  custom: ThemeVars;  // 自定义颜色（仅 presetId === "custom" 时生效）
}

export const DEFAULT_THEME: ThemeState = {
  presetId: "purple",
  custom: {
    background: "#f7f5ff",
    foreground: "#3a2e5c",
    accent: "#9b8cff",
    accent2: "#5ee9d4",
  },
};

export const THEME_PRESETS: { id: string; name: string; vars: ThemeVars }[] = [
  {
    id: "purple",
    name: "青春紫",
    vars: DEFAULT_THEME.custom,
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
  return {
    "--background": vars.background,
    "--foreground": vars.foreground,
    "--color-accent": vars.accent,
    "--color-accent-2": vars.accent2,
  };
}

export function applyThemeVars(vars: ThemeVars) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--background", vars.background);
  root.style.setProperty("--foreground", vars.foreground);
  root.style.setProperty("--color-accent", vars.accent);
  root.style.setProperty("--color-accent-2", vars.accent2);
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
