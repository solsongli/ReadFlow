import { getDocument, GlobalWorkerOptions, TextLayer } from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { OutlineEntry, TextLine } from "../domain/types.js";
export { TextLayer };
export type { PDFDocumentProxy, PDFPageProxy };
export interface PageSize {
  width: number;
  height: number;
}
export function openPdf(url: string, headers: Record<string, string>) {
  GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs-dist/build/pdf.worker.mjs", document.baseURI).href;
  return getDocument({
    url,
    httpHeaders: headers,
    cMapUrl: new URL("./vendor/pdfjs-dist/cmaps/", document.baseURI).href,
    cMapPacked: true,
    standardFontDataUrl: new URL("./vendor/pdfjs-dist/standard_fonts/", document.baseURI).href,
    isEvalSupported: false,
  });
}
export async function destination(
  pdf: PDFDocumentProxy,
  value: unknown,
): Promise<{ page: number; y: number } | null> {
  try {
    const dest = typeof value === "string" ? await pdf.getDestination(value) : value;
    if (!Array.isArray(dest)) {
      return null;
    }
    const index = typeof dest[0] === "number" ? dest[0] : await pdf.getPageIndex(dest[0]);
    const page = await pdf.getPage(index + 1),
      view = page.getViewport({ scale: 1 });
    const top = dest[1]?.name === "XYZ" ? dest[3] : dest[1]?.name === "FitH" ? dest[2] : null;
    return {
      page: index + 1,
      y: typeof top === "number" ? Math.max(0, view.convertToViewportPoint(0, top)[1]) : 0,
    };
  } catch {
    return null;
  }
}
export async function outline(pdf: PDFDocumentProxy): Promise<OutlineEntry[]> {
  const result: OutlineEntry[] = [];
  async function visit(nodes: Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>, level: number) {
    for (const node of nodes ?? []) {
      const target = await destination(pdf, node.dest);
      if (target) {
        result.push({ id: `pdf-${result.length}`, title: node.title, ...target, level });
      }
      if (node.items?.length) {
        await visit(node.items, level + 1);
      }
    }
  }
  await visit(await pdf.getOutline(), 1);
  return result;
}
export async function pageLines(page: PDFPageProxy): Promise<TextLine[]> {
  const content = await page.getTextContent(),
    viewport = page.getViewport({ scale: 1 });
  const fragments = content.items.flatMap((item) => {
    if (!("str" in item) || !item.str.trim()) {
      return [];
    }
    const [x, baseline] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    const size = Math.hypot(item.transform[2], item.transform[3]);
    return [
      { text: item.str, x, y: baseline - size, width: item.width, height: size, size, page: page.pageNumber },
    ];
  });
  const lines: TextLine[] = [];
  for (const fragment of fragments) {
    const last = lines.at(-1);
    if (
      last &&
      Math.abs(last.y - fragment.y) < 3 &&
      fragment.x >= last.x &&
      fragment.x - (last.x + last.width) < 35
    ) {
      last.text += " " + fragment.text;
      last.width = fragment.x + fragment.width - last.x;
      last.size = Math.max(last.size, fragment.size);
    } else {
      lines.push({ ...fragment });
    }
  }
  return lines;
}
/** Per-reader bounded queue; canceled/offscreen work is skipped before acquiring a canvas. */
export function renderQueue() {
  let running = 0,
    maximum = 0,
    completed = 0;
  const pending: Array<() => Promise<void>> = [];
  const drain = () => {
    while (running < 2 && pending.length) {
      running++;
      maximum = Math.max(maximum, running);
      void pending.shift()!().finally(() => {
        running--;
        completed++;
        drain();
      });
    }
  };
  return {
    run: (work: () => Promise<void>) => {
      pending.push(work);
      drain();
    },
    metrics: () => ({ running, queued: pending.length, maximum, completed }),
  };
}
