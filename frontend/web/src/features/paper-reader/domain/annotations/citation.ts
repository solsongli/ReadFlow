import type { Annotation } from "./types.js";

export function annotationCitation(
  row: Pick<Annotation, "quote" | "page_index">,
  authors: string[],
  year: string,
) {
  const first = authors[0]?.trim() || "佚名";
  const name = first.includes(",") ? first.split(",")[0] : first.split(/\s+/u).at(-1);
  const author = `${name}${authors.length > 1 ? " et al." : ""}`;
  return `“${row.quote.trim()}” —— ${author}, ${year || "n.d."}, p. ${row.page_index + 1}`;
}

function escapeHtml(value: string) {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

export function annotationDragPayload(row: Annotation, citation: string) {
  return {
    canvas: JSON.stringify({ type: "annotation", annotationId: row.id, itemId: row.item_id }),
    plain: citation,
    html: `<p>${escapeHtml(citation)}</p>`,
  };
}
