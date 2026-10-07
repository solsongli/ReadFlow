import { Button } from "@/ui/wb/Button.js";
import { PdfPane } from "./PdfPane.js";
import { AnnotationLayer } from "./annotations/Layer.js";
import { CanvasBadges } from "./annotations/CanvasBadges.js";
import { CardBadges } from "./annotations/CardBadges.js";
import { annotationMargins } from "../state/annotations/margins.js";
import type { useReaderModel } from "../state/useReaderModel.js";
import type { useAnnotationReader } from "../state/annotations/useAnnotationReader.js";
import type { PaperReaderProps } from "./PaperReader.js";
import { useMemo, useRef } from "react";
import type { MarginEntry } from "@/ui/wb/PageMargins.js";
import type { useAlignmentGuide } from "../state/useAlignmentGuide.js";
import { AlignmentOverlay } from "./AlignmentOverlay.js";
const NO_SEARCH = { query: "", caseSensitive: false, wholeWord: false };
export function ReaderPages({
  model,
  ports,
  annotations,
  alignment,
}: {
  model: ReturnType<typeof useReaderModel>;
  ports: PaperReaderProps;
  annotations: ReturnType<typeof useAnnotationReader>;
  alignment: ReturnType<typeof useAlignmentGuide>;
}) {
  const {
    main,
    mode,
    primary,
    secondary,
    comparison,
    common,
    report,
    position,
    pendingJump,
    setSourceRetry,
    setTranslatedRetry,
    link,
  } = model;
  const { c, byPage } = annotations;
  const primarySearch =
    mode === "compare" && model.searcher.scope === "translated" ? NO_SEARCH : common.search;
  const secondarySearch = model.searcher.scope === "translated" ? common.search : NO_SEARCH;
  const readingGuide = {
    move: alignment.move,
    leave: alignment.leave,
    click: alignment.click,
    doubleClick: alignment.doubleClick,
  };
  const readingOverlay = (page: number) => (
    <AlignmentOverlay
      page={page}
      band={alignment.band}
      pinned={alignment.pinned}
      paragraph={alignment.paragraph}
    />
  );
  const latest = useRef(annotations);
  latest.current = annotations;
  const margins = useMemo(() => {
    if (
      mode === "translated" ||
      model.focus ||
      (ports.marginPreferences?.notes === false && !ports.blockMarginActive && !ports.blockMarginWide)
    )
      return undefined;
    return (page: number): MarginEntry[] => [
      ...(ports.marginPreferences?.notes !== false
        ? annotationMargins(byPage.get(page) || [], c, (row) => latest.current.open(row))
        : []),
      ...(ports.blockMargins?.(page + 1, c.tool === "select") || []),
    ];
  }, [
    mode,
    model.focus,
    ports.marginPreferences?.notes,
    ports.blockMarginActive,
    ports.blockMarginWide,
    ports.blockMargins,
    byPage,
    c.tool,
    c.hover,
    c.flash,
    c.editingId,
  ]);
  return (
    <>
      {main.error ? (
        <div role="status" className="m-auto p-8 text-wb-text-3">
          {main.error}
          <Button
            onClick={() => {
              pendingJump.current = position;
              if (mode === "translated") setTranslatedRetry((n) => n + 1);
              else setSourceRetry((n) => n + 1);
            }}
          >
            重试
          </Button>
        </div>
      ) : main.pdf ? (
        <PdfPane
          ref={primary}
          pdf={main.pdf}
          sizes={main.sizes}
          {...common}
          search={primarySearch}
          label={mode === "translated" ? "译文页面" : "原文页面"}
          marginSide={ports.marginPreferences?.side || "auto"}
          paragraphMargins={ports.blockMarginWide}
          reserveMargins={mode !== "compare"}
          margins={margins}
          readingOverlay={readingOverlay}
          readingGuide={readingGuide}
          overlay={
            mode === "translated"
              ? undefined
              : (page) => (
                  <>
                    {ports.blockOverlay?.(page + 1, c.tool === "select", mode === "inline", ports.inlinePeek)}
                    <AnnotationLayer page={page} rows={byPage.get(page) || []} controller={c} />
                    <CanvasBadges rows={byPage.get(page) || []} ports={ports} />
                    <CardBadges rows={byPage.get(page) || []} />
                  </>
                )
          }
          onPosition={(pos, program) => report(pos, false, program)}
        />
      ) : (
        <p role="status" className="m-auto text-wb-text-3">
          正在打开论文…
        </p>
      )}
      {mode === "compare" && comparison.pdf ? (
        <PdfPane
          ref={secondary}
          pdf={comparison.pdf}
          sizes={comparison.sizes}
          {...common}
          search={secondarySearch}
          label="译文页面"
          readingOverlay={readingOverlay}
          readingGuide={readingGuide}
          onLink={(value) => void link(value, true)}
          onPosition={(pos, program) => report(pos, true, program)}
        />
      ) : null}
    </>
  );
}
