import { createTranslations } from "./translations.js";
import { mergeReaderRow } from "../domain/reader-state.js";
// 工作台副作用：所有网络请求、偏好持久化、通知都在这里。UI 只调用这些方法。
import type { WorkbenchApi } from "@/platform/api/workbench.js";
import type { ReadStatus, WorkbenchRow, WorkbenchStatePatch } from "@/platform/contracts/workbench.js";
import type { ItemInput } from "@/platform/contracts/research-library.js";
import { createSettingsNavigation } from "./settings-navigation.js";
import type { SettingsServices } from "./settings-services.js";
import { createReaderSync } from "./reader-sync.js";
import { createNotesController } from "./notes-controller.js";
import { createReaderActions, type ReaderTarget } from "./reader-actions.js";
import { createServiceRecovery } from "./service-recovery.js";
import { createPdfImporter } from "./pdf-import.js";
import { createAutoTranslation } from "./auto-translation.js";
import { preferenceEvents, syncWorkbenchPreferences } from "./preferences-sync.js";
import { parseWorkbenchPrefs, PREFS_KEY } from "../domain/preferences.js";
import { normalizeTypography } from "../domain/typography.js";
import { localMidnightIso } from "../domain/format.js";
import {
  createWorkbenchStore,
  DEFAULT_PREFS,
  LIBRARY_TAB,
  rangeSelection,
  type MainView,
  type Notice,
  type Prefs,
  type WorkbenchState,
} from "../domain/workbench-store.js";

export interface WorkbenchEnv {
  api: WorkbenchApi;
  translationConfig?: Parameters<typeof createTranslations>[0]["loadConfig"];
  createSettingsServices?: () => SettingsServices;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  preferenceEvents?: EventTarget | null;
  now?: () => Date;
}

function message(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "操作失败，请重试。";
}

function readPrefs(storage: WorkbenchEnv["storage"]): Partial<Prefs> {
  try {
    return parseWorkbenchPrefs(storage?.getItem(PREFS_KEY));
  } catch {
    return {};
  }
}

export function createWorkbench(env: WorkbenchEnv) {
  const now = env.now ?? (() => new Date());
  const store = createWorkbenchStore(readPrefs(env.storage));
  const get = () => store.getSnapshot();
  const recovery = createServiceRecovery(env.api, store, async () => { await refreshAll(); if (get().main === "notes") await notes.refresh(); });
  const api = recovery.api;
  let libraryOrder: string[] | null = null;
  const notes = createNotesController({ api, store, now, notify, failure, changed: (id) => readerSync.notesChanged(id) });
  const readerSync = createReaderSync({ api, store, notify, failure, loadDetail, refreshDesk,
    refreshNotes: () => get().main === "notes" ? notes.refresh() : Promise.resolve() });
  const readerOpen = createReaderActions({ api, store, rowById, notify, failure, opened: readerSync.opened });
  const settings = createSettingsNavigation(store, env.createSettingsServices);
  let listAbort: AbortController | null = null;
  let deskAbort: AbortController | null = null;
  let detailToken = 0;
  let noticeId = 0;
  // Functions cannot enter the store's structuredClone snapshots.
  let noticeUndo: (() => void) | undefined;
  const stopPreferences = syncWorkbenchPreferences(store, env.storage, env.preferenceEvents === undefined ? preferenceEvents(env.storage) : env.preferenceEvents,
    (retry) => failure(new Error("偏好未能保存到本机，本次设置仍有效。"), retry), setPrefs);

  function notify(text: string, tone: Notice["tone"] = "info", undo?: () => void, actionLabel = "撤销") {
    noticeId += 1;
    noticeUndo = undo;
    store.actions.notify({ id: noticeId, tone, text, canUndo: Boolean(undo), actionLabel: undo ? actionLabel : undefined });
  }

  function failure(error: unknown, retry: () => Promise<unknown>) {
    notify(message(error), "error", () => { void retry().catch((next) => failure(next, retry)); }, "重试");
  }

  function dismissNotice() {
    noticeUndo = undefined;
    store.actions.notify(null);
  }

  function undoNotice(id: number) {
    if (get().notice?.id !== id) return;
    const undo = noticeUndo;
    dismissNotice();
    undo?.();
  }

  async function refreshList() {
    listAbort?.abort();
    const controller = new AbortController();
    listAbort = controller;
    const state = get();
    store.actions.listLoading();
    try {
      const result = await api.list(
        { view: state.view, groupId: state.groupId, tag: state.tag, query: state.query, sort: state.sort, order: state.order },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      store.actions.listLoaded(result);
      const focus = get().selectedIds[0];
      if (!focus && result.items.length) select(result.items[0].id);
      else if (focus) void loadDetail(focus);
    } catch (error) {
      if (!controller.signal.aborted) store.actions.listFailed(message(error));
    }
  }

  async function refreshDesk() {
    deskAbort?.abort();
    const controller = new AbortController();
    deskAbort = controller;
    store.actions.deskLoading();
    try {
      const data = await api.desk(localMidnightIso(now()), controller.signal);
      if (!controller.signal.aborted) store.actions.deskLoaded(data);
    } catch (error) {
      if (!controller.signal.aborted) store.actions.deskFailed(message(error));
    }
  }

  async function refreshJobs() {
    if (!api.ocrJobs) return;
    try {
      const { jobs } = await api.ocrJobs();
      store.actions.patch({ ocrJobs: jobs });
    } catch {
      // OCR is optional; the status bar simply shows nothing.
    }
  }

  async function refreshAll() {
    await Promise.all([refreshList(), refreshDesk(), refreshJobs()]);
  }

  async function loadDetail(id: string) {
    const token = ++detailToken;
    store.actions.detailLoading();
    try {
      const item = await api.item(id);
      if (token === detailToken) store.actions.detailLoaded(item);
    } catch (error) {
      if (token === detailToken) store.actions.detailFailed(message(error));
    }
  }

  function select(id: string, mode: "single" | "toggle" | "range" = "single") {
    if (mode === "range" && libraryOrder) store.actions.patch({ selectedIds: rangeSelection(libraryOrder, get().anchorId, id) });
    else store.actions.select(id, mode);
    store.actions.patch({ selectionFocusId: id });
    const focus = mode === "single" ? id : get().selectedIds[get().selectedIds.length - 1];
    if (focus) void loadDetail(focus);
    else store.actions.detailLoaded(null);
  }

  function moveSelection(delta: number, extend = false) {
    const order = libraryOrder ?? get().list.result?.items.map((row) => row.id) ?? [];
    if (!order.length) return;
    const current = get().selectionFocusId ?? get().selectedIds[get().selectedIds.length - 1];
    const index = order.indexOf(current);
    const next = order[Math.min(order.length - 1, Math.max(0, index < 0 ? 0 : index + delta))];
    select(next, extend ? "range" : "single");
  }

  function rowById(id: string): WorkbenchRow | undefined {
    return get().list.result?.items.find((row) => row.id === id)
      ?? get().desk.data?.continue_reading.find((row) => row.id === id)
      ?? get().desk.data?.to_read.find((row) => row.id === id)
      ?? get().desk.data?.recent_items.find((row) => row.id === id);
  }

  async function mutate<T>(work: () => Promise<T>, success?: string): Promise<T | null> {
    try {
      const result = await work();
      if (get().notice?.tone === "error") dismissNotice();
      if (success) notify(success, "success");
      await Promise.all([refreshList(), get().main === "desk" ? refreshDesk() : Promise.resolve()]);
      return result;
    } catch (error) {
      failure(error, () => mutate(work, success));
      return null;
    }
  }

  function setMain(main: MainView) {
    return notes.beforeLeave(() => {
      store.actions.patch({ main, activeTab: LIBRARY_TAB });
      void (main === "desk" ? refreshDesk() : main === "notes" ? notes.refresh() : refreshList());
    });
  }

  function browse(changes: Partial<Pick<WorkbenchState, "view" | "groupId" | "tag" | "query">>) {
    return notes.beforeLeave(() => { store.actions.showLibrary(changes); void refreshList(); });
  }

  function setPrefs(changes: Partial<Prefs>) {
    const sortChanged = ("sort" in changes && changes.sort !== get().sort) || ("order" in changes && changes.order !== get().order);
    store.actions.patch({ ...changes, ...normalizeTypography({ ...get(), ...changes }) });
    if (sortChanged) void refreshList();
  }

  const updateState = (id: string, patch: WorkbenchStatePatch, success?: string) =>
    mutate(() => api.updateState(id, patch), success);

  async function toggleStar(ids: string[]) {
    const rows = ids.map(rowById).filter(Boolean) as WorkbenchRow[];
    const starred = !rows.every((row) => row.starred);
    await mutate(() => Promise.all(ids.map((id) => api.updateState(id, { starred }))), starred ? "已加星标" : "已取消星标");
  }

  const setReadStatus = (ids: string[], read_status: ReadStatus) =>
    mutate(() => Promise.all(ids.map((id) => api.updateState(id, { read_status }))));

  async function updateMetadata(id: string, patch: Partial<ItemInput>) {
    const ok = await mutate(() => api.updateItem(id, patch as ItemInput), "已保存");
    if (ok) await loadDetail(id);
  }

  async function applyPdfMetadata(id: string, token: string) {
    const item = await mutate(() => api.applyPdfMetadata(id, token), "已采用 PDF 识别信息");
    if (item) {
      store.actions.patch(mergeReaderRow(get(), await api.row(id)));
      if (get().selectedIds.includes(id)) await loadDetail(id);
    }
    return Boolean(item);
  }

  const setMembership = (groupId: string, add: string[], remove: string[] = []) =>
    mutate(() => api.changeGroup(groupId, add, remove));

  async function createGroup(name: string, parentId: string | null, addItems: string[] = []) {
    let created: Awaited<ReturnType<typeof api.createGroup>> | null = null;
    const group = await mutate(async () => {
      created ??= await api.createGroup(name.trim(), parentId);
      if (addItems.length) await api.changeGroup(created.id, addItems);
      return created;
    }, `已新建分组「${name.trim()}」`);
    if (group && parentId && !get().expandedGroups.includes(parentId)) store.actions.toggleGroupExpanded(parentId);
    return group;
  }

  const renameGroup = (id: string, name: string) => mutate(() => api.renameGroup(id, name.trim()), "分组已改名");

  async function deleteGroup(id: string) {
    const done = await mutate(() => api.deleteGroup(id), "分组已删除，文献仍在文献库中");
    if (done && get().groupId === id) browse({});
  }

  async function trash(ids: string[]) {
    if (!ids.length) return;
    const done = await mutate(() => api.trash(ids));
    if (done) notify(`已移到回收站（${ids.length} 篇）`, "info", () => void mutate(() => api.restore(ids), "已恢复"));
  }

  const restore = (ids: string[]) => mutate(() => api.restore(ids), `已恢复 ${ids.length} 篇`);

  async function openReader(itemId: string, target?: ReaderTarget) {
    return await notes.beforeLeave(() => readerOpen(itemId, target));
  }

  function revealNotePaper(itemId: string) {
    return notes.beforeLeave(async () => {
      store.actions.showLibrary({});
      await refreshList(); select(itemId);
    });
  }

  const translations = createTranslations({ api, store, notify, openReader, refreshDesk, loadConfig: env.translationConfig });

  const autoTranslation = createAutoTranslation({ api, store, notify, config: env.translationConfig });
  const importPdfs = createPdfImporter({ api, group: () => get().groupId, notify, failure,
    refresh: refreshAll, select: revealNotePaper, imported: autoTranslation.enqueue });

  return {
    ...settings,
    translations,
    autoTranslation,
    openSettings: (...args: Parameters<typeof settings.openSettings>) => notes.beforeLeave(() => settings.openSettings(...args)),
    notes,
    revealNotePaper,
    leave: notes.beforeLeave,
    store,
    notify,
    failure,
    retryService: recovery.retry,
    dispose: () => { stopPreferences(); recovery.dispose(); autoTranslation.dispose(); },
    setLibraryOrder: (order: string[] | null) => { libraryOrder = order; },
    setShortcuts: (shortcutsOpen: boolean) => store.actions.patch({ shortcutsOpen }),
    dismissNotice,
    undoNotice,
    refreshList,
    refreshDesk,
    refreshJobs,
    refreshAll,
    select,
    moveSelection,
    rowById,
    setMain,
    browse,
    setPrefs,
    setQuery: (query: string) => browse({ view: get().view, groupId: get().groupId, tag: get().tag, query }),
    toggleGroupExpanded: (id: string) => store.actions.toggleGroupExpanded(id),
    updateState,
    toggleStar,
    setReadStatus,
    updateMetadata,
    applyPdfMetadata,
    setMembership,
    createGroup,
    renameGroup,
    deleteGroup,
    trash,
    restore,
    openReader,
    readerProgress: readerSync.progress,
    readerNotesChanged: readerSync.notesChanged,
    activateTab: (id: string) => notes.beforeLeave(() => store.actions.patch({ activeTab: id })),
    closeTab: (id: string) => store.actions.closeTab(id),
    setPalette: (paletteOpen: boolean) => store.actions.patch({ paletteOpen }),
    importPdfs,
    api,
  };
}

export type Workbench = ReturnType<typeof createWorkbench>;
