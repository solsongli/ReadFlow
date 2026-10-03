import { DEFAULT_PREFS, type Prefs } from "./workbench-store.js";
import { normalizeTypography } from "./typography.js";
export const PREFS_KEY = "readflow.workbench.prefs.v1";

export function parseWorkbenchPrefs(raw: string | null | undefined): Partial<Prefs> {
  try {
    const value = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const prefs: Partial<Prefs> = {};
    for (const key of Object.keys(DEFAULT_PREFS) as Array<keyof Prefs>) {
      if (key in value && typeof value[key] === typeof DEFAULT_PREFS[key]) (prefs as Record<string, unknown>)[key] = value[key];
    }
    return { ...prefs, ...normalizeTypography(prefs) };
  } catch { return {}; }
}
