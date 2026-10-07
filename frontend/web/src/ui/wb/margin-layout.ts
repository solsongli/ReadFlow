export type MarginSide = "auto" | "right";
export interface MarginAnchor {
  id: string;
  x: number;
  right?: number;
  y: number;
  height: number;
  /** Natural height a card may grow to when the rail below it is free. */
  grow?: number;
}
export interface AssignedMargin extends MarginAnchor {
  side: "left" | "right";
}
export function marginSpace(width: number, enabled: boolean, side: MarginSide = "auto", paragraphs = false) {
  if (!enabled || width < 820) return { left: 20, right: 20 };
  if (width >= 1120 && side === "auto") {
    const gutter = paragraphs ? Math.round(width * 0.22) : 250;
    return { left: gutter, right: gutter };
  }
  return { left: 20, right: 260 };
}
/** Pack in anchor order, bound the total height, and keep every card inside this page's rail. */
export function packMargins(entries: MarginAnchor[], pageHeight: number, gap = 8) {
  if (!entries.length) return [];
  const sorted = [...entries].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  const available = Math.max(1, pageHeight - gap * (sorted.length - 1));
  const total = sorted.reduce((sum, entry) => sum + entry.height, 0);
  const ratio = Math.min(1, available / Math.max(1, total));
  let cursor = 0;
  const packed = sorted.map((entry) => {
    const height = Math.max(1, entry.height * ratio);
    const top = Math.max(cursor, entry.y * pageHeight);
    cursor = top + height + gap;
    return { ...entry, top, height };
  });
  let bottom = pageHeight;
  for (let index = packed.length - 1; index >= 0; index--) {
    const entry = packed[index];
    entry.top = Math.min(entry.top, bottom - entry.height);
    bottom = entry.top - gap;
  }
  // Use the free rail below a card, up to its natural height, without moving any neighbour.
  packed.forEach((entry, index) => {
    if (!entry.grow || entry.grow <= entry.height) return;
    const limit = (packed[index + 1]?.top ?? pageHeight + gap) - gap - entry.top;
    entry.height = Math.max(entry.height, Math.min(entry.grow, limit));
  });
  return packed;
}
export function marginSide(x: number, left: number, right: number, side: MarginSide) {
  if (side === "auto" && x < 0.5 && left >= 180) return "left";
  if (right >= 180) return "right";
  if (left >= 180) return "left";
  return side === "right" || x >= 0.5 ? "right" : "left";
}
export function assignMarginSides(
  entries: MarginAnchor[],
  pageHeight: number,
  left: number,
  right: number,
  side: MarginSide,
  gap = 8,
): AssignedMargin[] {
  const cursors = { left: 0, right: 0 };
  return [...entries]
    .sort((a, b) => a.y - b.y || a.id.localeCompare(b.id))
    .map((entry) => {
      const edge = entry.right ?? entry.x;
      let assigned: "left" | "right";
      if (side !== "auto" || left < 180 || right < 180 || entry.x >= 0.45 || edge <= 0.55) {
        assigned = marginSide(entry.x, left, right, side);
      } else {
        const anchor = entry.y * pageHeight;
        const costs = {
          left: Math.abs(Math.max(cursors.left, anchor) - anchor),
          right: Math.abs(Math.max(cursors.right, anchor) - anchor),
        };
        assigned =
          costs.left === costs.right
            ? entry.x <= 1 - edge
              ? "left"
              : "right"
            : costs.left < costs.right
              ? "left"
              : "right";
      }
      cursors[assigned] = Math.max(cursors[assigned], entry.y * pageHeight) + entry.height + gap;
      return { ...entry, side: assigned };
    });
}
export function leaderEndpoint(
  side: "left" | "right",
  entry: Pick<MarginAnchor, "x" | "right">,
  width: number,
) {
  return (side === "right" ? (entry.right ?? entry.x) : entry.x) * width;
}
export function floatingMargin(
  anchor: { top: number; bottom: number; left: number; right: number },
  viewport: { width: number; height: number },
  desiredHeight = 340,
) {
  const above = Math.max(0, anchor.top - 16);
  const below = Math.max(0, viewport.height - anchor.bottom - 16);
  const lower = below >= desiredHeight || below >= above;
  const height = Math.max(24, Math.min(desiredHeight, lower ? below : above));
  const width = Math.min(440, viewport.width - 24);
  return {
    left: Math.max(12, Math.min(anchor.left, viewport.width - width - 12)),
    top: lower ? anchor.bottom + 8 : Math.max(8, anchor.top - height - 8),
    width,
    maxHeight: height,
  };
}
