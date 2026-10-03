export const WORKBENCH_TEXT_SCALES = [85, 90, 95, 100, 110, 120, 130] as const;
export type WorkbenchFont = "default" | "sans" | "serif" | "kai" | "custom";
export interface WorkbenchAppearance { font: WorkbenchFont; family?: string; textScale: number }

const DEFAULT_FONT = '"ReadFlow Inter", "Inter", "Noto Sans CJK SC", "Source Han Sans SC", system-ui, sans-serif';
const FONT_STACKS = {
  default: DEFAULT_FONT,
  sans: '"Noto Sans CJK SC", "Source Han Sans SC", system-ui, sans-serif',
  serif: '"Noto Serif CJK SC", "Source Han Serif SC", "Source Han Serif", Georgia, serif',
  kai: '"AR PL UKai CN", "AR PL UKai TW", "KaiTi", "STKaiti", "Noto Serif CJK SC", serif',
} as const;

export function validWorkbenchFont(value: unknown): value is WorkbenchFont {
  return typeof value === "string" && ["default", "sans", "serif", "kai", "custom"].includes(value);
}
export function validWorkbenchFontFamily(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 160 && !/[\x00-\x1f\x7f;{}]/.test(value);
}
export function validWorkbenchAppearance(value: unknown): value is WorkbenchAppearance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  return Object.keys(raw).every((key) => ["font", "family", "textScale"].includes(key))
    && validWorkbenchFont(raw.font) && WORKBENCH_TEXT_SCALES.some((scale) => scale === raw.textScale)
    && (raw.font === "custom" ? validWorkbenchFontFamily(raw.family) : raw.family === undefined);
}
export function workbenchFontStack(value: WorkbenchAppearance): string {
  if (value.font !== "custom") return FONT_STACKS[value.font];
  if (!validWorkbenchFontFamily(value.family)) return DEFAULT_FONT;
  const quoted = '"' + value.family.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  return `${quoted}, ${DEFAULT_FONT}`;
}
