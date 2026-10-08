import { annotationsMarkdown } from "../../domain/annotations/export.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { annotationApi } from "./api.js";
import { remember, step, type AnnotationHistory, type Change } from "../../domain/annotations/history.js";
import type { Annotation, AnnotationColor, Semantics, Tool } from "../../domain/annotations/types.js";
import { downloadBlob } from "@/platform/utils/downloads.js";

export function useAnnotations(
  item: string,
  attachment: string,
  active: boolean,
  changed: () => void,
  labels: Semantics,
  citation: string,
  cite: (row: Annotation) => string,
) {
  const api = useMemo(() => annotationApi(item), [item]);
  const [rows, setRows] = useState<Annotation[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState<AnnotationColor>("yellow");
  const [width, setWidth] = useState<1 | 2 | 4>(2);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [deletion, setDeletion] = useState<{ ids: string[]; count: number; cards?: number } | null>(null);
  const deletePolicy = useRef("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tagCatalog, setTagCatalog] = useState<string[]>([]);
  const [marginFollowFilters, setMarginFollowFilters] = useState(false);
  const [filteredIds, setFilteredIds] = useState<string[] | null>(null);
  const history = useRef<AnnotationHistory>({ past: [], future: [] });
  const current = useRef(rows);
  const locked = useRef(false);
  const revision = useRef(0);
  const retry = useRef<() => void>(() => void load());
  current.current = rows;
  async function load() {
    const version = revision.current;
    try {
      const [values, tags] = await Promise.all([api.list(), api.tags()]);
      if (!locked.current && version === revision.current) {
        setRows(values.filter((row) => row.attachment_id === attachment || !row.attachment_id));
        setTagCatalog(tags);
      }
      setError("");
    } catch (failure) {
      setError(String((failure as Error).message));
    }
  }
  useEffect(() => {
    if (active) {
      void load();
    }
  }, [api, active]);
  useEffect(() => {
    if (!flash) {
      return;
    }
    const timer = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(timer);
  }, [flash]);
  async function apply(changes: Change[], record = true): Promise<boolean> {
    if (locked.current) {
      return false;
    }
    locked.current = true;
    revision.current++;
    setBusy(true);
    setError("");
    const done: Change[] = [];
    try {
      for (const change of changes) {
        let before = change.before;
        if (before?.image_ref && !before.image) {
          before = { ...before, image: await api.image(before) };
          change.before = before;
        }
        let after = change.after;
        if (after) {
          const saved = await api.save(after, !!before);
          after = { ...saved, image: after.image };
        } else if (before) {
          await api.remove(before.id, deletePolicy.current);
        }
        const identity = (after ?? before)!.id;
        const next = current.current.filter((row) => row.id !== identity);
        if (after) {
          next.push(after);
          if (after.tags?.length)
            setTagCatalog((catalog) => [...new Set([...catalog, ...after!.tags])].sort((a, b) => a.localeCompare(b)));
        }
        current.current = next;
        setRows(next);
        done.push({ before, after });
      }
      if (record) {
        history.current = remember(history.current, done);
      }
      changed();
      return true;
    } catch {
      if (done.length) {
        history.current = remember(history.current, done);
      }
      changed();
      setError("部分批注未能保存，请重试；已保存的操作可以撤销。");
      retry.current = () => void apply(changes.slice(done.length), record);
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function draft(value: Partial<Annotation>) {
    const random = crypto.getRandomValues(new Uint32Array(4)).join("-");
    const timestamp = new Date().toISOString();
    const row: Annotation = {
      id: `annotation-${random}`,
      item_id: item,
      attachment_id: attachment,
      page_index: 0,
      type: "highlight",
      color,
      rects: [],
      quote: "",
      note: "",
      ink: [],
      width,
      image_ref: "",
      tags: [],
      created_at: timestamp,
      updated_at: timestamp,
      ...value,
    };
    return row;
  }
  function createBatch(values: Partial<Annotation>[]) {
    const rows = values.map(draft);
    setEditingId(rows[0]?.id ?? null);
    return apply(rows.map((after) => ({ before: null, after })));
  }
  async function createLinked(values: Partial<Annotation>[]) {
    const rows = values.map(draft);
    return (await apply(rows.map((after) => ({ before: null, after })))) ? rows.map((row) => row.id) : [];
  }
  function create(value: Partial<Annotation>) {
    return createBatch([value]);
  }
  function update(ids: string[], patch: Partial<Annotation>) {
    return apply(
      current.current
        .filter((row) => ids.includes(row.id))
        .map((before) => ({
          before,
          after: { ...before, ...patch },
        })),
    );
  }
  async function remove(ids: string[]) {
    try {
      const references = (await api.references()).filter((reference) =>
        ids.includes(reference.annotation_id),
      );
      const cards = (await api.cards()).filter((card) => ids.includes(card.annotation_id));
      if (references.length || cards.length) {
        setDeletion({
          ids,
          count: new Set(references.map((row) => row.canvas_id)).size,
          cards: cards.length,
        });
        return false;
      }
      deletePolicy.current = "";
      return apply(
        current.current.filter((row) => ids.includes(row.id)).map((before) => ({ before, after: null })),
      );
    } catch (failure) {
      setError((failure as Error).message);
      retry.current = () => void remove(ids);
      return false;
    }
  }
  async function confirmDeletion(policy: "keep" | "remove") {
    if (!deletion) {
      return;
    }
    deletePolicy.current = policy;
    if (
      await apply(
        current.current
          .filter((row) => deletion.ids.includes(row.id))
          .map((before) => ({ before, after: null })),
      )
    ) {
      setDeletion(null);
      setEditingId(null);
    }
  }
  async function travel(redo: boolean) {
    const result = step(history.current, redo);
    if (result && (await apply(result.changes, false))) {
      history.current = result.history;
    }
  }
  async function exportRows(ids: string[], asNote = false) {
    try {
      if (asNote) {
        await api.export(ids, labels, true);
        changed();
        setNotice("已整理成笔记，可在笔记空间继续编辑。");
      } else {
        downloadBlob(
          new Blob(
            [
              annotationsMarkdown(
                current.current.filter((row) => ids.includes(row.id)),
                labels,
                citation,
              ),
            ],
            { type: "text/markdown;charset=utf-8" },
          ),
          "ReadFlow-批注.md",
        );
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "批注导出失败，请重试。");
      retry.current = () => void exportRows(ids, asNote);
    }
  }
  return {
    item,
    deletion,
    setDeletion,
    confirmDeletion,
    rows,
    tool,
    setTool: (value: Tool) => {
      setTool(value);
      setEditingId(null);
    },
    color,
    setColor,
    width,
    setWidth,
    editingId,
    setEditingId,
    selected,
    setSelected,
    hover,
    setHover,
    flash,
    setFlash,
    busy,
    error,
    notice,
    setNotice,
    tagCatalog,
    marginFollowFilters,
    setMarginFollowFilters,
    filteredIds,
    setFilteredIds,
    citation: cite,
    create,
    createBatch,
    createLinked,
    update,
    remove,
    travel,
    exportRows,
    canUndo: history.current.past.length > 0,
    canRedo: history.current.future.length > 0,
    retry: () => retry.current(),
    api,
  };
}
export type AnnotationController = ReturnType<typeof useAnnotations>;
