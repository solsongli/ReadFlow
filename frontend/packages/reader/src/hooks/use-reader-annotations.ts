// Reader annotations retain localStorage by default; explicit hosts can persist to a scoped service.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildNotesMarkdown, createNoteId, groupNotesByPage, notesStorageKey, sortNotes,
  type ReaderNote, type ReaderNotePane, type ReaderNotesDocKey,
} from "../annotations/types.js";
import { loadNotes, saveNotes } from "../annotations/storage.js";
import { getReaderAdapters } from "../adapters.js";

type State = { key: string; notes: ReaderNote[]; loading: boolean; saving: boolean; error: string | null };
export type ReaderAnnotationsApi = {
  notes: ReaderNote[];
  groups: Array<{ page: number; items: ReaderNote[] }>;
  addFromQuote: (input: { page: number; pane: ReaderNotePane; quote: string; note?: string }) => ReaderNote | null | Promise<ReaderNote | null>;
  updateNote: (id: string, note: string) => void | Promise<boolean>;
  remove: (id: string) => void | Promise<boolean>;
  exportMarkdown: (title?: string) => Promise<boolean>;
  count: number;
  loading: boolean;
  saving: boolean;
  error: string | null;
  storageMode: "local" | "server";
  reload: () => void;
};

export function useReaderAnnotations(doc: ReaderNotesDocKey, options: { onAfterAdd?: () => void } = {}): ReaderAnnotationsApi {
  const docKey = useMemo(() => ({
    jobId: `${doc.jobId || ""}`.trim(), documentId: `${doc.documentId || ""}`.trim(),
  }), [doc.jobId, doc.documentId]);
  const port = getReaderAdapters()?.annotationDataPort ?? null;
  const scope = port?.resolveScope(docKey) ?? null;
  const key = port ? `server:${scope?.key || "unresolved"}:${docKey.documentId}:${docKey.jobId}` : notesStorageKey(docKey);
  const [state, setState] = useState<State>(() => ({
    key, notes: port ? [] : loadNotes(docKey), loading: Boolean(port && scope), saving: false, error: null,
  }));
  const [reloadVersion, setReloadVersion] = useState(0);
  const activeKey = useRef(key); activeKey.current = key;
  const current = useRef(state); current.current = state;
  const epoch = useRef(0);
  const mounted = useRef(false);
  const tail = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  const onAfterAdd = options.onAfterAdd;
  const publish = useCallback((patch: Partial<State>) => {
    const value = { ...current.current, ...patch };
    current.current = value;
    setState(value);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const generation = ++epoch.current;
    const abort = new AbortController();
    pending.current = 0;
    tail.current = Promise.resolve();
    publish({ key, notes: port ? [] : loadNotes(docKey), loading: Boolean(port && scope), saving: false, error: null });
    if (port && scope) {
      port.load(scope, { signal: abort.signal }).then((notes) => {
        if (mounted.current && generation === epoch.current && activeKey.current === key) {
          publish({ notes: sortNotes(notes), loading: false });
        }
      }).catch((error) => {
        if (!abort.signal.aborted && mounted.current && generation === epoch.current && activeKey.current === key) {
          publish({ loading: false, error: `批注读取失败：${error instanceof Error ? error.message : "请重试"}` });
        }
      });
    }
    return () => { mounted.current = false; abort.abort(); };
  }, [key, port, reloadVersion, publish]);

  useEffect(() => {
    if (!port && state.key === key) saveNotes(docKey, state.notes);
  }, [port, state.notes, state.key, key, docKey]);

  const nativeMutation = useCallback(async <T,>(work: () => Promise<T>, apply: (result: T) => void): Promise<T | null> => {
    const generation = epoch.current;
    const isCurrent = () => mounted.current && generation === epoch.current && activeKey.current === key;
    if (!scope || current.current.key !== key || current.current.loading || current.current.error) {
      publish({ error: current.current.error || "批注尚未载入，请稍后重试。" });
      onAfterAdd?.();
      return null;
    }
    pending.current++;
    publish({ saving: true, error: null });
    const previous = tail.current;
    let finish!: () => void;
    tail.current = new Promise<void>((resolve) => { finish = resolve; });
    try {
      await previous;
      if (!isCurrent()) return null;
      const result = await work();
      if (!isCurrent()) return null;
      apply(result);
      return result;
    } catch (error) {
      if (isCurrent()) publish({ error: `批注保存失败：${error instanceof Error ? error.message : "请重试，原批注未被改动"}` });
      return null;
    } finally {
      finish();
      if (isCurrent()) { pending.current--; publish({ saving: pending.current > 0 }); }
    }
  }, [key, scope?.key, onAfterAdd, publish]);

  const addFromQuote = useCallback((input: { page: number; pane: ReaderNotePane; quote: string; note?: string }) => {
    const quote = `${input.quote || ""}`.trim();
    if (!quote) return null;
    const item: ReaderNote = {
      id: createNoteId(), page: Math.max(1, Math.floor(Number(input.page) || 1)),
      pane: input.pane === "translated" ? "translated" : "source", quote,
      note: `${input.note || ""}`.trim(), createdAt: new Date().toISOString(),
    };
    if (!port) {
      publish({ notes: sortNotes([item, ...current.current.notes]) }); onAfterAdd?.(); return item;
    }
    onAfterAdd?.();
    if (!Number.isInteger(input.page) || input.page < 1) {
      publish({ error: "原文页码无效，批注未保存。" }); return null;
    }
    return nativeMutation(() => port.create(scope!, item), (saved) => {
      publish({ notes: sortNotes([saved, ...current.current.notes.filter((note) => note.id !== saved.id)]) });
    });
  }, [port, scope?.key, nativeMutation, onAfterAdd, publish]);

  const updateNote = useCallback((id: string, note: string) => {
    const next = `${note || ""}`.trim();
    if (!port) { publish({ notes: current.current.notes.map((entry) => entry.id === id ? { ...entry, note: next } : entry) }); return; }
    return nativeMutation(async () => {
      const entry = current.current.notes.find((entry) => entry.id === id);
      if (!entry) throw new Error("批注已不存在，请重新载入。");
      return port.update(scope!, { ...entry, note: next });
    }, (saved) => publish({ notes: sortNotes(current.current.notes.map((entry) => entry.id === id ? saved : entry)) })).then(Boolean);
  }, [port, scope?.key, nativeMutation, publish]);

  const remove = useCallback((id: string) => {
    if (!port) { publish({ notes: current.current.notes.filter((entry) => entry.id !== id) }); return; }
    return nativeMutation(async () => {
      if (!current.current.notes.some((entry) => entry.id === id)) throw new Error("批注已不存在，请重新载入。");
      await port.remove(scope!, id);
      return true;
    }, () => publish({ notes: current.current.notes.filter((entry) => entry.id !== id) })).then(Boolean);
  }, [port, scope?.key, nativeMutation, publish]);

  const visible = state.key === key ? state : { ...state, notes: [], error: null, loading: Boolean(port && scope) };
  const notes = visible.notes;
  const exportMarkdown = useCallback(async (title = "") => {
    try { await navigator.clipboard?.writeText?.(buildNotesMarkdown(title, notes)); return true; }
    catch { return false; }
  }, [notes]);
  return {
    notes, groups: useMemo(() => groupNotesByPage(notes), [notes]), addFromQuote, updateNote, remove,
    exportMarkdown, count: notes.length, loading: visible.loading, saving: visible.saving, error: visible.error,
    storageMode: port ? "server" : "local", reload: () => setReloadVersion((version) => version + 1),
  };
}
