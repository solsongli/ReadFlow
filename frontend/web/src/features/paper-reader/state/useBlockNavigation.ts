import { useEffect, useRef } from "react";
import type { Mode, Position, ReaderPorts } from "../domain/types.js";
export function useBlockNavigation(
  ports: ReaderPorts,
  mode: Mode,
  setMode: (mode: Mode) => void,
  navigate: (position: Position) => void,
) {
  const latest = useRef({ mode, navigate });
  latest.current = { mode, navigate };
  useEffect(
    () =>
      ports.registerBlockNavigation?.((page, offset) => {
        const current = latest.current;
        current.navigate({ page, offset, mode: current.mode === "translated" ? "source" : current.mode });
      }),
    [ports.registerBlockNavigation],
  );
  useEffect(() => {
    if (mode === "inline" && !ports.inlineAvailable) setMode("source");
  }, [mode, ports.inlineAvailable]);
}
