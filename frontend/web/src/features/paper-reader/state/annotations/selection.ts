import { mergeRects, normalizeRect } from "../../domain/annotations/geometry.js";
import type { SelectionAnchor } from "../../domain/annotations/types.js";
export function sourceSelection(root: HTMLElement | null): SelectionAnchor[] {
  const selection = window.getSelection();
  if (!root || !selection?.rangeCount || selection.isCollapsed) {
    return [];
  }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) {
    return [];
  }
  const result: SelectionAnchor[] = [];
  for (const page of root.querySelectorAll<HTMLElement>(
    '[data-annotation-source="true"] [data-paper-page]',
  )) {
    const layer = page.querySelector(".pr-text-layer");
    if (!layer || !range.intersectsNode(layer)) {
      continue;
    }
    const bounds = page.getBoundingClientRect();
    const rects = [];
    const words: string[] = [];
    for (const span of layer.querySelectorAll("span")) {
      if (!span.firstChild || !range.intersectsNode(span)) {
        continue;
      }
      const part = document.createRange();
      part.selectNodeContents(span);
      if (span.contains(range.startContainer)) {
        part.setStart(range.startContainer, range.startOffset);
      }
      if (span.contains(range.endContainer)) {
        part.setEnd(range.endContainer, range.endOffset);
      }
      if (!part.toString().trim()) {
        continue;
      }
      words.push(part.toString());
      for (const rect of part.getClientRects()) {
        rects.push(normalizeRect(rect, bounds));
      }
    }
    if (rects.length) {
      result.push({
        page: Number(page.dataset.paperPage) - 1,
        rects: mergeRects(rects),
        quote: words.join(" "),
      });
    }
  }
  return result;
}
