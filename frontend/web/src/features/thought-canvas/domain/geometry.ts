import type { CanvasNode, Point, Rect, View } from "./types.js";
export function world(point: Point, view: View): Point {
  return { x: (point.x - view.x) / view.zoom, y: (point.y - view.y) / view.zoom };
}
export function screen(point: Point, view: View): Point {
  return { x: point.x * view.zoom + view.x, y: point.y * view.zoom + view.y };
}
export function zoomAt(view: View, pointer: Point, zoom: number): View {
  const anchor = world(pointer, view);
  const scale = Math.max(0.15, Math.min(3, zoom));
  return { zoom: scale, x: pointer.x - anchor.x * scale, y: pointer.y - anchor.y * scale };
}
export function intersects(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}
export function contains(group: Rect, child: Rect): boolean {
  return (
    child.x >= group.x &&
    child.y >= group.y &&
    child.x + child.width <= group.x + group.width &&
    child.y + child.height <= group.y + group.height
  );
}
export function hit(nodes: CanvasNode[], point: Point): CanvasNode | undefined {
  return [...nodes].reverse().find((node) => contains(node, { ...point, width: 0, height: 0 }));
}
export function marquee(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}
export function visibleNodes(nodes: CanvasNode[], view: View, width: number, height: number): CanvasNode[] {
  const origin = world({ x: -100, y: -100 }, view);
  const viewport = { ...origin, width: (width + 200) / view.zoom, height: (height + 200) / view.zoom };
  return nodes.filter((node) => intersects(node, viewport));
}
export function fit(nodes: CanvasNode[], width: number, height: number): View {
  if (!nodes.length) {
    return { x: 40, y: 40, zoom: 1 };
  }
  const left = Math.min(...nodes.map((n) => n.x)),
    top = Math.min(...nodes.map((n) => n.y));
  const right = Math.max(...nodes.map((n) => n.x + n.width)),
    bottom = Math.max(...nodes.map((n) => n.y + n.height));
  const zoom = Math.max(0.15, Math.min(1.5, (width - 60) / (right - left), (height - 60) / (bottom - top)));
  return {
    zoom,
    x: (width - (right - left) * zoom) / 2 - left * zoom,
    y: (height - (bottom - top) * zoom) / 2 - top * zoom,
  };
}
export function edgePath(a: Rect, b: Rect): { path: string; label: Point; bounds: Rect } {
  const right = a.x + a.width / 2 <= b.x + b.width / 2;
  const start = { x: right ? a.x + a.width : a.x, y: a.y + a.height / 2 };
  const end = { x: right ? b.x : b.x + b.width, y: b.y + b.height / 2 };
  const bend = Math.max(50, Math.abs(end.x - start.x) / 2) * (right ? 1 : -1);
  return {
    path: `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`,
    label: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    bounds: {
      x: Math.min(start.x, end.x) - Math.abs(bend),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x) + Math.abs(bend) * 2,
      height: Math.max(1, Math.abs(end.y - start.y)),
    },
  };
}
export function snap(value: number, enabled: boolean): number {
  return enabled ? Math.round(value / 20) * 20 : value;
}
export function moveNodes(nodes: CanvasNode[], ids: string[], delta: Point, grid: boolean): CanvasNode[] {
  const groups = nodes.filter((n) => ids.includes(n.id) && n.type === "group");
  const anchor = groups[0] ?? nodes.find((node) => ids.includes(node.id));
  const shift = anchor
    ? {
        x: snap(anchor.x + delta.x, grid) - anchor.x,
        y: snap(anchor.y + delta.y, grid) - anchor.y,
      }
    : delta;
  return nodes.map((node) =>
    ids.includes(node.id) || groups.some((g) => contains(g, node))
      ? { ...node, x: node.x + shift.x, y: node.y + shift.y }
      : node,
  );
}
export function align(nodes: CanvasNode[], ids: string[], mode: "left" | "top" | "center" | "distribute") {
  const selected = nodes.filter((n) => ids.includes(n.id)).sort((a, b) => a.x - b.x);
  if (selected.length < 2) {
    return nodes;
  }
  const left = Math.min(...selected.map((n) => n.x)),
    top = Math.min(...selected.map((n) => n.y));
  const right = Math.max(...selected.map((n) => n.x + n.width));
  const gap = (right - left - selected.reduce((sum, n) => sum + n.width, 0)) / (selected.length - 1);
  let cursor = left;
  const positioned = new Map(
    selected.map((node) => {
      const value = {
        ...node,
        ...(mode === "top"
          ? { y: top }
          : {
              x: mode === "center" ? (left + right - node.width) / 2 : mode === "distribute" ? cursor : left,
            }),
      };
      cursor += node.width + gap;
      return [node.id, value];
    }),
  );
  return nodes.map((n) => positioned.get(n.id) ?? n);
}
