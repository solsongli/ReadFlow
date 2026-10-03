// Workbench-owned typography; the native reader inherits these CSS variables.
export const WORKBENCH_TEXT_SCALES = [85, 90, 95, 100, 110, 120, 130] as const;
export type WorkbenchFont = "default" | "sans" | "serif" | "kai" | "custom";
export interface WorkbenchAppearance { font: WorkbenchFont; family?: string; textScale: number }
export function validWorkbenchFont(value: unknown): value is WorkbenchFont { return typeof value === "string" && ["default", "sans", "serif", "kai", "custom"].includes(value); }
export function validWorkbenchFontFamily(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= 160 && !/[\u0000-\u001f\u007f;{}<>]/.test(value);
}
export function workbenchFontStack(value: WorkbenchAppearance): string {
  if (value.font === "custom" && validWorkbenchFontFamily(value.family)) return `${JSON.stringify(value.family.trim())}, "Noto Sans CJK SC", system-ui, sans-serif`;
  if (value.font === "serif") return '"Noto Serif CJK SC", "Source Han Serif SC", Georgia, serif';
  if (value.font === "kai") return '"AR PL UKai CN", "KaiTi", "Noto Serif CJK SC", serif';
  if (value.font === "sans") return '"Noto Sans CJK SC", "Source Han Sans SC", system-ui, sans-serif';
  return '"Inter", "Noto Sans CJK SC", system-ui, sans-serif';
}
