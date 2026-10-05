import { memo, useEffect, useRef, useState } from "react";
import type { Block, PageGeometry } from "../domain/model.js";
import { inlineTypes, labelBox, translatedParts } from "../domain/reading.js";
import { typographyScale } from "../domain/typography.js";
import { FittedTranslation } from "./FittedTranslation.js";
export const InlineLayer = memo(function InlineLayer({
  blocks,
  page,
  geometry,
  hidden,
  originals,
  imageText,
}: {
  blocks: Block[];
  page: number;
  geometry?: PageGeometry;
  hidden: boolean;
  originals: Set<string>;
  imageText: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [width, setWidth] = useState(0),
    [selecting, setSelecting] = useState(false);
  useEffect(() => {
    const target = root.current!.closest<HTMLElement>("[data-paper-page]")!;
    const intersection = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      root: target.closest("[data-pdf-pane]"),
      rootMargin: "200px 0px",
    });
    intersection.observe(target);
    const observer = new ResizeObserver(() => setWidth(target.clientWidth));
    observer.observe(target);
    let start: { x: number; y: number } | null = null;
    const selection = () => {
      const value = window.getSelection();
      setSelecting(Boolean(value?.toString().trim() && target.contains(value.anchorNode)));
    };
    const down = (event: PointerEvent) => {
      if (event.button === 0) start = { x: event.clientX, y: event.clientY };
    };
    const move = (event: PointerEvent) => {
      if (start && event.buttons && Math.hypot(start.x - event.clientX, start.y - event.clientY) > 4)
        setSelecting(true);
    };
    const up = () => {
      start = null;
      selection();
    };
    target.addEventListener("pointerdown", down);
    target.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.addEventListener("selectionchange", selection);
    return () => {
      observer.disconnect();
      intersection.disconnect();
      target.removeEventListener("pointerdown", down);
      target.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.removeEventListener("selectionchange", selection);
    };
  }, []);
  const entries = blocks.flatMap((block) => {
    if (originals.has(block.id)) return [];
    if (inlineTypes.includes(block.type) && block.translation) {
      return translatedParts(block)
        .filter((p) => p.anchor.page === page && p.text)
        .map((p, index) => ({
          id: `${block.id}-${index}`,
          blockId: block.id,
          box: p.anchor.view_bbox,
          text: p.text,
          runs: p.runs,
          base:
            (block.text_size || block.size || 10) * typographyScale(p.anchor.view_bbox, p.anchor.bbox, width),
          label: false,
        }));
    }
    if (imageText && geometry && ["figure", "table"].includes(block.type) && block.page === page) {
      return (block.figure_text || [])
        .filter((l) => l.translation && l.bbox)
        .map((l) => ({
          id: l.id,
          blockId: block.id,
          box: labelBox(l.bbox!, geometry),
          text: l.translation!,
          runs: undefined,
          base: ((l.size || 8) * width) / geometry.width,
          label: true,
        }));
    }
    return [];
  });
  return (
    <div
      ref={root}
      data-inline-layer={page}
      data-inline-ready={near}
      data-inline-hidden={hidden || selecting}
      className="pb-inline-layer pointer-events-none absolute inset-0"
      aria-hidden="true"
    >
      {near &&
        entries.map((entry) => (
          <div
            key={entry.id}
            data-inline-block={entry.blockId}
            className="absolute overflow-hidden"
            style={{
              left: `${entry.box[0] * 100}%`,
              top: `${entry.box[1] * 100}%`,
              width: `${(entry.box[2] - entry.box[0]) * 100}%`,
              height: `${(entry.box[3] - entry.box[1]) * 100}%`,
            }}
          >
            <FittedTranslation text={entry.text} runs={entry.runs} base={entry.base} label={entry.label} />
          </div>
        ))}
    </div>
  );
});
