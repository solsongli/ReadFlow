import { DEFAULT_SEMANTICS, type Semantics } from "@/features/paper-reader/domain.js";
// 工作台状态（纯 reducer）。副作用在 controller.ts；本文件不 import React、不访问网络。
import type { SettingsSection } from "./settings.js";
import { DEFAULT_TYPOGRAPHY, type TypographyPrefs } from "./typography.js";
import { initialNotesState, type NotesState } from "./notes.js";
import { createStore } from "@/platform/store/store.js";
import type { PaperItem, ResearchOcrJob } from "@/platform/contracts/research-library.js";
import type {
  SortOrder,
  WorkbenchDesk,
  WorkbenchListResult,
  WorkbenchSort,
  WorkbenchRow,
  WorkbenchView,
} from "@/platform/contracts/workbench.js";

export type MainView = "desk" | "library" | "notes" | "settings" | "review";
export type ListLayout = "list" | "grouped";
export type Density = "bilingual" | "compact";
export type ThemePreference = "system" | "light" | "dark";
export type LoadStatus = "idle" | "loading" | "ready" | "error";

export interface ReaderTab {
  kind?: "canvas";
  canvasId?: string;
  canvasNode?: string;
  annotationId?: string;
  focused?: boolean;
  row?: WorkbenchRow;
  resumePage?: number | null;
  id: string;
  itemId: string;
  title: string;
  url: string | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  attachmentId?: string;
  navigationKey?: number;
}

export interface Notice {
  id: number;
  tone: "info" | "success" | "error";
  text: string;
  canUndo?: boolean;
  actionLabel?: string;
}

export interface Prefs extends TypographyPrefs {
  reviewNewLimit: number;
  reviewLimit: number;
  blockLanguage: string;
  blockImageText: boolean;
  blockModeDisabled: boolean;
  blockModeHintDismissed: boolean;
  annotationSemantics: Semantics;
  paperTone: "auto" | "white" | "sepia" | "night";
  sort: WorkbenchSort;
  order: SortOrder;
  layout: ListLayout;
  density: Density;
  theme: ThemePreference;
  startView: "desk" | "library";
  sidebarCollapsed: boolean;
  expandedGroups: string[];
}

export interface WorkbenchState extends Prefs {
  translationIssue?: { itemId: string; error: import("@/platform/contracts/workbench.js").TranslationError };
  translatingIds?: string[];
  main: MainView;
  settingsSection: SettingsSection;
  settingsReturn: { main: "desk" | "library" | "notes" | "review"; activeTab: string };
  notes: NotesState;
  view: WorkbenchView;
  groupId: string | null;
  tag: string | null;
  query: string;
  selectedIds: string[];
  anchorId: string | null;
  list: { status: LoadStatus; result: WorkbenchListResult | null; error: string | null };
  desk: { status: LoadStatus; data: WorkbenchDesk | null; error: string | null };
  detail: { status: LoadStatus; item: PaperItem | null; error: string | null };
  tabs: ReaderTab[];
  activeTab: string;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  selectionFocusId: string | null;
  connection: { unavailable: boolean; retrying: boolean; attempt: number };
  /** The inspector's "加入分组" picker (keyboard G opens it). */
  pickerOpen: boolean;
  /** Inline "新建分组" input in the sidebar; parentId null = top level. */
  groupDraft: { parentId: string | null } | null;
  notice: Notice | null;
  ocrJobs: ResearchOcrJob[];
}

export const LIBRARY_TAB = "library";

export const DEFAULT_PREFS: Prefs = {
  reviewNewLimit: 20,
  reviewLimit: 200,
  blockLanguage: "zh-CN",
  blockImageText: true,
  blockModeDisabled: false,
  blockModeHintDismissed: false,
  paperTone: "auto",
  annotationSemantics: { ...DEFAULT_SEMANTICS },
  ...DEFAULT_TYPOGRAPHY,
  sort: "added",
  order: "desc",
  layout: "list",
  density: "bilingual",
  theme: "system",
  startView: "desk",
  sidebarCollapsed: false,
  expandedGroups: [],
};

export function initialWorkbenchState(prefs: Partial<Prefs> = {}): WorkbenchState {
  return {
    ...DEFAULT_PREFS,
    ...prefs,
    main: prefs.startView === "library" ? "library" : "desk",
    settingsSection: "general",
    settingsReturn: { main: "desk", activeTab: LIBRARY_TAB },
    notes: initialNotesState(),
    view: "all",
    groupId: null,
    tag: null,
    query: "",
    selectedIds: [],
    anchorId: null,
    list: { status: "idle", result: null, error: null },
    desk: { status: "idle", data: null, error: null },
    detail: { status: "idle", item: null, error: null },
    tabs: [],
    activeTab: LIBRARY_TAB,
    paletteOpen: false,
    shortcutsOpen: false,
    selectionFocusId: null,
    connection: { unavailable: false, retrying: false, attempt: 0 },
    pickerOpen: false,
    groupDraft: null,
    notice: null,
    ocrJobs: [],
  };
}

type S = WorkbenchState;

/** Shift-click / shift-arrow selection between the anchor and the target, in list order. */
export function rangeSelection(order: string[], anchor: string | null, target: string): string[] {
  const end = order.indexOf(target);
  const start = anchor ? order.indexOf(anchor) : -1;
  if (end < 0) return [];
  if (start < 0) return [target];
  const [from, to] = start <= end ? [start, end] : [end, start];
  return order.slice(from, to + 1);
}

export const workbenchActions = {
  patch: (state: S, changes: Partial<S>): S => ({ ...state, ...changes }),
  showLibrary: (state: S, changes: Partial<Pick<S, "view" | "groupId" | "tag" | "query">>): S => ({
    ...state,
    main: "library",
    activeTab: LIBRARY_TAB,
    view: "all",
    groupId: null,
    tag: null,
    ...changes,
  }),
  listLoading: (state: S): S => ({ ...state, list: { ...state.list, status: "loading", error: null } }),
  listLoaded: (state: S, result: WorkbenchListResult): S => {
    const ids = new Set(result.items.map((row) => row.id));
    const selectedIds = state.selectedIds.filter((id) => ids.has(id));
    return { ...state, list: { status: "ready", result, error: null }, selectedIds };
  },
  listFailed: (state: S, error: string): S => ({ ...state, list: { ...state.list, status: "error", error } }),
  deskLoading: (state: S): S => ({ ...state, desk: { ...state.desk, status: "loading", error: null } }),
  deskLoaded: (state: S, data: WorkbenchDesk): S => ({ ...state, desk: { status: "ready", data, error: null } }),
  deskFailed: (state: S, error: string): S => ({ ...state, desk: { ...state.desk, status: "error", error } }),
  detailLoading: (state: S): S => ({ ...state, detail: { ...state.detail, status: "loading", error: null } }),
  detailLoaded: (state: S, item: PaperItem | null): S => ({ ...state, detail: { status: "ready", item, error: null } }),
  detailFailed: (state: S, error: string): S => ({ ...state, detail: { ...state.detail, status: "error", error } }),
  select: (state: S, id: string, mode: "single" | "toggle" | "range" = "single"): S => {
    const order = state.list.result?.items.map((row) => row.id) ?? [];
    if (mode === "toggle") {
      const has = state.selectedIds.includes(id);
      return { ...state, selectedIds: has ? state.selectedIds.filter((value) => value !== id) : [...state.selectedIds, id], anchorId: id };
    }
    if (mode === "range") return { ...state, selectedIds: rangeSelection(order, state.anchorId, id) };
    return { ...state, selectedIds: [id], anchorId: id };
  },
  openTab: (state: S, tab: ReaderTab): S => {
    const exists = state.tabs.some((entry) => entry.id === tab.id);
    const tabs = exists ? state.tabs.map((entry) => (entry.id === tab.id ? { ...entry, ...tab } : entry)) : [...state.tabs, tab];
    return { ...state, tabs, activeTab: tab.id };
  },
  updateTab: (state: S, id: string, changes: Partial<ReaderTab>): S => ({
    ...state,
    tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, ...changes } : tab)),
  }),
  closeTab: (state: S, id: string): S => {
    const index = state.tabs.findIndex((tab) => tab.id === id);
    const tabs = state.tabs.filter((tab) => tab.id !== id);
    if (state.activeTab !== id) return { ...state, tabs };
    const next = tabs[Math.min(index, tabs.length - 1)];
    return { ...state, tabs, activeTab: next ? next.id : LIBRARY_TAB };
  },
  toggleGroupExpanded: (state: S, id: string): S => ({
    ...state,
    expandedGroups: state.expandedGroups.includes(id)
      ? state.expandedGroups.filter((value) => value !== id)
      : [...state.expandedGroups, id],
  }),
  notify: (state: S, notice: Notice | null): S => ({ ...state, notice }),
};

export function createWorkbenchStore(prefs: Partial<Prefs> = {}) {
  return createStore({ name: "readflow-workbench", initialState: initialWorkbenchState(prefs), actions: workbenchActions });
}

export type WorkbenchStore = ReturnType<typeof createWorkbenchStore>;

export function prefsOf(state: S): Prefs {
  const { sort, order, layout, density, theme, expandedGroups, sidebarCollapsed, startView, uiFont, customFont, textScale, noteFont, paperTone, annotationSemantics, reviewNewLimit, reviewLimit, blockLanguage, blockImageText, blockModeDisabled, blockModeHintDismissed } = state;
  return { sort, order, layout, density, theme, expandedGroups, sidebarCollapsed, startView, uiFont, customFont, textScale, noteFont, paperTone, annotationSemantics, reviewNewLimit, reviewLimit, blockLanguage, blockImageText, blockModeDisabled, blockModeHintDismissed };
}
