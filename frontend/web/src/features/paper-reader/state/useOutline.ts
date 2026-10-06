import { useMemo } from "react";
import { heuristicOutline } from "../domain/analysis.js";
import { bilingualHeadings } from "../domain/outline.js";
import type { ReaderPorts, Mode } from "../domain/types.js";
import type { useDocument } from "./useDocument.js";
export function useOutline(main: ReturnType<typeof useDocument>, mode: Mode, ports: ReaderPorts) {
  return useMemo(() => {
    const heuristic = heuristicOutline(main.lines);
    if (mode === "translated") return main.outline.length ? main.outline : heuristic;
    return bilingualHeadings(
      main.outline,
      ports.blockHeadings?.length ? ports.blockHeadings : heuristic,
      ports.bilingualOutline !== false,
    );
  }, [main.outline, main.lines, mode, ports.blockHeadings, ports.bilingualOutline]);
}
