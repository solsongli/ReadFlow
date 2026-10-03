import type { CanvasDrop } from "./types.js";
export function parseDrop(raw: string): CanvasDrop | null {
  try {
    if (raw.length > 2000) {
      return null;
    }
    const value = JSON.parse(raw);
    if (
      !["annotation", "selection", "paper"].includes(value?.type) ||
      typeof value.itemId !== "string" ||
      !value.itemId ||
      value.itemId.length > 120
    ) {
      return null;
    }
    if (
      value.type === "annotation" &&
      (typeof value.annotationId !== "string" || value.annotationId.length > 120)
    ) {
      return null;
    }
    return { type: value.type, itemId: value.itemId, annotationId: value.annotationId };
  } catch {
    return null;
  }
}
