import { useEffect, useRef, useState } from "react";
import type { ReaderPorts, Reference } from "../domain/types.js";
export function useReferenceLookup(ports: ReaderPorts, preview: unknown, notice: (text: string) => void) {
  const epoch = useRef(0);
  const [matches, setMatches] = useState<Array<{ id: string; title: string }>>([]);
  useEffect(() => {
    epoch.current++;
    setMatches([]);
  }, [preview]);
  async function lookup(reference: Reference) {
    const version = ++epoch.current;
    try {
      const result = await ports.lookup(reference.title);
      if (version !== epoch.current) {
        return;
      }
      setMatches(result);
      if (!result.length) {
        notice("当前文献库没有匹配条目。");
      }
    } catch {
      notice("文献库查询失败，请重试。");
    }
  }
  return { matches, lookup };
}
