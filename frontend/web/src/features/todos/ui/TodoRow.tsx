import { memo, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { CalendarDays, FileText, GripVertical, Link2, Trash2 } from "lucide-react";
import { cn } from "@/ui/lib/utils.js";
import { IconButton } from "@/ui/wb/Button.js";
import { dueLabel, isOverdue, type Todo, type TodoPaper } from "../domain/model.js";
import type { TodoPatch } from "../state/api.js";
import { PaperPicker } from "./PaperPicker.js";

export interface TodoRowProps {
  todo: Todo;
  today: string;
  search: (query: string, signal: AbortSignal) => Promise<TodoPaper[]>;
  open: (itemId: string) => void;
  patch: (id: string, data: TodoPatch) => void;
  remove: (id: string) => void;
  move: (id: string, offset: number) => void;
  drop: (id: string, targetId: string) => void;
}

export const TodoRow = memo(function TodoRow({ todo, today, search, open, patch, remove, move, drop }: TodoRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const [panel, setPanel] = useState<"" | "due" | "link">("");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);
  const save = () => {
    const title = draft.trim();
    setEditing(false);
    if (title && title !== todo.title) patch(todo.id, { title });
    else setDraft(todo.title);
  };
  const keys = (event: KeyboardEvent) => {
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      move(todo.id, event.key === "ArrowUp" ? -1 : 1);
    }
  };
  const overdue = isOverdue(todo, today);
  const accept = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes("application/x-readflow-todo")) return;
    event.preventDefault();
    setOver(true);
  };
  return (
    <li
      data-todo={todo.id}
      onKeyDown={keys}
      onDragOver={accept}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        const id = event.dataTransfer.getData("application/x-readflow-todo");
        if (id && id !== todo.id) drop(id, todo.id);
      }}
      className={cn(
        "group relative flex flex-col border-0 border-t border-wb-line-soft first:border-t-0",
        over && "border-t-wb-accent",
      )}
    >
      <div className="flex min-h-9 items-center gap-2 py-1">
        {!todo.done ? (
          <span
            draggable
            aria-hidden="true"
            title="拖动排序（也可用 Alt+↑/↓）"
            onDragStart={(event) => {
              event.dataTransfer.setData("application/x-readflow-todo", todo.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            className="flex h-6 w-3.5 shrink-0 cursor-grab items-center justify-center text-wb-text-3 opacity-0 group-hover:opacity-100"
          >
            <GripVertical size={13} />
          </span>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <input
          type="checkbox"
          checked={todo.done}
          aria-label={`${todo.done ? "标记为未完成" : "完成"}：${todo.title}`}
          onChange={(event) => patch(todo.id, { done: event.target.checked })}
          className="h-4 w-4 shrink-0 accent-wb-accent"
        />
        {editing ? (
          <input
            ref={input}
            aria-label="编辑待办"
            value={draft}
            maxLength={500}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
              if (event.key === "Escape") {
                setDraft(todo.title);
                setEditing(false);
              }
            }}
            className="h-7 min-w-0 flex-1 rounded-md border border-wb-line bg-wb-desk-inset px-2 text-[0.8125rem] text-wb-text outline-none focus:border-wb-accent"
          />
        ) : (
          <button
            type="button"
            title="单击编辑"
            onClick={() => setEditing(true)}
            className={cn(
              "min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-[0.8125rem] leading-6",
              todo.done ? "text-wb-text-3 line-through" : "text-wb-text",
            )}
          >
            {todo.title}
          </button>
        )}
        {todo.due ? (
          <span className={cn("shrink-0 text-[0.71875rem]", overdue ? "font-medium text-wb-danger" : "text-wb-text-3")}>
            {dueLabel(todo.due, today)}
          </span>
        ) : null}
        <span className="flex shrink-0 items-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
          {!todo.done ? (
            <>
              <IconButton size="sm" label="截止日期" active={panel === "due"} onClick={() => setPanel((p) => (p === "due" ? "" : "due"))}>
                <CalendarDays size={13} />
              </IconButton>
              <IconButton size="sm" label="关联文献" active={panel === "link"} onClick={() => setPanel((p) => (p === "link" ? "" : "link"))}>
                <Link2 size={13} />
              </IconButton>
            </>
          ) : null}
          <IconButton size="sm" label="删除待办" onClick={() => remove(todo.id)}>
            <Trash2 size={13} />
          </IconButton>
        </span>
      </div>
      {todo.item_id ? (
        <button
          type="button"
          onClick={() => open(todo.item_id!)}
          title="打开关联文献"
          className="mb-1 ml-[3.25rem] flex max-w-[calc(100%-3.25rem)] items-center gap-1 self-start rounded-md border-0 bg-wb-desk-inset px-1.5 py-0.5 text-left text-[0.71875rem] text-wb-text-2 hover:bg-wb-hover"
        >
          <FileText size={12} aria-hidden="true" className="shrink-0" />
          <span className="truncate">{todo.item_title || "关联文献"}</span>
        </button>
      ) : null}
      {panel === "due" ? (
        <div className="mb-2 ml-[3.25rem] flex items-center gap-2">
          <input
            type="date"
            aria-label="截止日期"
            autoFocus
            defaultValue={todo.due || ""}
            onChange={(event) => {
              if (event.target.value) {
                patch(todo.id, { due: event.target.value });
                setPanel("");
              }
            }}
            onKeyDown={(event) => event.key === "Escape" && setPanel("")}
            className="h-7 rounded-md border border-wb-line bg-wb-desk-inset px-2 text-[0.75rem] text-wb-text"
          />
          {todo.due ? (
            <button type="button" onClick={() => (patch(todo.id, { due: null }), setPanel(""))} className="border-0 bg-transparent text-[0.75rem] text-wb-text-3 hover:text-wb-text">
              清除日期
            </button>
          ) : null}
        </div>
      ) : null}
      {panel === "link" ? (
        <PaperPicker
          search={search}
          linked={Boolean(todo.item_id)}
          choose={(paper) => {
            patch(todo.id, { item_id: paper?.id ?? null });
            setPanel("");
          }}
          close={() => setPanel("")}
        />
      ) : null}
    </li>
  );
});
