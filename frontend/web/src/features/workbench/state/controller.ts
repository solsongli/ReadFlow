// 工作台副作用：所有网络请求、偏好持久化、通知都在这里。UI 只调用这些方法。
import type { WorkbenchApi } from "@/platform/api/workbench.js";
import type { ReadStatus, WorkbenchRow, WorkbenchStatePatch } from "@/platform/contracts/workbench.js";
import type { ItemInput } from "@/platform/contracts/research-library.js";
import { localMidnightIso } from "../domain/format.js";
import {
  createWorkbenchStore,
  DEFAULT_PREFS,
  LIBRARY_TAB,
  prefsOf,
  type MainView,
  type Notice,
  type Prefs,
  type WorkbenchState,
} from "../domain/workbench-store.js";

export interface WorkbenchEnv {
  api: WorkbenchApi;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  now?: () => Date;
}

const PREFS_KEY = "readflow.workbench.prefs.v1";

function message(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "操作失败，请重试。";
}

function readPrefs(storage: WorkbenchEnv["storage"]): Partial<Prefs> {
  try {
    const raw = storage?.getItem(PREFS_KEY);
    const value = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== "object") return {};
    const prefs: Partial<Prefs> = {};
    for (const key of Object.keys(DEFAULT_PREFS) as Array<keyof Prefs>) {
      if (key in value && typeof value[key] === typeof DEFAULT_PREFS[key]) (prefs as Record<string, unknown>)[key] = value[key];
    }
    return prefs;
  } catch {
    return {};
  }
}

export function createWorkbench(env: WorkbenchEnv) {
  const { api } = env;
  const now = env.now ?? (() => new Date());
  const store = createWorkbenchStore(readPrefs(env.storage));
  const get = () => store.getSnapshot();
  let listAbort: AbortController | null = null;
  let deskAbort: AbortController | null = null;
  let detailToken = 0;
  let noticeId = 0;
  let savedPrefs = JSON.stringify(prefsOf(get()));

  store.subscribe((state) => {
    const next = JSON.stringify(prefsOf(state));
    if (next === savedPrefs) return;
    savedPrefs = next;
    try {
      env.storage?.setItem(PREFS_KEY, next);
    } catch {
      // Private mode or blocked storage: preferences simply do not persist.
    }
  });

  function notify(text: string, tone: Notice["tone"] = "info", undo?: () => void) {
    noticeId += 1;
    store.actions.notify({ id: noticeId, tone, text, undo });
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
    store.actions.select(id, mode);
    const focus = mode === "single" ? id : get().selectedIds[get().selectedIds.length - 1];
    if (focus) void loadDetail(focus);
    else store.actions.detailLoaded(null);
  }

  function moveSelection(delta: number) {
    const items = get().list.result?.items ?? [];
    if (!items.length) return;
    const current = get().selectedIds[get().selectedIds.length - 1];
    const index = Math.max(0, items.findIndex((row) => row.id === current));
    const next = items[Math.min(items.length - 1, Math.max(0, current ? index + delta : 0))];
    select(next.id);
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
      if (success) notify(success, "success");
      await Promise.all([refreshList(), get().main === "desk" ? refreshDesk() : Promise.resolve()]);
      return result;
    } catch (error) {
      notify(message(error), "error");
      return null;
    }
  }

  function setMain(main: MainView) {
    store.actions.patch({ main, activeTab: LIBRARY_TAB });
    void (main === "desk" ? refreshDesk() : refreshList());
  }

  function browse(changes: Partial<Pick<WorkbenchState, "view" | "groupId" | "tag" | "query">>) {
    store.actions.showLibrary(changes);
    void refreshList();
  }

  function setPrefs(changes: Partial<Prefs>) {
    const sortChanged = ("sort" in changes && changes.sort !== get().sort) || ("order" in changes && changes.order !== get().order);
    store.actions.patch(changes);
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

  const setMembership = (groupId: string, add: string[], remove: string[] = []) =>
    mutate(() => api.changeGroup(groupId, add, remove));

  async function createGroup(name: string, parentId: string | null, addItems: string[] = []) {
    const group = await mutate(async () => {
      const created = await api.createGroup(name.trim(), parentId);
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

  async function openReader(itemId: string) {
    const row = rowById(itemId);
    const title = row?.title ?? get().detail.item?.title ?? "阅读";
    const attachmentId = row?.attachment_id ?? get().detail.item?.attachments?.[0]?.id ?? null;
    const tabId = "reader:" + itemId;
    if (!attachmentId) {
      notify("这篇文献还没有 PDF 附件。", "error");
      return;
    }
    if (get().tabs.some((tab) => tab.id === tabId)) {
      store.actions.patch({ activeTab: tabId });
      return;
    }
    store.actions.openTab({ id: tabId, itemId, title, url: null, status: "loading", error: null });
    try {
      const result = await api.nativeReader(attachmentId);
      const url = result.attachment?.reader_url ?? null;
      if (!url) throw new Error(result.native_bridge?.message || "阅读器暂不可用。");
      store.actions.updateTab(tabId, { url, status: "ready" });
      void api.markOpened(itemId).then(() => refreshList()).catch(() => undefined);
    } catch (error) {
      store.actions.updateTab(tabId, { status: "error", error: message(error) });
    }
  }

  async function importPdfs(files: File[]) {
    const pdfs = files.filter((file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name));
    if (!pdfs.length) {
      notify("只能导入 PDF 文件。", "error");
      return;
    }
    let imported = 0;
    for (const file of pdfs) {
      try {
        const result = await api.upload(file);
        imported += 1;
        const groupId = get().groupId;
        if (groupId && result.item?.id) await api.changeGroup(groupId, [result.item.id]);
      } catch (error) {
        notify(`${file.name}：${message(error)}`, "error");
      }
    }
    if (imported) notify(`已导入 ${imported} 个 PDF`, "success");
    await refreshAll();
  }

  return {
    store,
    notify,
    dismissNotice: () => store.actions.notify(null),
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
    setMembership,
    createGroup,
    renameGroup,
    deleteGroup,
    trash,
    restore,
    openReader,
    activateTab: (id: string) => store.actions.patch({ activeTab: id }),
    closeTab: (id: string) => store.actions.closeTab(id),
    setPalette: (paletteOpen: boolean) => store.actions.patch({ paletteOpen }),
    importPdfs,
    api,
  };
}

export type Workbench = ReturnType<typeof createWorkbench>;
