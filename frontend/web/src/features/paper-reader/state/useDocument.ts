import { useEffect, useState } from "react";
import { openPdf, outline, pageLines, type PDFDocumentProxy, type PageSize } from "./document.js";
import type { OutlineEntry, TextLine } from "../domain/types.js";
export function useDocument(url: string | undefined, headers: Record<string, string>, retry = 0) {
  const [state, set] = useState<{
    pdf: PDFDocumentProxy | null;
    sizes: PageSize[];
    lines: TextLine[];
    outline: OutlineEntry[];
    error: string;
    indexed: boolean;
  }>({ pdf: null, sizes: [], lines: [], outline: [], error: "", indexed: false });
  const headerKey = JSON.stringify(headers);
  useEffect(() => {
    if (!url) {
      set({ pdf: null, sizes: [], lines: [], outline: [], error: "", indexed: false });
      return;
    }
    let gone = false;
    const task = openPdf(url, headers);
    set({ pdf: null, sizes: [], lines: [], outline: [], error: "", indexed: false });
    void task.promise
      .then(async (pdf) => {
        const first = (await pdf.getPage(1)).getViewport({ scale: 1 });
        if (gone) {
          return;
        }
        const sizes = Array.from({ length: pdf.numPages }, () => ({
          width: first.width,
          height: first.height,
        }));
        set((s) => ({ ...s, pdf, sizes }));
        void outline(pdf)
          .then((entries) => {
            if (!gone) {
              set((s) => ({ ...s, outline: entries }));
            }
          })
          .catch(() => {});
        const lines: TextLine[] = [];
        for (let n = 1; n <= pdf.numPages && !gone; n++) {
          const page = await pdf.getPage(n),
            view = page.getViewport({ scale: 1 });
          sizes[n - 1] = { width: view.width, height: view.height };
          lines.push(...(await pageLines(page)));
          if (!gone && (n % 5 === 0 || n === pdf.numPages)) {
            set((s) => ({ ...s, sizes: [...sizes], lines: [...lines], indexed: n === pdf.numPages }));
          }
          await new Promise((resolve) => setTimeout(resolve, 8));
        }
      })
      .catch(() => {
        if (!gone) {
          set((s) => ({ ...s, error: "PDF 未能加载或索引，请重新打开文献。" }));
        }
      });
    return () => {
      gone = true;
      void task.destroy();
    };
  }, [url, headerKey, retry]);
  return state;
}
