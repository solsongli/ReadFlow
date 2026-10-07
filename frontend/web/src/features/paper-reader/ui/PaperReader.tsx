import { useInlinePeek } from "../state/useInlinePeek.js";
import { useReaderCards } from "../state/useReaderCards.js";

import { useAssistance } from "../state/assistance/useAssistance.js";
import { DeleteReferences } from "./annotations/DeleteReferences.js";
import { ReaderCanvasLayout, type ReaderLayout } from "./ReaderCanvasLayout.js";

import { ReaderDialogs } from "./ReaderDialogs.js";
import { useAnnotationReader } from "../state/annotations/useAnnotationReader.js";
import { AnnotationTools } from "./annotations/Tools.js";

import { AnnotationsPanel } from "./annotations/Panel.js";
import { AnnotationPopup } from "./annotations/Popup.js";
import { Colors } from "./annotations/Colors.js";
import { useRef, useState, useEffect, type ReactNode } from "react";
import { Button } from "@/ui/wb/Button.js";
import type { ReaderPorts } from "../domain/types.js";
import { useReaderModel } from "../state/useReaderModel.js";
import { Toolbar } from "./Toolbar.js";
import { ReaderPages } from "./ReaderPages.js";
import { NavigationPanel } from "./NavigationPanel.js";
import { InformationPanel } from "./InformationPanel.js";
import { Preview } from "./Preview.js";
import { SelectionTools } from "./SelectionTools.js";
import { useSelectionGesture } from "../state/useSelectionGesture.js";
import { useAlignmentGuide } from "../state/useAlignmentGuide.js";
import type { MarginEntry } from "@/ui/wb/PageMargins.js";
export interface PaperReaderProps extends ReaderPorts {
  toolbarTools?: ReactNode;
  blockMargins?: (page: number, interactive: boolean) => MarginEntry[];
  blockMarginActive?: boolean;
  blockMarginWide?: boolean;
  inlinePeek?: boolean;
  figures?: ReactNode;
  blockOverlay?: (page: number, interactive: boolean, inline?: boolean, peek?: boolean) => ReactNode;
  translationPanel?: (page: number) => ReactNode;
  canvas?: ReactNode;
  selectionTools?: ReactNode;
  panels?: Partial<Record<"批注" | "画布" | "AI", ReactNode>>;
}
export function PaperReader(ports: PaperReaderProps) {
  const [marginPreferences, setMarginPreferences] = useState({
    notes: true,
    side: "auto" as "auto" | "right",
    translations: false,
  });
  ports = {
    ...ports,
    marginPreferences: ports.marginPreferences || marginPreferences,
    setMarginPreferences: ports.setMarginPreferences || setMarginPreferences,
  };
  const [layout, setLayout] = useState<ReaderLayout>("document");
  useEffect(() => {
    if (ports.flashAnnotationId && ports.active) {
      setLayout("document");
    }
  }, [ports.flashAnnotationId, ports.navigationKey, ports.active]);
  const annotationKeys = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const model = useReaderModel({ ...ports, annotationKeys: (event) => annotationKeys.current(event) });
  const alignment = useAlignmentGuide({
    active:
      ports.active &&
      model.mode === "compare" &&
      Boolean(ports.compareTranslated) &&
      ports.alignmentGuide !== false,
    lines: model.source.lines,
    sizes: model.source.sizes,
    paragraphs: ports.paragraphs || [],
  });
  useSelectionGesture(model.root);
  const peek = useInlinePeek(ports.active && model.mode === "inline");
  const annotations = useAnnotationReader(ports, model);
  const assistance = useAssistance(ports, model, annotations, () => setLayout("document"));
  const cards = useReaderCards(
    ports,
    annotations,
    (quote, page) =>
      assistance.existingTranslation(quote) ??
      (model.translated.lines
        .filter((line) => line.page === page)
        .map((line) => line.text)
        .join("\n") ||
        undefined),
  );
  annotationKeys.current = (event) =>
    cards.key(event) || assistance.key(event) || annotations.key(event) || alignment.key(event);
  const { c, labels, byPage, annotate } = annotations;
  const {
    root,
    primary,
    secondary,
    source,
    translated,
    comparison,
    zoom,
    setZoom,
    mode,
    setMode,
    focus,
    setFocus,
    left,
    setLeft,
    right,
    setRight,
    nav,
    setNav,
    sync,
    setSync,
    position,
    history,
    query,
    setQuery,
    resultIndex,
    external,
    setExternal,
    bookmark,
    setBookmark,
    notice,
    setNotice,
    matches,
    queue,
    reading,
    main,
    references,
    headings,
    hits,
    hovered,
    navigate,
    jump,
    travel,
    report,
    search,
    selectResult,
    currentHeading,
    copy,
    link,
    lookup,
    common,
    setSourceRetry,
    setTranslatedRetry,
    pendingJump,
  } = model;
  return (
    <div
      ref={root}
      data-paper-reader
      data-tone={ports.tone}
      data-focus={focus}
      data-reading-mode={mode}
      className="pr-reader relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-wb-panel text-wb-text"
      onMouseDown={(event) => {
        if (event.button === 3 || event.button === 4) {
          event.preventDefault();
          travel(event.button === 3 ? -1 : 1);
        }
      }}
      onAuxClick={(event) => {
        if (event.button === 3 || event.button === 4) {
          event.preventDefault();
        }
      }}
    >
      <div className="pr-focus-edge" />
      <Toolbar
        page={position.page}
        pages={main.pdf?.numPages ?? 1}
        jump={(page) => jump(page)}
        back={() => travel(-1)}
        forward={() => travel(1)}
        canBack={history.cursor > 0}
        canForward={history.cursor >= 0 && history.cursor < history.entries.length - 1}
        zoom={zoom}
        setZoom={setZoom}
        scale={() => primary.current?.scale() ?? 1}
        mode={mode}
        setMode={setMode}
        translated={Boolean(ports.translated || ports.compareTranslated)}
        translatedReady={Boolean(translated.pdf || comparison.pdf)}
        focus={focus}
        toggleFocus={() => setFocus(!focus)}
        toggleLeft={() => setLeft(!left)}
        toggleRight={() => setRight(!right)}
        search={search}
        bookmark={() => setBookmark(`第 ${position.page} 页`)}
        tools={
          <>
            {ports.toolbarTools}
            {ports.canvas ? (
              <select
                aria-label="阅读器布局"
                value={layout}
                onChange={(event) => setLayout(event.target.value as ReaderLayout)}
                className="rounded-lg bg-wb-fill p-1 text-[0.75rem]"
              >
                <option value="document">只看文献</option>
                <option value="split">文献 + 画布</option>
                <option value="canvas">只看画布</option>
              </select>
            ) : null}
          </>
        }
        ports={ports}
      />
      {!focus ? (
        <div className="border-b border-wb-line-soft px-3 py-1">
          <AnnotationTools controller={c} labels={labels} disabled={mode === "translated"} />
        </div>
      ) : null}
      {ports.translation.running ? (
        <div className="flex items-center gap-3 border-b border-wb-line-soft px-4 py-1 text-[0.75rem] text-wb-text-3">
          <span>{ports.translation.label}</span>
          <div
            role="progressbar"
            aria-label="全文翻译进度"
            aria-valuenow={ports.translation.percent ?? undefined}
            className="h-1 flex-1 overflow-hidden rounded-full bg-wb-fill"
          >
            <div className="h-full bg-wb-accent" style={{ width: `${ports.translation.percent ?? 0}%` }} />
          </div>
          <Button size="sm" onClick={ports.translation.cancel}>
            取消翻译
          </Button>
        </div>
      ) : null}
      {translated.error && mode !== "translated" ? (
        <p role="status" className="m-0 px-4 py-2 text-[0.75rem] text-wb-text-3">
          译文暂时无法加载。
          <Button size="sm" onClick={() => setTranslatedRetry((n) => n + 1)}>
            重试译文
          </Button>
        </p>
      ) : null}
      {mode === "compare" ? (
        <div className="flex justify-between border-b border-wb-line-soft px-4 py-1 text-[0.6875rem] text-wb-text-3">
          <span>
            {ports.compareTranslated
              ? "逐行对齐译文 · 同页同行对齐"
              : ports.layoutAligned
                ? "原版式译文 · 同页同位置对齐"
                : "重排译文 · 同页号对应，缺页停在末页"}
          </span>
          <label>
            <input type="checkbox" checked={sync} onChange={(event) => setSync(event.target.checked)} />{" "}
            同步滚动
          </label>
        </div>
      ) : null}
      <ReaderCanvasLayout layout={layout} canvas={ports.canvas}>
        {left && !focus && layout === "document" && main.pdf ? (
          <NavigationPanel
            figures={ports.figures}
            tab={nav}
            setTab={setNav}
            outline={headings}
            current={currentHeading?.id ?? ""}
            pdf={main.pdf}
            queue={queue}
            bookmarks={reading.bookmarks}
            remove={(id) => void reading.remove(id)}
            jump={jump}
            query={query}
            setQuery={setQuery}
            hits={hits}
            resultIndex={resultIndex}
            selectResult={selectResult}
            indexed={main.indexed}
          />
        ) : null}
        <ReaderPages
          model={model}
          ports={{ ...ports, inlinePeek: peek }}
          annotations={annotations}
          alignment={alignment}
        />
        <InformationPanel
          overview={ports.assistance ? assistance.overview : undefined}
          hidden={!right || focus || layout !== "document"}
          panelRequest={assistance.panelRequest}
          panels={{
            译文: ports.translationPanel?.(position.page),
            ...ports.panels,
            AI: assistance.panel ?? ports.panels?.AI,
            批注: (
              <AnnotationsPanel
                controller={c}
                page={position.page}
                labels={labels}
                jump={annotations.open}
                canvasLinks={ports.canvasLinks}
                addToCanvas={ports.addAnnotationToCanvas}
                openCanvas={ports.openCanvasLink}
              />
            ),
          }}
          metadata={ports.metadata}
          seconds={reading.seconds}
          page={ports.lastReadPage ?? position.page}
          references={references}
          jump={(page, y) => jump(page, y, undefined, mode === "translated" ? "source" : mode)}
        />
      </ReaderCanvasLayout>
      <div aria-label="阅读进度" className="h-0.5 shrink-0 bg-wb-fill">
        <div
          className="h-full bg-wb-accent"
          style={{ width: `${(position.page / (main.pdf?.numPages || 1)) * 100}%` }}
        />
      </div>
      {hovered.preview ? (
        <Preview
          preview={hovered.preview}
          queue={queue}
          jump={(page, y) => jump(page, y, undefined, mode === "translated" ? "source" : mode)}
          lookup={(ref) => void lookup(ref)}
          matches={matches}
          leave={hovered.leave}
          hold={hovered.hold}
        />
      ) : null}
      <SelectionTools
        root={root}
        copy={(format) => void copy(format)}
        tools={ports.selectionTools}
        annotationTools={
          mode === "translated" ? undefined : (
            <>
              {ports.addSelectionToCanvas ? (
                <Button size="sm" onClick={ports.addSelectionToCanvas}>
                  加入画布…
                </Button>
              ) : null}
              {assistance.tools}
              {cards.tool}
              <Colors labels={labels} change={(color) => void annotate("highlight", color)} />
              <Button size="sm" onClick={() => void annotate("underline")}>
                下划线
              </Button>
              <Button size="sm" onClick={() => void annotate("highlight", c.color, true)}>
                添加批注
              </Button>
            </>
          )
        }
      />
      {!focus && mode !== "translated" ? <AnnotationPopup controller={c} labels={labels} /> : null}
      {c.error || c.notice ? (
        <div
          role="status"
          className="absolute bottom-2 right-3 z-40 rounded-xl bg-wb-panel p-3 shadow-wb-pop"
        >
          {c.error || c.notice}
          {c.error ? (
            <Button size="sm" onClick={c.retry}>
              重试
            </Button>
          ) : (
            <Button size="sm" onClick={() => c.setNotice("")}>
              收起
            </Button>
          )}
        </div>
      ) : null}
      {assistance.card}
      <ReaderDialogs model={model} />
      <DeleteReferences controller={c} />
    </div>
  );
}
