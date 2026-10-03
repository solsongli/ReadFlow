import type { RefObject } from "react";
import type { ReaderPorts } from "../domain/types.js";
export async function copySelection(
  root: RefObject<HTMLDivElement | null>,
  position: { page: number },
  ports: ReaderPorts,
  setNotice: (text: string) => void,
  format: "plain" | "author" | "gbt",
) {
  const selection = window.getSelection(),
    text = selection?.toString().trim();
  if (!text || !selection?.anchorNode || !root.current?.contains(selection.anchorNode)) {
    return;
  }
  const element =
    selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode.parentElement;
  if (!element?.closest(".pr-text-layer")) {
    return;
  }
  const page = Number(element?.closest<HTMLElement>("[data-paper-page]")?.dataset.paperPage) || position.page;
  try {
    await navigator.clipboard.writeText(format === "plain" ? text : ports.quote(text, page, format));
    setNotice("已复制");
  } catch {
    setNotice("复制失败，请使用系统复制快捷键。");
  }
}
