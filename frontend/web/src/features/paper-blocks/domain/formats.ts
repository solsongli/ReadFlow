import type { BlockStatus } from "./model.js";
export type TranslationFormat = "layout" | "reflow";
export function pdfFormats(result: BlockStatus["result"], preferred: TranslationFormat) {
  const layout = Boolean(result?.layout_ready);
  const reflow = Boolean(result && result.reflow_ready !== false);
  const selected =
    preferred === "layout" && layout
      ? "layout"
      : preferred === "reflow" && reflow
        ? "reflow"
        : layout
          ? "layout"
          : reflow
            ? "reflow"
            : undefined;
  return {
    layout,
    reflow,
    selected,
    filename: selected === "layout" ? "translated-layout.pdf" : "translated.pdf",
  };
}
