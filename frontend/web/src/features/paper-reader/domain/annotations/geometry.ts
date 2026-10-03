import type { Point, Rect } from "./types.js";
const clamp = (value: number) => Math.max(0, Math.min(1, value));
export function normalizeRect(rect: Rect, page: Rect): Rect {
  const x = clamp((rect.x - page.x) / page.width);
  const y = clamp((rect.y - page.y) / page.height);
  return {
    x,
    y,
    width: Math.max(0, clamp((rect.x + rect.width - page.x) / page.width) - x),
    height: Math.max(0, clamp((rect.y + rect.height - page.y) / page.height) - y),
  };
}
export function restoreRect(rect: Rect, page: Rect): Rect {
  return {
    x: page.x + rect.x * page.width,
    y: page.y + rect.y * page.height,
    width: rect.width * page.width,
    height: rect.height * page.height,
  };
}
export function mergeRects(rects: Rect[]): Rect[] {
  const result: Rect[] = [];
  for (const rect of [...rects].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }
    const previous = result.at(-1);
    // Merge fragments on the same baseline, never bridge a column gutter.
    if (
      previous &&
      Math.abs(previous.y - rect.y) < Math.min(previous.height, rect.height) * 0.3 &&
      rect.x >= previous.x &&
      rect.x - (previous.x + previous.width) < 0.008
    ) {
      previous.width = Math.max(previous.width, rect.x + rect.width - previous.x);
      previous.height = Math.max(previous.height, rect.height);
    } else {
      result.push({ ...rect });
    }
  }
  return result;
}
export function simplifyInk(points: Point[], epsilon = 0.001): Point[] {
  if (points.length < 3) {
    return points;
  }
  const first = points[0],
    last = points.at(-1)!;
  const dx = last.x - first.x,
    dy = last.y - first.y;
  let distance = 0,
    index = 0;
  points.slice(1, -1).forEach((p, i) => {
    const t = dx || dy ? clamp(((p.x - first.x) * dx + (p.y - first.y) * dy) / (dx * dx + dy * dy)) : 0;
    const d = Math.hypot(p.x - first.x - t * dx, p.y - first.y - t * dy);
    if (d > distance) {
      distance = d;
      index = i + 1;
    }
  });
  if (distance <= epsilon) {
    return [first, last];
  }
  return [
    ...simplifyInk(points.slice(0, index + 1), epsilon).slice(0, -1),
    ...simplifyInk(points.slice(index), epsilon),
  ];
}
export function boxBetween(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}
