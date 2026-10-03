import { useEffect, useRef, useState } from "react";
import { figureReference, findReferences } from "../domain/analysis.js";
import type { FigureTarget, Reference } from "../domain/types.js";
import { destination, type PDFDocumentProxy } from "./document.js";
import type { HoverPreview } from "../ui/Preview.js";
import type { LinkBox } from "../ui/PdfPage.js";
function textAt(event: React.MouseEvent, link?: LinkBox): string {
  const element = event.target as HTMLElement;
  if (link) {
    const rect = element.getBoundingClientRect();
    return [...(element.closest("[data-paper-page]")?.querySelectorAll(".pr-text-layer span") ?? [])]
      .filter((span) => {
        const b = span.getBoundingClientRect();
        return b.left < rect.right && b.right > rect.left && b.top < rect.bottom && b.bottom > rect.top;
      })
      .map((span) => span.textContent)
      .join(" ");
  }
  if (!element.closest(".pr-text-layer span")) {
    return "";
  }
  const range = (
    document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }
  ).caretRangeFromPoint?.(event.clientX, event.clientY);
  if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) {
    return "";
  }
  const text = range.startContainer.textContent ?? "",
    offset = range.startOffset;
  const candidates = [
    ...text.matchAll(
      new RegExp(
        [
          String.raw`\[[\d\s,，;；–—-]+\]`,
          String.raw`[（(][A-Z][\p{L}'-]+(?:\s+(?:et al\.?|and\s+[A-Z][\p{L}'-]+))?` +
            String.raw`\s*[,，]\s*(?:19|20)\d{2}[a-z]?[)）]`,
          String.raw`(?:Figure|Fig\.?|Table|Eq\.?|Equation)\s*\(?\d+[a-z]?\)?`,
          String.raw`[图表]\s*\d+`,
        ].join("|"),
        "giu",
      ),
    ),
  ];
  return (
    candidates.find((match) => offset >= match.index! && offset <= match.index! + match[0].length)?.[0] ?? ""
  );
}
export function useHover(
  pdf: PDFDocumentProxy | null,
  references: Reference[],
  figures: FigureTarget[],
  imagePdf: PDFDocumentProxy | null = pdf,
) {
  const [preview, setPreview] = useState<HoverPreview | null>(null);
  const timers = useRef<{
    open?: ReturnType<typeof setTimeout>;
    close?: ReturnType<typeof setTimeout>;
    key: string;
    version: number;
  }>({ key: "", version: 0 });
  const candidate = useRef<{
    text: string;
    link?: LinkBox;
    pdf: PDFDocumentProxy;
    x: number;
    y: number;
  } | null>(null);
  const display = async (version: number) => {
    const current = candidate.current;
    if (!current || !timers.current.key) {
      return;
    }
    const marker = figureReference(current.text),
      figure =
        marker && figures.find((entry) => entry.kind === marker.kind && entry.number === marker.number);
    const target = current.link?.dest ? await destination(current.pdf, current.link.dest) : null;
    const matches = findReferences(current.text, references, target ?? undefined);
    if (version !== timers.current.version) {
      return;
    }
    if (figure) {
      setPreview({ x: current.x, y: current.y, figure, pdf: imagePdf ?? current.pdf });
    } else if (matches.length) {
      setPreview({ x: current.x, y: current.y, references: matches, pdf: current.pdf });
    }
  };
  useEffect(() => {
    if (timers.current.key) {
      clearTimeout(timers.current.open);
      const version = timers.current.version;
      timers.current.open = setTimeout(() => void display(version), 300);
    }
  }, [references, figures, imagePdf]);
  const hold = () => clearTimeout(timers.current.close);
  const leave = () => {
    clearTimeout(timers.current.close);
    clearTimeout(timers.current.open);
    timers.current.key = "";
    timers.current.version++;
    timers.current.close = setTimeout(() => setPreview(null), 180);
  };
  const hover = (event: React.MouseEvent, link?: LinkBox) => {
    if (!pdf || window.getSelection()?.toString()) {
      return;
    }
    const text = textAt(event, link);
    const key = `${text}:${JSON.stringify(link?.dest ?? "")}`;
    if (!text && !link?.dest) {
      if (timers.current.key) {
        leave();
      }
      return;
    }
    hold();
    if (timers.current.key === key) {
      return;
    }
    clearTimeout(timers.current.open);
    timers.current.key = key;
    const version = ++timers.current.version;
    candidate.current = { text, link, pdf, x: event.clientX, y: event.clientY };
    timers.current.open = setTimeout(() => void display(version), 300);
  };
  useEffect(
    () => () => {
      clearTimeout(timers.current.open);
      clearTimeout(timers.current.close);
      timers.current.version++;
    },
    [],
  );
  const activate = (event: React.MouseEvent) => {
    if (window.getSelection()?.toString()) {
      return null;
    }
    const text = textAt(event),
      marker = figureReference(text);
    const figure =
      marker && figures.find((entry) => entry.kind === marker.kind && entry.number === marker.number);
    if (figure) {
      return { page: figure.page, y: figure.top };
    }
    const reference = findReferences(text, references)[0];
    return reference ? { page: reference.page, y: reference.y } : null;
  };
  return {
    preview,
    hover,
    activate,
    leave,
    hold,
    close: () => {
      leave();
      setPreview(null);
    },
  };
}
