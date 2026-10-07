import { useCallback, useEffect, useRef, useState } from "react";
import type { Todo } from "../domain/model.js";
import { todoApi, type TodoApi, type TodoPatch } from "./api.js";

/** Desk to-do state: optimistic edits, reloaded from the library when a save fails. */
export function useTodos(api: TodoApi = todoApi) {
  const [items, setItems] = useState<Todo[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const alive = useRef(true);
  const reload = useCallback(async () => {
    try {
      const next = await api.list();
      if (!alive.current) return;
      setItems(next);
      setStatus("ready");
    } catch (failure) {
      if (!alive.current) return;
      setStatus("error");
      setError(failure instanceof Error ? failure.message : "待办没有加载出来。");
    }
  }, [api]);
  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);
  const run = useCallback(
    async (optimistic: (items: Todo[]) => Todo[], work: () => Promise<unknown>) => {
      setItems(optimistic);
      setError("");
      try {
        await work();
      } catch (failure) {
        if (alive.current) setError(failure instanceof Error ? failure.message : "待办暂时无法保存，请重试。");
        await reload();
      }
    },
    [reload],
  );
  const replace = (saved: Todo) => alive.current && setItems((list) => list.map((t) => (t.id === saved.id ? saved : t)));
  return {
    items,
    status,
    error,
    reload,
    create: async (title: string, extra: { due?: string | null; item_id?: string | null } = {}) => {
      setError("");
      try {
        const saved = await api.create({ title, ...extra });
        if (alive.current) setItems((list) => [...list, saved]);
        return saved;
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "待办暂时无法保存，请重试。");
        return null;
      }
    },
    patch: (id: string, data: TodoPatch) =>
      run(
        (list) =>
          list.map((t) =>
            t.id === id
              ? { ...t, ...data, done_at: data.done === undefined ? t.done_at : data.done ? new Date().toISOString() : null }
              : t,
          ),
        async () => replace(await api.patch(id, data)),
      ),
    remove: (id: string) =>
      run(
        (list) => list.filter((t) => t.id !== id),
        () => api.remove(id),
      ),
    reorder: (ids: string[]) =>
      run(
        (list) => list.map((t) => (ids.includes(t.id) ? { ...t, position: ids.indexOf(t.id) + 1 } : t)),
        async () => {
          const saved = await api.reorder(ids);
          if (alive.current) setItems(saved);
        },
      ),
    clearDone: () =>
      run(
        (list) => list.filter((t) => !t.done),
        () => api.clearDone(),
      ),
  };
}
export type TodoState = ReturnType<typeof useTodos>;
