import { compileTerms, termMatches, type LocatedTerm } from "../domain/terms.js";
export interface TermRect {
  term: LocatedTerm;
  x: number;
  y: number;
  width: number;
  height: number;
}
export function textTermRects(layer: HTMLElement, terms: LocatedTerm[], page: HTMLElement, inline: boolean) {
  const containers = inline ? [...page.querySelectorAll<HTMLElement>(".pb-fitted-content")] : [layer];
  const result: TermRect[] = [];
  const rect = page.getBoundingClientRect();
  for (const container of containers) {
    const walk = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes: { node: Text; start: number; end: number }[] = [];
    let joined = "";
    while (walk.nextNode()) {
      const node = walk.currentNode as Text;
      const start = joined.length;
      joined += node.textContent || "";
      nodes.push({ node, start, end: joined.length });
      if (!inline) joined += " ";
    }
    const compiled = compileTerms(terms.map((t) => (inline ? { ...t, source: t.target } : t)));
    for (const match of termMatches(joined, compiled)) {
      const first = nodes.find((n) => n.end > match.start),
        last = nodes.find((n) => n.end >= match.end);
      if (!first || !last) continue;
      const range = document.createRange();
      range.setStart(first.node, Math.max(0, match.start - first.start));
      range.setEnd(last.node, Math.min(last.node.length, match.end - last.start));
      const term = terms.find((t) =>
        inline ? t.target === match.term.source : t.source === match.term.source,
      )!;
      for (const box of range.getClientRects()) {
        if (box.width < 1 || box.height < 1) continue;
        result.push({
          term,
          x: (box.left - rect.left) / rect.width,
          y: (box.top - rect.top) / rect.height,
          width: box.width / rect.width,
          height: box.height / rect.height,
        });
      }
    }
  }
  return result;
}
