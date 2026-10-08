import { useEffect, useRef, useState } from "react";
import { openPdf, outline, pageLines, type PDFDocumentProxy, type PageSize } from "./document.js";
import type { OutlineEntry, TextLine } from "../domain/types.js";

interface DocumentState {
  pdf: PDFDocumentProxy | null;
  sizes: PageSize[];
  lines: TextLine[];
  outline: OutlineEntry[];
  error: string;
  indexed: boolean;
  indexedPages: number;
}

type ReleaseIndexSlot = () => void;
type AcquireIndexSlot = () => ReleaseIndexSlot | null;

interface IndexControl {
  token: number;
  pdf: PDFDocumentProxy | null;
  sizes: PageSize[];
  started: boolean;
  priority: boolean;
  pausedUntil: number;
  acquire: AcquireIndexSlot;
}

const EMPTY: DocumentState = {
  pdf: null,
  sizes: [],
  lines: [],
  outline: [],
  error: "",
  indexed: false,
  indexedPages: 0,
};
const INTERACTION_IDLE_MS = 1750;
const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function browserIdle(priority: boolean) {
  if (priority) return delay(0);
  return new Promise<void>((resolve) => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => resolve(), { timeout: 250 });
    else setTimeout(resolve, 32);
  });
}

async function indexTurn(control: { current: IndexControl }, token: number) {
  while (control.current.token === token) {
    const remaining = control.current.pausedUntil - performance.now();
    if (remaining > 0) {
      await delay(Math.min(80, remaining));
      continue;
    }
    await browserIdle(control.current.priority);
    if (control.current.token !== token || performance.now() < control.current.pausedUntil) continue;
    const release = control.current.acquire();
    if (release) return release;
    await delay(40);
  }
  return null;
}

export function useDocument(
  url: string | undefined,
  headers: Record<string, string>,
  retry = 0,
  acquire: AcquireIndexSlot = () => () => {},
) {
  const [state, set] = useState<DocumentState>(EMPTY);
  const control = useRef<IndexControl>({
    token: 0,
    pdf: null,
    sizes: [],
    started: false,
    priority: false,
    pausedUntil: 0,
    acquire,
  });
  control.current.acquire = acquire;
  const headerKey = JSON.stringify(headers);

  const startIndexing = (priority = false) => {
    const current = control.current;
    current.priority ||= priority;
    if (priority) current.pausedUntil = performance.now();
    if (current.started || !current.pdf) return;
    current.started = true;
    if (!current.priority) {
      current.pausedUntil = Math.max(current.pausedUntil, performance.now() + INTERACTION_IDLE_MS);
    }
    const token = current.token,
      pdf = current.pdf,
      sizes = current.sizes;
    void (async () => {
      const lines: TextLine[] = [];
      for (let number = 1; number <= pdf.numPages && control.current.token === token; number++) {
        const release = await indexTurn(control, token);
        if (!release) break;
        try {
          const page = await pdf.getPage(number),
            view = page.getViewport({ scale: 1 });
          sizes[number - 1] = { width: view.width, height: view.height };
          lines.push(...(await pageLines(page)));
        } finally {
          release();
        }
        if (
          control.current.token === token &&
          (control.current.priority || number % 5 === 0 || number === pdf.numPages)
        ) {
          set((value) => ({
            ...value,
            sizes: [...sizes],
            lines: [...lines],
            indexed: number === pdf.numPages,
            indexedPages: number,
          }));
        }
      }
    })().catch(() => {
      if (control.current.token === token)
        set((value) => ({ ...value, error: "PDF 文本索引未能完成。" }));
    });
  };

  useEffect(() => {
    const token = ++control.current.token;
    control.current = {
      token,
      pdf: null,
      sizes: [],
      started: false,
      priority: false,
      pausedUntil: 0,
      acquire,
    };
    if (!url) {
      set(EMPTY);
      return;
    }
    let gone = false;
    const task = openPdf(url, headers);
    set(EMPTY);
    void task.promise
      .then(async (pdf) => {
        const first = (await pdf.getPage(1)).getViewport({ scale: 1 });
        if (gone) return;
        const sizes = Array.from({ length: pdf.numPages }, () => ({
          width: first.width,
          height: first.height,
        }));
        control.current.pdf = pdf;
        control.current.sizes = sizes;
        set((value) => ({ ...value, pdf, sizes }));
        void outline(pdf)
          .then((entries) => {
            if (!gone) set((value) => ({ ...value, outline: entries }));
          })
          .catch(() => {});
      })
      .catch(() => {
        if (!gone)
          set((value) => ({ ...value, error: "PDF 未能加载或索引，请重新打开文献。" }));
      });
    return () => {
      gone = true;
      control.current.token++;
      void task.destroy();
    };
  }, [url, headerKey, retry]);

  return {
    ...state,
    startIndexing,
    prioritizeIndexing: () => startIndexing(true),
    setIndexPriority: (priority: boolean) => {
      control.current.priority = priority;
    },
    pauseIndexing: (milliseconds = INTERACTION_IDLE_MS) => {
      control.current.pausedUntil = Math.max(
        control.current.pausedUntil,
        performance.now() + milliseconds,
      );
    },
  };
}
