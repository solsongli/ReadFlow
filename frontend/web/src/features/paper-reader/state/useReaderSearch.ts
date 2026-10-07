import { useEffect, useMemo, useRef, useState } from "react";
import { searchLines } from "../domain/analysis.js";
import type { SearchOptions, TextLine } from "../domain/types.js";

const DEFAULT_OPTIONS: SearchOptions = { caseSensitive: false, wholeWord: false };

export function useReaderSearch(
  sourceLines: TextLine[],
  translatedLines: TextLine[],
  mode: "source" | "compare" | "translated" | "inline",
  currentPage: number,
  jump: (page: number, y: number) => void,
  openPanel: () => void,
) {
  const [query, setQueryState] = useState("");
  const [options, setOptionsState] = useState(DEFAULT_OPTIONS);
  const [resultIndex, setResult] = useState(-1);
  const [compareScope, setCompareScopeState] = useState<"source" | "translated">("source");
  const [anchorPage, setAnchorPage] = useState(currentPage);
  const scope = mode === "translated" ? "translated" : mode === "compare" ? compareScope : "source";
  const lines = scope === "translated" ? translatedLines : sourceLines;
  const rawHits = useMemo(() => searchLines(lines, query, options), [lines, query, options]);
  const hits = useMemo(() => {
    const pivot = rawHits.findIndex((hit) => hit.page >= anchorPage);
    return pivot > 0 ? [...rawHits.slice(pivot), ...rawHits.slice(0, pivot)] : rawHits;
  }, [rawHits, anchorPage]);
  const applied = useRef("");
  const selectionKey = `${scope}\u0000${query}\u0000${options.caseSensitive}\u0000${options.wholeWord}\u0000${anchorPage}`;
  useEffect(() => {
    if (!query.trim()) {
      applied.current = selectionKey;
      setResult(-1);
      return;
    }
    if (!hits.length) {
      applied.current = "";
      setResult(-1);
      return;
    }
    if (applied.current === selectionKey) return;
    applied.current = selectionKey;
    setResult(0);
    jump(hits[0].page, hits[0].y);
  }, [selectionKey, hits, currentPage]);
  const selectResult = (index: number) => {
    if (!hits.length) return;
    const next = (index + hits.length) % hits.length;
    setResult(next);
    jump(hits[next].page, hits[next].y);
  };
  return {
    query,
    setQuery: (value: string) => {
      setAnchorPage(currentPage);
      setQueryState(value);
    },
    options,
    setOptions: (changes: Partial<SearchOptions>) => {
      setAnchorPage(currentPage);
      setOptionsState((value) => ({ ...value, ...changes }));
    },
    hits,
    scope,
    compareScope,
    setCompareScope: (value: "source" | "translated") => {
      setAnchorPage(currentPage);
      setCompareScopeState(value);
    },
    resultIndex,
    current: resultIndex >= 0 ? hits[resultIndex] : undefined,
    currentOccurrence:
      resultIndex >= 0
        ? hits.slice(0, resultIndex).filter((hit) => hit.page === hits[resultIndex].page).length
        : -1,
    selectResult,
    next: (direction: number) => selectResult(resultIndex + direction),
    open: openPanel,
  };
}
