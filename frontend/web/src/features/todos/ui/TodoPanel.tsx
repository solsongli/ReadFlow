import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/ui/lib/utils.js";
import { localDay, moveId, partition, type TodoPaper } from "../domain/model.js";
import { onNewTodoRequest } from "../state/focus.js";
import { useTodos } from "../state/useTodos.js";
import { TodoRow } from "./TodoRow.js";

/** Desk to-do list. Library access is injected so this feature does not depend on the workbench. */
export function TodoPanel({
  search,
  open,
  className,
}: {
  search: (query: string, signal: AbortSignal) => Promise<TodoPaper[]>;
  open: (itemId: string) => void;
  className?: string;
}) {
  const todos = useTodos();
  const [draft, setDraft] = useState("");
  const [showDone, setShowDone] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const today = localDay();
  const { open: pending, done } = partition(todos.items);
  useEffect(() => onNewTodoRequest(() => input.current?.focus()), []);
  const order = pending.map((todo) => todo.id);
  const move = useCallback(
    (id: string, offset: number) => {
      const next = moveId(order, id, order.indexOf(id) + offset);
      if (next) {
        void todos.reorder(next);
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>(`[data-todo="${id}"] input[type="checkbox"]`)?.focus(),
        );
      }
    },
    [order.join(","), todos.reorder],
  );
  const drop = useCallback(
    (id: string, target: string) => {
      const next = moveId(order, id, order.indexOf(target));
      if (next) void todos.reorder(next);
    },
    [order.join(","), todos.reorder],
  );
  const rowProps = { today, search, open, patch: todos.patch, remove: todos.remove, move, drop };
  return (
    <section
      aria-label="待办"
      className={cn("flex min-w-0 flex-col gap-2 rounded-2xl bg-wb-desk-card px-[1.125rem] py-4 shadow-wb-card", className)}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-[0.9375rem] font-semibold tracking-[-0.012em]">待办</h2>
        <span className="text-[0.75rem] text-wb-text-3">{pending.length ? `${pending.length} 项未完成` : ""}</span>
      </div>
      <input
        ref={input}
        aria-label="新建待办"
        placeholder="写下接下来要做的事，回车添加"
        value={draft}
        maxLength={500}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={async (event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing || !draft.trim()) return;
          const title = draft.trim();
          setDraft("");
          if (!(await todos.create(title))) setDraft(title);
        }}
        className="h-8 rounded-lg border border-wb-line-soft bg-wb-desk-inset px-2.5 text-[0.8125rem] text-wb-text outline-none placeholder:text-wb-text-3 focus:border-wb-accent"
      />
      {todos.error ? (
        <p role="alert" className="m-0 text-[0.75rem] text-wb-danger">
          {todos.error}
        </p>
      ) : null}
      {todos.status === "loading" && !todos.items.length ? (
        <p role="status" className="m-0 py-2 text-[0.75rem] text-wb-text-3">
          正在载入待办…
        </p>
      ) : null}
      {pending.length ? (
        <ul aria-label="未完成的待办" className="m-0 flex list-none flex-col p-0">
          {pending.map((todo) => (
            <TodoRow key={todo.id} todo={todo} {...rowProps} />
          ))}
        </ul>
      ) : todos.status === "ready" ? (
        <p className="m-0 py-2 text-[0.78125rem] text-wb-text-3">{done.length ? "全部完成了。" : "还没有待办。"}</p>
      ) : null}
      {done.length ? (
        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-expanded={showDone}
              onClick={() => setShowDone((value) => !value)}
              className="flex items-center gap-1 border-0 bg-transparent p-0 text-[0.75rem] text-wb-text-3 hover:text-wb-text"
            >
              {showDone ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
              已完成 {done.length}
            </button>
            <button
              type="button"
              onClick={() => void todos.clearDone()}
              className="border-0 bg-transparent p-0 text-[0.75rem] text-wb-text-3 hover:text-wb-text"
            >
              清除已完成
            </button>
          </div>
          {showDone ? (
            <ul aria-label="已完成的待办" className="m-0 mt-1 flex list-none flex-col p-0">
              {done.map((todo) => (
                <TodoRow key={todo.id} todo={todo} {...rowProps} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
