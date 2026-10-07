export interface Todo {
  id: string;
  title: string;
  done: boolean;
  position: number;
  due: string | null;
  item_id: string | null;
  item_title: string | null;
  created_at: string;
  updated_at: string;
  done_at: string | null;
}

export interface TodoPaper {
  id: string;
  title: string;
}

/** Local calendar day as YYYY-MM-DD; due dates are plain days, not instants. */
export function localDay(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function dayNumber(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date) / 86400000;
}

export function isOverdue(todo: Pick<Todo, "done" | "due">, today: string): boolean {
  return !todo.done && Boolean(todo.due) && todo.due! < today;
}

export function dueLabel(due: string | null, today: string): string {
  if (!due) return "";
  const days = dayNumber(due) - dayNumber(today);
  if (days === 0) return "今天";
  if (days === 1) return "明天";
  if (days === -1) return "昨天";
  if (days < 0) return `逾期 ${-days} 天`;
  const [year, month, date] = due.split("-").map(Number);
  return year === Number(today.slice(0, 4)) ? `${month}月${date}日` : `${year}/${month}/${date}`;
}

/** Split into the open list (manual order) and the completed list (newest first). */
export function partition(items: Todo[]) {
  const open = items.filter((todo) => !todo.done).sort((a, b) => a.position - b.position);
  const done = items
    .filter((todo) => todo.done)
    .sort((a, b) => (b.done_at || "").localeCompare(a.done_at || ""));
  return { open, done };
}

/** Move one id within an ordered id list; returns the new order or null when nothing changes. */
export function moveId(ids: string[], id: string, target: number): string[] | null {
  const from = ids.indexOf(id);
  const to = Math.max(0, Math.min(ids.length - 1, target));
  if (from < 0 || from === to) return null;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
