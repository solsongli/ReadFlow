import { useBlockNavigation } from "./useBlockNavigation.js";
import { useReferenceLookup } from "./useReferenceLookup.js";
import { copySelection } from "./copySelection.js";
import { useReaderDialogFocus } from "./useReaderDialogFocus.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { figureTargets, heuristicOutline, parseReferences, searchLines } from "../domain/analysis.js";
import {
  correspondingPage,
  externalLink,
  initialHistory,
  jumpHistory,
  moveHistory,
} from "../domain/navigation.js";
import type { Mode, Position, ReaderPorts, Reference } from "../domain/types.js";
import { destination, renderQueue } from "./document.js";
import { useDocument } from "./useDocument.js";
import { useReadingData } from "./useReadingData.js";
import { useReaderKeys } from "./useReaderKeys.js";
import { useHover } from "./useHover.js";
import type { PaneHandle, Zoom } from "../ui/PdfPane.js";
import type { LinkBox } from "../ui/PdfPage.js";
import type { NavigationTab } from "../ui/NavigationPanel.js";
export function useReaderModel(ports: ReaderPorts) {
  const root = useRef<HTMLDivElement>(null),
    primary = useRef<PaneHandle>(null),
    secondary = useRef<PaneHandle>(null);
  const [sourceRetry, setSourceRetry] = useState(0),
    [translatedRetry, setTranslatedRetry] = useState(0);
  const pendingJump = useRef<Position | null>(null);
  const navigationSeen = useRef(ports.navigationKey);
  const source = useDocument(ports.source.url, ports.source.headers, sourceRetry),
    translated = useDocument(ports.translated?.url, ports.translated?.headers ?? {}, translatedRetry);
  const [zoom, setZoom] = useState<Zoom>("width"),
    [mode, setMode] = useState<Mode>("source"),
    [focus, setFocus] = useState(false);
  const [left, setLeft] = useState(true),
    [right, setRight] = useState(() => window.innerWidth >= 1200),
    [nav, setNav] = useState<NavigationTab>("outline"),
    [sync, setSync] = useState(true);
  const [position, setPosition] = useState<Position>({ page: ports.resumePage || 1, offset: 0 }),
    [history, setHistory] = useState(initialHistory);
  const [query, setQuery] = useState(""),
    [resultIndex, setResult] = useState(-1),
    [external, setExternal] = useState<string | null>(null);
  const [bookmark, setBookmark] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const queue = useMemo(renderQueue, []),
    reading = useReadingData(ports.metadata.id, ports.active);
  const main = mode === "translated" ? translated : source;
  const references = useMemo(() => parseReferences(source.lines), [source.lines]);
  const figures = useMemo(
    () =>
      figureTargets(
        source.lines,
        source.sizes.map((s) => s.height),
      ),
    [source.lines, source.sizes],
  );
  const headings = useMemo(
    () => (main.outline.length ? main.outline : heuristicOutline(main.lines)),
    [main.outline, main.lines],
  );
  const hits = useMemo(() => searchLines(main.lines, query), [main.lines, query]);
  const hovered = useHover(main.pdf, references, figures, source.pdf);
  const saveTime = useRef(0),
    progressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingProgress = useRef<{ page: number; pages: number } | null>(null);
  const { matches, lookup } = useReferenceLookup(ports, hovered.preview, setNotice);
  const latest = useRef(ports);
  latest.current = ports;
  const started = useRef(performance.now()),
    paintedOnce = useRef(false);
  const painted = () => {
    if (!paintedOnce.current) {
      paintedOnce.current = true;
      if (root.current) {
        root.current.dataset.firstPaintMs = String(Math.round(performance.now() - started.current));
        root.current.dataset.navigationPaintMs = String(Math.round(performance.now()));
      }
    }
  };
  const navigate = (target: Position, record = true) => {
    const from = { ...(primary.current?.position() ?? position), mode, other: secondary.current?.position() };
    if (target.mode && target.mode !== mode) {
      if (record) {
        setHistory((value) => jumpHistory(value, from, target));
      }
      pendingJump.current = target;
      setMode(target.mode);
      return;
    }
    const bounded = { ...target, mode, page: correspondingPage(target.page, main.pdf?.numPages ?? 1) };
    if (record) {
      setHistory((value) => jumpHistory(value, from, bounded));
    }
    primary.current?.jump(bounded);
    if (mode === "compare" && (target.other || sync)) {
      secondary.current?.jump(
        target.other ?? { ...bounded, page: correspondingPage(bounded.page, translated.pdf?.numPages ?? 1) },
      );
    }
    setPosition(bounded);
    hovered.close();
  };
  const jump = (page: number, y = 0, offset?: number, targetMode: Mode = mode) =>
    navigate({
      page,
      mode: targetMode,
      offset:
        offset ?? y / ((targetMode === "translated" ? translated : source).sizes[page - 1]?.height || 842),
    });
  useBlockNavigation(ports, mode, setMode, navigate);
  const travel = (direction: -1 | 1) => {
    const result = moveHistory(
      history,
      { ...(primary.current?.position() ?? position), mode, other: secondary.current?.position() },
      direction,
    );
    setHistory(result.history);
    if (result.target) {
      navigate(result.target, false);
    }
  };
  const report = (value: Position, fromSecondary = false, programmatic = false) => {
    if (!ports.active) {
      return;
    }
    if (fromSecondary && programmatic) {
      return;
    }
    if (mode === "compare" && sync && !programmatic) {
      (fromSecondary ? primary : secondary).current?.jump({
        ...value,
        page: correspondingPage(value.page, fromSecondary ? source.pdf!.numPages : translated.pdf!.numPages),
      });
    }
    if (fromSecondary && !sync) {
      return;
    }
    setPosition(
      fromSecondary ? { ...value, page: correspondingPage(value.page, source.pdf?.numPages ?? 1) } : value,
    );
    if (source.pdf) {
      latest.current.onPageChange?.(Math.min(value.page, source.pdf.numPages));
      pendingProgress.current = {
        page: Math.min(value.page, source.pdf.numPages),
        pages: source.pdf.numPages,
      };
    }
    const save = () => {
      const pending = pendingProgress.current;
      if (!pending) {
        return;
      }
      pendingProgress.current = null;
      saveTime.current = performance.now();
      latest.current.progress(pending.page, pending.pages);
    };
    clearTimeout(progressTimer.current);
    if (performance.now() - saveTime.current >= 1000) {
      save();
    } else {
      progressTimer.current = setTimeout(save, 1000);
    }
    if (root.current) {
      root.current.dataset.renderQueue = JSON.stringify(queue.metrics());
    }
  };
  useEffect(() => {
    if (!source.pdf) {
      return;
    }
    const changed = navigationSeen.current !== ports.navigationKey;
    navigationSeen.current = ports.navigationKey;
    if (changed) {
      navigate({ page: ports.resumePage || 1, offset: 0, mode: "source" });
    } else if (!sourceRetry) {
      primary.current?.jump({ page: ports.resumePage || 1, offset: 0 });
    }
  }, [source.pdf, ports.navigationKey]);
  useEffect(() => {
    if (!ports.active) {
      return;
    }
    const target = pendingJump.current ?? position;
    primary.current?.jump(target);
    secondary.current?.jump(
      target.other ?? { ...target, page: correspondingPage(target.page, translated.pdf?.numPages ?? 1) },
    );
    if (pendingJump.current && main.pdf) {
      setPosition(target);
      pendingJump.current = null;
    }
  }, [mode, main.pdf, translated.pdf, ports.active]);
  useEffect(
    () => () => {
      clearTimeout(progressTimer.current);
      const pending = pendingProgress.current;
      if (pending) {
        pendingProgress.current = null;
        latest.current.progress(pending.page, pending.pages);
      }
    },
    [],
  );
  useEffect(() => {
    if (!ports.active) {
      hovered.close();
    }
  }, [ports.active]);
  useEffect(() => {
    latest.current.onFocusChange?.(focus);
  }, [focus]);
  useEffect(() => {
    if (!notice.startsWith("已") && notice !== "书签已保存") {
      return;
    }
    const timer = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(timer);
  }, [notice]);
  const search = () => {
    setFocus(false);
    setLeft(true);
    setNav("search");
    setTimeout(() => root.current?.querySelector<HTMLInputElement>("[data-paper-search]")?.focus(), 0);
  };
  const selectResult = (index: number) => {
    if (!hits.length) {
      return;
    }
    const next = (index + hits.length) % hits.length;
    setResult(next);
    jump(hits[next].page, hits[next].y);
  };
  const currentHeading = [...headings]
    .reverse()
    .find(
      (entry) =>
        entry.page < position.page ||
        (entry.page === position.page &&
          entry.y / (main.sizes[entry.page - 1]?.height || 842) <= position.offset + 0.1),
    );
  const section = (direction: number) => {
    const index = headings.findIndex((h) => h.id === currentHeading?.id);
    const next = headings[Math.max(0, Math.min(headings.length - 1, index + direction))];
    if (next) {
      jump(next.page, next.y);
    }
  };
  const copy = (format: "plain" | "author" | "gbt") =>
    copySelection(root, position, ports, setNotice, format);
  useReaderKeys({
    annotationKeys: ports.annotationKeys,
    active: ports.active,
    pages: main.pdf?.numPages ?? 1,
    jump: (page) => jump(page),
    scroll: (amount) => primary.current?.scroll(amount),
    height: () => primary.current?.element()?.clientHeight ?? 700,
    back: () => travel(-1),
    forward: () => travel(1),
    search,
    result: (direction) => selectResult(resultIndex + direction),
    section,
    focus: () => setFocus((f) => !f),
    copy: () => void copy("author"),
    scale: () => primary.current?.scale() ?? 1,
    setZoom,
  });
  const link = async (value: LinkBox, secondaryLink = false) => {
    const document = secondaryLink ? translated : main;
    if (value.dest && document.pdf) {
      const target = await destination(document.pdf, value.dest);
      if (target) {
        const where = {
          page: target.page,
          offset: target.y / (document.sizes[target.page - 1]?.height || 842),
        };
        if (secondaryLink) {
          navigate({
            ...(sync
              ? { ...where, page: correspondingPage(where.page, source.pdf?.numPages ?? 1) }
              : primary.current!.position()),
            other: where,
          });
        } else {
          navigate(where);
        }
      }
    } else if (value.url) {
      const valid = externalLink(value.url);
      if (valid) {
        setExternal(valid);
      } else {
        setNotice("此链接类型不受支持。");
      }
    }
  };
  useReaderDialogFocus(root, Boolean(external) || bookmark != null, () => {
    setExternal(null);
    setBookmark(null);
  });
  const common = {
    zoom,
    setZoom,
    queue,
    query,
    active: ports.active,
    onLink: link,
    onTextClick: (event: React.MouseEvent) => {
      const target = hovered.activate(event);
      if (target) {
        event.preventDefault();
        jump(target.page, target.y, undefined, mode === "translated" ? "source" : mode);
      }
    },
    onHover: hovered.hover,
    onLeave: hovered.leave,
    painted,
  };
  return {
    root,
    primary,
    secondary,
    source,
    translated,
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
  };
}
