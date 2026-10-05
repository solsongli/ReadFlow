import type { Block, InlineRun, PageGeometry } from "./model.js";
export const BLOCK_LABELS: Record<string, string> = {
  title: "题名",
  author: "作者",
  abstract: "摘要",
  heading: "标题",
  text: "正文",
  list: "列表",
  caption: "图表题注",
  figure: "图片",
  table: "表格",
  formula: "公式",
  algorithm: "算法",
  code: "代码清单",
  reference: "参考文献",
  footnote: "脚注",
};
export const inlineTypes = Object.freeze([
  "title",
  "abstract",
  "heading",
  "text",
  "list",
  "caption",
  "footnote",
]);
export const readingBlocks = (blocks: Block[]) =>
  blocks.filter((b) => !["header", "footer"].includes(b.type));
export function adjacentBlock(blocks: Block[], id: string, direction: number) {
  const rows = readingBlocks(blocks),
    index = rows.findIndex((b) => b.id === id);
  return rows[index + direction];
}
export function sliceRuns(runs: InlineRun[], start: number, end: number) {
  let offset = 0;
  return runs.flatMap((run) => {
    const points = Array.from(run.text),
      at = offset;
    offset += points.length;
    const text = points.slice(Math.max(0, start - at), Math.max(0, end - at)).join("");
    return text ? [{ ...run, text }] : [];
  });
}
export function translatedParts(block: Block) {
  const runs = block.translation_runs?.length
    ? block.translation_runs
    : [{ kind: "text" as const, text: block.translation || "" }];
  const points = Array.from(runs.map((r) => r.text).join(""));
  const weights = block.anchors.map((a) => Math.max(1, (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1])));
  const total = weights.reduce((a, b) => a + b, 0);
  let previous = 0,
    cumulative = 0;
  return block.anchors.map((anchor, index) => {
    cumulative += weights[index];
    let end = index === weights.length - 1 ? points.length : Math.round((points.length * cumulative) / total);
    if (index < weights.length - 1) {
      const near = Math.min(25, Math.floor((end - previous) * 0.15));
      const choices = Array.from({ length: near * 2 + 1 }, (_, i) => end - near + i).filter(
        (i) => i > previous && i < points.length && /[\s。！？；,.!?;]/u.test(points[i - 1]),
      );
      if (choices.length) end = choices.sort((a, b) => Math.abs(a - end) - Math.abs(b - end))[0];
    }
    const part = sliceRuns(runs, previous, end);
    previous = end;
    return { anchor, runs: part, text: part.map((r) => r.text).join("") };
  });
}
export function labelBox(box: number[], page: PageGeometry) {
  const [a, b, c, d, e, f] = page.page_to_display;
  const points = [
    [box[0], box[1]],
    [box[2], box[1]],
    [box[2], box[3]],
    [box[0], box[3]],
  ].map(([x, y]) => [(a * x + c * y + e) / page.width, (b * x + d * y + f) / page.height]);
  return [
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
  ];
}
export function pageTranslations(blocks: Block[], page: number) {
  return readingBlocks(blocks).filter((b) => b.anchors.some((a) => a.page === page));
}
export function copyPage(blocks: Block[], page: number) {
  return pageTranslations(blocks, page)
    .flatMap((b) => {
      const text = translatedParts(b)
        .filter((p) => p.anchor.page === page)
        .map((p) => p.text)
        .join("\n");
      const labels =
        b.figure_text?.filter((l) => l.translation).map((l) => `${l.text} → ${l.translation}`) || [];
      return [...(text ? [text] : []), ...labels];
    })
    .join("\n\n");
}

export function blockCopyText(block: Block, blocks: Block[], page: number) {
  const translated = translatedParts(block)
    .filter((p) => p.anchor.page === page)
    .map((p) => p.text)
    .join("\n");
  const caption = blocks.find((b) => b.id === block.caption_id);
  return (
    translated ||
    block.text ||
    caption?.translation ||
    caption?.text ||
    (block.figure_text || []).map((l) => l.translation || l.text).join("\n")
  );
}

export function labelAt(
  blocks: Block[],
  page: number,
  geometry: PageGeometry | undefined,
  x: number,
  y: number,
) {
  if (!geometry) return undefined;
  for (const block of blocks) {
    if (block.page !== page || !["figure", "table"].includes(block.type)) continue;
    for (const label of block.figure_text || []) {
      if (!label.translation || !label.bbox) continue;
      const box = labelBox(label.bbox, geometry);
      if (x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]) return label;
    }
  }
  return undefined;
}
