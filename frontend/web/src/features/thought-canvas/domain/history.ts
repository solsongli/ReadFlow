import type { CanvasData, CanvasPatch } from "./types.js";
export interface History {
  past: CanvasData[];
  future: CanvasData[];
}
export function remember(history: History, before: CanvasData): History {
  return { past: [...history.past.slice(-49), before], future: [] };
}
export function travel(history: History, current: CanvasData, redo: boolean) {
  const target = (redo ? history.future : history.past).at(-1);
  if (!target) {
    return null;
  }
  return {
    target,
    history: redo
      ? { past: [...history.past, current], future: history.future.slice(0, -1) }
      : { past: history.past.slice(0, -1), future: [...history.future, current] },
  };
}
export function difference(before: CanvasData, after: CanvasData): CanvasPatch {
  return {
    nodes: after.nodes.filter(
      (n) => JSON.stringify(n) !== JSON.stringify(before.nodes.find((p) => p.id === n.id)),
    ),
    edges: after.edges.filter(
      (n) => JSON.stringify(n) !== JSON.stringify(before.edges.find((p) => p.id === n.id)),
    ),
    delete_nodes: before.nodes.filter((n) => !after.nodes.some((p) => p.id === n.id)).map((n) => n.id),
    delete_edges: before.edges.filter((n) => !after.edges.some((p) => p.id === n.id)).map((n) => n.id),
  };
}
