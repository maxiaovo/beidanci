// 学习页外观设置（全局，管理员统一配置）
// 客户端安全：本文件不得引入 prisma 等服务端依赖，供学习页与后台预览共用

export interface LearnAppearance {
  wordSizePx: number; // 单词字号
  segmentSizePx: number; // 词根词缀字号
  sentenceSizePx: number; // 例句字号
  sentenceCnSizePx: number; // 例句中文字号
  cardWidthPct: number; // 卡片宽度（占页面宽度百分比）
}

export const DEFAULT_APPEARANCE: LearnAppearance = {
  wordSizePx: 96,
  segmentSizePx: 48,
  sentenceSizePx: 30,
  sentenceCnSizePx: 16,
  cardWidthPct: 90,
};

// 各字段取值范围 [min, max]（前端滑杆与服务端存取共用）
export const APPEARANCE_RANGES: Record<keyof LearnAppearance, [number, number]> = {
  wordSizePx: [48, 160],
  segmentSizePx: [24, 96],
  sentenceSizePx: [18, 60],
  sentenceCnSizePx: [12, 32],
  cardWidthPct: [40, 100],
};

// 取整并夹取到合法范围；非法值回落默认
export function clampAppearanceValue(key: keyof LearnAppearance, value: unknown): number {
  const [min, max] = APPEARANCE_RANGES[key];
  const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_APPEARANCE[key];
  return Math.min(max, Math.max(min, Math.round(n)));
}

// px 字号转 CSS clamp()：窄屏按视口缩小，宽屏不超过设定值
export function clampPx(px: number): string {
  return `clamp(${Math.round(px * 0.62)}px, ${(px / 10).toFixed(1)}vw + 0.5rem, ${px}px)`;
}
