import { COLORS, type Annotation, type Semantics } from "./types.js";
export function annotationsMarkdown(rows: Annotation[], labels: Semantics, citation: string): string {
  const sections: string[] = [];
  for (const color of COLORS) {
    const selected = rows.filter((row) => row.color === color);
    if (!selected.length) {
      continue;
    }
    sections.push(`## ${labels[color]}`);
    for (const row of selected.sort(
      (a, b) => a.page_index - b.page_index || a.created_at.localeCompare(b.created_at),
    )) {
      sections.push(`### 第 ${row.page_index + 1} 页 · ${row.type}`);
      if (row.quote) {
        sections.push(
          row.quote
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n"),
        );
      }
      if (row.image_ref) {
        sections.push(`![区域截图](/api/research/annotations/${row.id}/image)`);
      }
      if (row.note) {
        sections.push(row.note);
      }
    }
  }
  return [...sections, "---", citation].join("\n\n") + "\n";
}
