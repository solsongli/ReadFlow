import { useEffect, useMemo, useRef } from "react";
import { useAnnotations } from "./useAnnotations.js";
import { sourceSelection } from "./selection.js";
import { clearReaderSelection, settledSelection } from "@/ui/wb/selection-events.js";
import {
  DEFAULT_SEMANTICS,
  type Annotation,
  type AnnotationColor,
  type AnnotationType,
  type Tool,
} from "../../domain/annotations/types.js";
import type { ReaderPorts } from "../../domain/types.js";
import type { useReaderModel } from "../useReaderModel.js";
import { annotationCitation } from "../../domain/annotations/citation.js";

export function useAnnotationReader(ports: ReaderPorts, model: ReturnType<typeof useReaderModel>) {
  const labels = ports.annotationSemantics ?? DEFAULT_SEMANTICS;
  const c = useAnnotations(
    ports.metadata.id,
    ports.attachmentId ?? "",
    ports.active,
    () => ports.annotationsChanged?.(),
    labels,
    ports.metadata.citekey
      ? `@${ports.metadata.citekey} · ${ports.metadata.title}`
      : ports.quote("", 1, "gbt"),
    (row) => annotationCitation(row, ports.metadata.authors, ports.metadata.year),
  );
  const { root, mode, jump, setRight, setFocus } = model;
  const cachedSelection = useRef<ReturnType<typeof sourceSelection>>([]);
  useEffect(() => {
    const capture = () => {
      const value = sourceSelection(root.current);
      if (value.length) {
        cachedSelection.current = value;
      }
    };
    const drag = (event: DragEvent) => {
      if (!(event.target as Element).closest('[data-annotation-source="true"] .pr-text-layer')) {
        return;
      }
      capture();
      if (cachedSelection.current.length) {
        event.dataTransfer?.setData(
          "application/x-readflow-canvas",
          JSON.stringify({ type: "selection", itemId: ports.metadata.id }),
        );
      }
    };
    const stopSelection = settledSelection(() => root.current, capture);
    root.current?.addEventListener("dragstart", drag);
    const unregister = ports.registerCanvasSelection?.(async () => {
      const anchors = sourceSelection(root.current);
      const ids = await c.createLinked(
        (anchors.length ? anchors : cachedSelection.current).map((anchor) => ({
          type: "highlight",
          color: c.color,
          quote: anchor.quote,
          page_index: anchor.page,
          rects: anchor.rects,
        })),
      );
      if (ids.length) {
        window.getSelection()?.removeAllRanges();
        cachedSelection.current = [];
        c.setEditingId(null);
      }
      return ids;
    });
    const element = root.current;
    return () => {
      stopSelection();
      element?.removeEventListener("dragstart", drag);
      unregister?.();
    };
  }, [ports.metadata.id, c.color]);
  const revealed = useRef("");
  useEffect(() => {
    const key = `${ports.flashAnnotationId}:${ports.navigationKey}`;
    if (!ports.flashAnnotationId || !ports.active || revealed.current === key || !model.source.pdf) {
      return;
    }
    const annotation = c.rows.find((row) => row.id === ports.flashAnnotationId);
    if (!annotation) {
      return;
    }
    let frame: number;
    const reveal = () => {
      const pane = root.current?.querySelector<HTMLElement>("[data-pdf-pane]");
      if (pane?.getClientRects().length) {
        revealed.current = key;
        open(annotation);
      } else {
        frame = requestAnimationFrame(reveal);
      }
    };
    frame = requestAnimationFrame(reveal);
    return () => cancelAnimationFrame(frame);
  }, [ports.flashAnnotationId, ports.navigationKey, ports.active, c.rows, model.source.pdf]);
  const byPage = useMemo(() => {
    const pages = new Map<number, Annotation[]>();
    for (const row of c.rows) {
      pages.set(row.page_index, [...(pages.get(row.page_index) ?? []), row]);
    }
    return pages;
  }, [c.rows]);
  async function annotate(type: AnnotationType, color: AnnotationColor = c.color, note = false) {
    if (mode === "translated" || c.busy) {
      return;
    }
    const selections = sourceSelection(root.current);
    if (!selections.length) {
      return;
    }
    const values = selections.map((selection) => ({
      type,
      color,
      page_index: selection.page,
      rects: selection.rects,
      quote: selection.quote,
    }));
    clearReaderSelection();
    await c.createBatch(values);
    if (note) {
      setRight(true);
      setFocus(false);
    }
  }
  useEffect(() => {
    const target = root.current;
    const auto = (event: PointerEvent) => {
      const element = event.target as Element | null;
      if (!element?.closest('[data-annotation-source="true"] .pr-text-layer')) {
        return;
      }
      if (c.tool === "highlight" || c.tool === "underline") {
        void annotate(c.tool);
      }
    };
    target?.addEventListener("pointerup", auto);
    return () => target?.removeEventListener("pointerup", auto);
  }, [c.tool, c.color, mode, c.busy]);
  const open = (row: Annotation) => {
    jump(row.page_index + 1, 0, row.rects[0]?.y ?? row.ink[0]?.y ?? 0, "source");
    c.setFlash(row.id);
  };
  function key(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      void c.travel(event.shiftKey);
      return true;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || mode === "translated") {
      return false;
    }
    if (/^[1-5]$/.test(key)) {
      c.setColor((["yellow", "blue", "green", "red", "purple"] as const)[Number(key) - 1]);
      return false; // Preserve R1's numeric page buffer; Enter still jumps.
    }
    if (key === "n" && model.nav === "search" && model.searcher.query) {
      return false;
    }
    const tools: Record<string, Tool> = {
      v: "select",
      h: "highlight",
      u: "underline",
      n: "sticky",
      r: "region",
      p: "ink",
      e: "erase",
    };
    if (!tools[key]) {
      return false;
    }
    c.setTool(tools[key]);
    return true;
  }
  return {
    c,
    labels,
    byPage,
    annotate,
    open,
    key,
    readSelection: () => (mode === "translated" ? [] : sourceSelection(root.current)),
  };
}
