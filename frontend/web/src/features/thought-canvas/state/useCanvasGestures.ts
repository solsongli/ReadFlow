import { useRef, useState } from "react";
import { align, contains, marquee, moveNodes, world, zoomAt } from "../domain/geometry.js";
import type { CanvasData, CanvasNode, Point, Rect, View } from "../domain/types.js";
import { newIdentity } from "./useCanvasWorkspace.js";
interface Gesture {
  kind: "pan" | "move" | "resize" | "select" | "connect";
  start: Point;
  view: View;
  nodes: CanvasNode[];
  ids: string[];
  id?: string;
}
export function useCanvasGestures(
  data: CanvasData,
  commit: (next: CanvasData) => void,
  history: (redo: boolean) => void,
) {
  const root = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 40, y: 40, zoom: 1 });
  const [selected, setSelected] = useState<string[]>([]);
  const [edge, setEdge] = useState<string | null>(null);
  const [draft, setDraft] = useState<CanvasNode[] | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [connection, setConnection] = useState<{ from: string; to: Point } | null>(null);
  const [grid, setGrid] = useState(false);
  const held = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const latest = useRef(data);
  latest.current = data;
  function local(event: { clientX: number; clientY: number }): Point {
    const bounds = root.current!.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }
  function down(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("input,textarea,select,button:not([data-connect]):not([data-resize]),[data-edge]")) {
      return;
    }
    if (event.button !== 0 && event.button !== 1) {
      return;
    }
    root.current?.focus();
    const id = target.closest<HTMLElement>("[data-canvas-node]")?.dataset.canvasNode;
    const kind =
      event.button === 1 || held.current
        ? "pan"
        : target.closest("[data-connect]")
          ? "connect"
          : target.closest("[data-resize]")
            ? "resize"
            : id
              ? "move"
              : "select";
    let ids = selected;
    if (kind === "move" && id) {
      ids = event.shiftKey
        ? selected.includes(id)
          ? selected.filter((value) => value !== id)
          : [...selected, id]
        : selected.includes(id)
          ? selected
          : [id];
      setSelected(ids);
      setEdge(null);
    }
    if (kind === "select" && !event.shiftKey) {
      ids = [];
      setSelected([]);
      setEdge(null);
    }
    gesture.current = { kind, start: local(event), view, nodes: data.nodes, ids, id };
    const capture =
      kind === "move"
        ? (target.closest<HTMLElement>("[data-canvas-node]") ?? event.currentTarget)
        : event.currentTarget;
    capture.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function calculate(event: { clientX: number; clientY: number }) {
    const active = gesture.current;
    if (!active) {
      return;
    }
    const end = local(event);
    const delta = {
      x: (end.x - active.start.x) / active.view.zoom,
      y: (end.y - active.start.y) / active.view.zoom,
    };
    if (active.kind === "pan") {
      setView({
        ...active.view,
        x: active.view.x + end.x - active.start.x,
        y: active.view.y + end.y - active.start.y,
      });
    }
    if (active.kind === "move") {
      const moved = moveNodes(active.nodes, active.ids, delta, grid);
      setDraft(moved);
      return moved;
    }
    if (active.kind === "resize") {
      const resized = active.nodes.map((node) =>
        node.id === active.id
          ? {
              ...node,
              width: Math.max(80, Math.min(5000, node.width + delta.x)),
              height: Math.max(40, Math.min(5000, node.height + delta.y)),
            }
          : node,
      );
      setDraft(resized);
      return resized;
    }
    if (active.kind === "select") {
      const rect = marquee(world(active.start, active.view), world(end, active.view));
      setSelection(rect);
      setSelected([
        ...new Set([
          ...active.ids,
          ...data.nodes.filter((node) => contains(rect, node)).map((node) => node.id),
        ]),
      ]);
    }
    if (active.kind === "connect" && active.id) {
      setConnection({ from: active.id, to: world(end, view) });
    }
  }
  function up(event: React.PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active) {
      return;
    }
    const nodes = calculate(event);
    gesture.current = null;
    setDraft(null);
    setSelection(null);
    setConnection(null);
    if (nodes && JSON.stringify(nodes) !== JSON.stringify(data.nodes)) {
      commit({ ...data, nodes });
    }
    if (active.kind === "connect" && active.id) {
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-canvas-node]");
      const to = target?.dataset.canvasNode;
      if (to && to !== active.id) {
        commit({
          ...data,
          edges: [
            ...data.edges,
            { id: newIdentity(), from_id: active.id, to_id: to, label: "", style: "arrow" },
          ],
        });
      }
    }
  }
  function remove() {
    commit({
      ...data,
      nodes: data.nodes.filter((node) => !selected.includes(node.id)),
      edges: data.edges.filter(
        (line) => line.id !== edge && !selected.includes(line.from_id) && !selected.includes(line.to_id),
      ),
    });
    setSelected([]);
    setEdge(null);
  }
  function duplicate() {
    const groups = data.nodes.filter((node) => selected.includes(node.id) && node.type === "group");
    const copies = data.nodes.filter(
      (node) => selected.includes(node.id) || groups.some((group) => contains(group, node)),
    );
    const ids = new Map(copies.map((node) => [node.id, newIdentity()]));
    const nodes = copies.map((node) => ({ ...node, id: ids.get(node.id)!, x: node.x + 30, y: node.y + 30 }));
    const edges = data.edges
      .filter((line) => ids.has(line.from_id) && ids.has(line.to_id))
      .map((line) => ({
        ...line,
        id: newIdentity(),
        from_id: ids.get(line.from_id)!,
        to_id: ids.get(line.to_id)!,
      }));
    commit({ ...data, nodes: [...data.nodes, ...nodes], edges: [...data.edges, ...edges] });
    setSelected(nodes.map((node) => node.id));
  }
  function key(event: React.KeyboardEvent) {
    if ((event.target as Element).closest("input,textarea,select,[contenteditable=true]")) {
      return;
    }
    const modified = event.ctrlKey || event.metaKey;
    if (event.code === "Space") {
      held.current = true;
    } else if (modified && event.key.toLowerCase() === "z") {
      history(event.shiftKey);
    } else if (modified && event.key.toLowerCase() === "d") {
      duplicate();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      remove();
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }
  return {
    root,
    view,
    setView,
    selected,
    setSelected,
    edge,
    setEdge,
    nodes: draft ?? data.nodes,
    selection,
    connection,
    grid,
    setGrid,
    down,
    move: calculate,
    up,
    key,
    release: () => {
      held.current = false;
    },
    align: (mode: "left" | "top" | "center" | "distribute") =>
      commit({ ...data, nodes: align(data.nodes, selected, mode) }),
    zoom: (pointer: Point, scale: number) => setView((value) => zoomAt(value, pointer, scale)),
    remove,
    duplicate,
  };
}
export type CanvasGestures = ReturnType<typeof useCanvasGestures>;
