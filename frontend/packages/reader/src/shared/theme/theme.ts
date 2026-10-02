import { isWorkbenchScheme, parseWorkbenchEmbed, type WorkbenchScheme } from "../../domain/workbench-embed.js";
// 主题皮肤运行时 API — 自包含版（从 frontend/web/src/shared/theme/theme.ts 复制）
// 注册表：./registry.ts
import {
  DEFAULT_THEME_ID,
  THEME_STORAGE_KEY,
  getThemeDefinition,
  isThemeId,
  listThemes,
  listThemesByGroup,
  type ThemeId,
} from "./registry.js";

export {
  DEFAULT_THEME_ID,
  THEME_STORAGE_KEY,
  THEME_REGISTRY,
  THEME_SERIES,
  getThemeDefinition,
  isThemeId,
  listThemes,
  listThemesByGroup,
  listThemesBySeries,
  themeGroupLabel,
  type ThemeDefinition,
  type ThemeGroup,
  type ThemeId,
  type ThemePreview,
  type ThemeSeries,
} from "./registry.js";

/** 兼容旧 import 名 */
export const THEME_IDS = listThemes().map((t) => t.id);
export const THEME_META = Object.fromEntries(
  listThemes().map((t) => [t.id, { id: t.id, label: t.label, description: t.description }]),
);

export const THEME_CHANGE_EVENT = "retainpdf:theme-change";

function embeddedTheme(): ThemeId | null {
  const embed = parseWorkbenchEmbed(globalThis.window?.location?.search || "");
  if (!embed) return null;
  const current = globalThis.document?.documentElement.dataset.readerScheme;
  const scheme = isWorkbenchScheme(current) ? current : embed.scheme;
  return scheme === "dark" ? "graphite" : "classic";
}

function applyTheme(next: ThemeId) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = next;
  document.documentElement.dataset.readerTheme = next;
  const group = getThemeDefinition(next)?.group || "light";
  document.documentElement.dataset.themeGroup = group;
  document.documentElement.classList.toggle("theme-dark", group === "dark");
}

export function applyWorkbenchScheme(scheme: WorkbenchScheme) {
  if (!parseWorkbenchEmbed(globalThis.window?.location?.search || "") || !isWorkbenchScheme(scheme)) return;
  document.documentElement.dataset.readerEmbed = "workbench";
  document.documentElement.dataset.readerScheme = scheme;
  applyTheme(scheme === "dark" ? "graphite" : "classic");
}

export function getStoredTheme(): ThemeId {
  const embedded = embeddedTheme();
  if (embedded) return embedded;
  if (typeof localStorage === "undefined") return DEFAULT_THEME_ID;
  try {
    const raw = `${localStorage.getItem(THEME_STORAGE_KEY) || ""}`.trim();
    if (isThemeId(raw)) return raw;
  } catch {
    /* private mode */
  }
  return DEFAULT_THEME_ID;
}

export function getTheme(): ThemeId {
  const embedded = embeddedTheme();
  if (embedded) return embedded;
  if (typeof document !== "undefined") {
    const fromDom = document.documentElement.dataset.theme;
    if (isThemeId(fromDom)) return fromDom;
  }
  return getStoredTheme();
}

/** 写入 storage + <html data-theme>，并广播事件 */
export function setTheme(theme: ThemeId) {
  const embedded = embeddedTheme();
  if (embedded) {
    applyWorkbenchScheme(embedded === "graphite" ? "dark" : "light");
    return embedded;
  }
  const next = isThemeId(theme) ? theme : DEFAULT_THEME_ID;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  applyTheme(next);
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: next } }),
      );
    } catch {
      /* ignore */
    }
  }
  return next;
}

/** 入口最顶部调用，减少换肤 FOUC */
export function bootTheme() {
  const embed = parseWorkbenchEmbed(globalThis.window?.location?.search || "");
  if (embed) {
    applyWorkbenchScheme(embed.scheme);
    return embed.scheme === "dark" ? "graphite" : "classic";
  }
  return setTheme(getStoredTheme());
}
