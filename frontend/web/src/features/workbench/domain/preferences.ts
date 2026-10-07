import { normalizeSemantics } from "@/features/paper-reader/domain.js";
import { DEFAULT_PREFS, type Prefs } from "./workbench-store.js";
import { normalizeTypography } from "./typography.js";
export const PREFS_KEY = "readflow.workbench.prefs.v1";

export function parseWorkbenchPrefs(raw: string | null | undefined): Partial<Prefs> {
  try {
    const value = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const prefs: Partial<Prefs> = {};
    for (const key of Object.keys(DEFAULT_PREFS) as Array<keyof Prefs>) {
      if (key in value && typeof value[key] === typeof DEFAULT_PREFS[key])
        (prefs as Record<string, unknown>)[key] = value[key];
    }
    prefs.marginSide = prefs.marginSide === "right" ? "right" : "auto";
    prefs.translationFormat = prefs.translationFormat === "reflow" ? "reflow" : "layout";
    prefs.layoutDensity = ["compact", "aligned"].includes(prefs.layoutDensity || "")
      ? prefs.layoutDensity
      : "balanced";
    prefs.blockLanguage = ["zh-CN", "en", "ja", "de", "fr"].includes(prefs.blockLanguage || "")
      ? prefs.blockLanguage
      : "zh-CN";
    prefs.reviewNewLimit = Number.isFinite(prefs.reviewNewLimit)
      ? Math.max(0, Math.min(1000, Math.floor(prefs.reviewNewLimit!)))
      : 20;
    prefs.reviewLimit = Number.isFinite(prefs.reviewLimit)
      ? Math.max(0, Math.min(5000, Math.floor(prefs.reviewLimit!)))
      : 200;
    return {
      ...prefs,
      annotationSemantics: normalizeSemantics(prefs.annotationSemantics),
      paperTone: ["auto", "white", "sepia", "night"].includes(prefs.paperTone) ? prefs.paperTone : "auto",
      ...normalizeTypography(prefs),
    };
  } catch {
    return {};
  }
}
