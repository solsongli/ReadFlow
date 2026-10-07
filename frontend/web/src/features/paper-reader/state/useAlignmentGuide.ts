import { useEffect, useMemo, useRef, useState } from "react";
import {
  alignmentBands,
  moveAlignmentLine,
  paragraphAt,
  snapAlignmentLine,
  type AlignmentBand,
  type PagePoint,
  type ParagraphBox,
} from "../domain/alignment.js";
import type { TextLine } from "../domain/types.js";

export function useAlignmentGuide({
  active,
  lines,
  sizes,
  paragraphs,
}: {
  active: boolean;
  lines: TextLine[];
  sizes: Array<{ width: number; height: number }>;
  paragraphs: ParagraphBox[];
}) {
  const bands = useMemo(() => alignmentBands(lines, sizes), [lines, sizes]);
  const [hovered, setHovered] = useState<AlignmentBand>();
  const [pinned, setPinned] = useState<AlignmentBand>();
  const [paragraph, setParagraph] = useState<ParagraphBox>();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!active) {
      setHovered(undefined);
      setPinned(undefined);
      setParagraph(undefined);
    }
  }, [active]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const snap = (point: PagePoint) => snapAlignmentLine(bands, point);
  return {
    active,
    band: active ? pinned || hovered : undefined,
    pinned: Boolean(pinned),
    paragraph: active ? paragraph : undefined,
    move: (point: PagePoint) => {
      if (active && !pinned) setHovered(snap(point));
    },
    leave: () => {
      if (!pinned) setHovered(undefined);
    },
    click: (point: PagePoint) => {
      if (!active) return;
      const next = snap(point);
      setPinned((current) => (current?.index === next?.index ? undefined : next));
      setHovered(next);
    },
    doubleClick: (point: PagePoint) => {
      if (!active) return;
      setPinned(undefined);
      setHovered(undefined);
      setParagraph(paragraphAt(paragraphs, point));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setParagraph(undefined), 1500);
    },
    key: (event: KeyboardEvent) => {
      if (!active || !pinned) return false;
      if (event.key === "Escape") {
        setPinned(undefined);
        setHovered(undefined);
        return true;
      }
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return false;
      const next = moveAlignmentLine(bands, pinned, event.key === "ArrowUp" ? -1 : 1);
      setPinned(next);
      setHovered(next);
      return true;
    },
  };
}
