import { WORKBENCH_TEXT_SCALES, validWorkbenchFont, validWorkbenchFontFamily, workbenchFontStack, type WorkbenchFont, type WorkbenchAppearance } from "@retainpdf/reader/contracts";
export { WORKBENCH_TEXT_SCALES, workbenchFontStack };
export type { WorkbenchFont, WorkbenchAppearance };
export type NoteFont = "interface" | "serif" | "mono";
export interface TypographyPrefs { uiFont: WorkbenchFont; customFont: string; textScale: number; noteFont: NoteFont }
export const DEFAULT_TYPOGRAPHY: TypographyPrefs = { uiFont: "default", customFont: "", textScale: 100, noteFont: "interface" };
export const FONT_OPTIONS = [{ value: "default", label: "默认（Inter + 思源黑体）" }, { value: "sans", label: "思源黑体 / Noto Sans CJK SC" }, { value: "serif", label: "衬线" }, { value: "kai", label: "楷体" }] as const;

export function textScaleIndex(value: number): number {
  if (!Number.isFinite(value)) return 3;
  return WORKBENCH_TEXT_SCALES.reduce((best, scale, index) => Math.abs(scale - value) < Math.abs(WORKBENCH_TEXT_SCALES[best] - value) ? index : best, 3);
}
export function stepTextScale(value: number, direction: -1 | 0 | 1): number {
  return direction === 0 ? 100 : WORKBENCH_TEXT_SCALES[Math.max(0, Math.min(WORKBENCH_TEXT_SCALES.length - 1, textScaleIndex(value) + direction))];
}
export function normalizeTypography(value: Partial<TypographyPrefs>): TypographyPrefs {
  const customFont = validWorkbenchFontFamily(value.customFont) ? value.customFont.trim() : "";
  const uiFont = validWorkbenchFont(value.uiFont) && (value.uiFont !== "custom" || customFont) ? value.uiFont : "default";
  return { uiFont, customFont, textScale: WORKBENCH_TEXT_SCALES[textScaleIndex(value.textScale ?? 100)],
    noteFont: value.noteFont === "serif" || value.noteFont === "mono" ? value.noteFont : "interface" };
}
export function readerAppearance(value: TypographyPrefs): WorkbenchAppearance {
  const clean = normalizeTypography(value);
  return { font: clean.uiFont, textScale: clean.textScale, ...(clean.uiFont === "custom" ? { family: clean.customFont } : {}) };
}
export function typographyVariables(value: TypographyPrefs): Record<string, string> {
  const appearance = readerAppearance(value);
  const family = workbenchFontStack(appearance);
  return { "--wb-ui-scale": String(appearance.textScale / 100), "--wb-ui-font": family,
    "--wb-note-font": value.noteFont === "mono" ? '"DejaVu Sans Mono", "Noto Sans Mono CJK SC", ui-monospace, monospace'
      : value.noteFont === "serif" ? workbenchFontStack({ font: "serif", textScale: 100 }) : family };
}
export function textScaleShortcut(event: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): -1 | 0 | 1 | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  return event.key === "=" || event.key === "+" ? 1 : event.key === "-" ? -1 : event.key === "0" ? 0 : null;
}
