import type { WorkbenchApi } from "@/platform/api/workbench.js";
import type { WorkbenchNoteRecord, WorkbenchNotesQuery } from "@/platform/contracts/workbench.js";
import { downloadBlob } from "@/platform/utils/downloads.js";
import { editableNote, emptyNote, noteNeedsSave, type NotesState } from "../domain/notes.js";
import { exportNotesMarkdown } from "../domain/notes-format.js";
import { LIBRARY_TAB, type WorkbenchStore } from "../domain/workbench-store.js";

type Paper = { id: string; title: string; title_translated?: string };
export function createNotesController({ api, store, now = () => new Date(), changed, notify, failure, timers }: {
  api: WorkbenchApi; store: WorkbenchStore; now?: () => Date;
  changed: (itemId: string) => Promise<void>;
  notify: (text: string, tone?: "info" | "success" | "error") => void;
  failure?: (error: unknown, retry: () => Promise<unknown>) => void;
  timers?: { set: (run: () => void, ms: number) => unknown; clear: (id: unknown) => void };
}) {
  const get = () => store.getSnapshot().notes;
  const patch = (value: Partial<NotesState>) => store.actions.patch({ notes: { ...get(), ...value } });
  const setTimer = timers?.set ?? ((run: () => void, ms: number) => setTimeout(run, ms));
  const clearTimer = timers?.clear ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let timer: unknown, request: AbortController | null = null, draftNumber = 0;
  let saving: Promise<boolean> | null = null;
  let hadSaveError = false;
  const stopTimer = () => { if (timer != null) clearTimer(timer); timer = undefined; };
  const queryOf = (): WorkbenchNotesQuery => ({ itemId: get().itemId, query: get().query, kind: get().kind });

  async function refresh(more = false, preferredId?: string) {
    if (!api.notes) return;
    request?.abort();
    const abort = new AbortController(); request = abort;
    const previous = more ? get().result?.items ?? [] : [];
    patch({ status: "loading", error: "" });
    try {
      const result = await api.notes({ ...queryOf(), offset: previous.length }, abort.signal);
      if (abort.signal.aborted) return;
      const items = [...previous, ...result.items.filter((note) => !previous.some((entry) => entry.id === note.id))];
      const current = get().draft;
      const selected = items.find((note) => note.id === (preferredId ?? current?.note.id)) ?? items[0];
      patch({ result: { ...result, items }, status: "ready",
        draft: current && (current.isNew || noteNeedsSave(current)) ? current : selected ? editableNote(selected) : null });
    } catch { if (!abort.signal.aborted) patch({ status: "error", error: "笔记没有加载出来，请重试。" }); }
  }

  function edit(body: string) {
    const draft = get().draft;
    if (!draft) return;
    patch({ draft: { ...draft, body, status: "dirty", error: "" } });
    stopTimer(); timer = setTimer(() => { void flush(); }, 800);
  }
  function flush(): Promise<boolean> {
    stopTimer();
    if (saving) return saving;
    if (!noteNeedsSave(get().draft)) return Promise.resolve(true);
    const work = async () => {
      while (noteNeedsSave(get().draft)) {
        const snapshot = get().draft!;
        if (!snapshot.body.trim() && snapshot.note.kind === "note") {
          if (snapshot.isNew) { patch({ draft: { ...snapshot, savedBody: snapshot.body, status: "idle" } }); return true; }
          patch({ draft: { ...snapshot, status: "error", error: "空白笔记无法保存，可删除这条笔记。" } }); return false;
        }
        patch({ draft: { ...snapshot, status: "saving", error: "" } });
        try {
          const saved = snapshot.isNew ? await api.createNote(snapshot.note.item_id, { body: snapshot.body }) : await api.updateNote(snapshot.note.id, snapshot.body);
          const latest = get().draft;
          if (!latest || latest.note.id !== snapshot.note.id) return false;
          const note = { ...snapshot.note, ...saved, body: snapshot.body } as WorkbenchNoteRecord;
          const result = get().result;
          patch({ draft: { ...latest, note, isNew: false, savedBody: snapshot.body, status: latest.body === snapshot.body ? "saved" : "dirty", error: "" },
            result: result ? { ...result, items: result.items.map((row) => row.id === note.id ? note : row) } : result });
          // Refresh counts/detail/desk through the same path as Reader notifications.
          if (hadSaveError) { hadSaveError = false; notify("笔记已保存。", "success"); }
          void changed(note.item_id);
        } catch (failure) {
          hadSaveError = true;
          const current = get().draft;
          if (current) patch({ draft: { ...current, status: "error", error: failure instanceof Error ? failure.message : "保存失败，请重试。" } });
          reportFailure(failure, flush);
          return false;
        }
      }
      return true;
    };
    saving = work().finally(() => { saving = null; });
    return saving;
  }
  function reportFailure(error: unknown, retry: () => Promise<unknown>) {
    if (failure) failure(error, retry); else notify(error instanceof Error ? error.message : "操作失败，请重试。", "error");
  }
  function beforeLeave<T>(work: () => T): T | Promise<T | false> {
    if (!noteNeedsSave(get().draft)) return work();
    return flush().then((ok) => { if (ok) return work(); reportFailure(new Error(get().draft?.error || "笔记尚未保存，请重试后再离开。"), flush); return false; });
  }
  function open(item: Paper | null = null, noteId?: string) {
    return beforeLeave(() => {
      store.actions.patch({ main: "notes", activeTab: LIBRARY_TAB });
      patch({ itemId: item?.id ?? null, itemTitle: item?.title ?? "", query: "", kind: "all", result: null, draft: null });
      void refresh(false, noteId);
    });
  }
  function filters(value: Partial<Pick<NotesState, "itemId" | "itemTitle" | "query" | "kind">>) {
    return beforeLeave(() => { patch({ ...value, result: null, draft: null }); void refresh(); });
  }
  function select(note: WorkbenchNoteRecord) { return beforeLeave(() => patch({ draft: editableNote(note) })); }
  function createFor(item: Paper) {
    return beforeLeave(() => {
      store.actions.patch({ main: "notes", activeTab: LIBRARY_TAB });
      patch({ itemId: item.id, itemTitle: item.title, query: "", kind: "all", pickerOpen: false,
        draft: editableNote(emptyNote(item, `draft:${++draftNumber}`, now()), true), result: null });
      void refresh();
    });
  }
  function create() {
    return beforeLeave(() => {
      const state = store.getSnapshot();
      if (state.main === "notes" && state.activeTab === LIBRARY_TAB && get().itemId) return createFor({ id: get().itemId!, title: get().itemTitle });
      store.actions.patch({ main: "notes", activeTab: LIBRARY_TAB });
      patch({ itemId: null, itemTitle: "", query: "", kind: "all", result: null, draft: null, pickerOpen: true });
      void refresh();
    });
  }
  async function remove() {
    stopTimer();
    if (saving) await saving;
    const draft = get().draft;
    if (!draft) return;
    try {
      if (!draft.isNew) await api.deleteNote(draft.note.id);
      patch({ draft: null });
      hadSaveError = false;
      if (!draft.isNew) { notify("笔记已删除。", "success"); void changed(draft.note.item_id); }
      await refresh();
    } catch (error) { reportFailure(error, remove); }
  }
  async function exportAll() {
    if (!await flush()) return;
    const query = queryOf(), rows: WorkbenchNoteRecord[] = [];
    try {
      for (let offset = 0; ; offset += 1000) {
        const page = await api.notes({ ...query, limit: 1000, offset });
        rows.push(...page.items);
        if (!page.items.length || offset + page.items.length >= page.total) break;
      }
      const unique = [...new Map(rows.map((row) => [row.id, row])).values()];
      downloadBlob(new Blob([exportNotesMarkdown(unique)], { type: "text/markdown;charset=utf-8" }), "ReadFlow-笔记.md");
      notify(`已导出 ${unique.length} 条笔记与批注。`, "success");
    } catch (error) { reportFailure(error, exportAll); }
  }
  function dispose() { stopTimer(); request?.abort(); }
  return { refresh, edit, flush, beforeLeave, open, filters, select, create, createFor, remove, exportAll, dispose,
    setPicker: (pickerOpen: boolean) => patch({ pickerOpen }) };
}
