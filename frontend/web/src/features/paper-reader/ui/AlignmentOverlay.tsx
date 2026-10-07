import type { AlignmentBand, ParagraphBox } from "../domain/alignment.js";

export function AlignmentOverlay({
  page,
  band,
  pinned,
  paragraph,
}: {
  page: number;
  band?: AlignmentBand;
  pinned: boolean;
  paragraph?: ParagraphBox;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden="true">
      {band?.page === page ? (
        <div
          data-alignment-guide
          data-alignment-pinned={pinned}
          className="absolute inset-x-0"
          style={{
            top: `${band.y * 100}%`,
            height: `${band.height * 100}%`,
            background: "var(--pr-alignment-guide)",
          }}
        />
      ) : null}
      {paragraph?.page === page ? (
        <div
          data-paragraph-guide={paragraph.id}
          className="absolute rounded-sm border border-wb-accent"
          style={{
            left: `${paragraph.rect[0] * 100}%`,
            top: `${paragraph.rect[1] * 100}%`,
            width: `${(paragraph.rect[2] - paragraph.rect[0]) * 100}%`,
            height: `${(paragraph.rect[3] - paragraph.rect[1]) * 100}%`,
            background: "var(--pr-paragraph-guide)",
          }}
        />
      ) : null}
    </div>
  );
}
