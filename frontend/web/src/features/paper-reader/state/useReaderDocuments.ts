import { useMemo } from "react";
import type { ReaderPorts } from "../domain/types.js";
import { renderQueue } from "./document.js";
import { useDocument } from "./useDocument.js";

export function useReaderDocuments(
  ports: ReaderPorts,
  sourceRetry: number,
  translatedRetry: number,
) {
  const queue = useMemo(renderQueue, []);
  const source = useDocument(
    ports.source.url,
    ports.source.headers,
    sourceRetry,
    queue.acquireBackground,
  );
  const translated = useDocument(
    ports.translated?.url,
    ports.translated?.headers ?? {},
    translatedRetry,
    queue.acquireBackground,
  );
  const aligned = useDocument(
    ports.compareTranslated?.url,
    ports.compareTranslated?.headers ?? {},
    translatedRetry,
    queue.acquireBackground,
  );
  return {
    queue,
    source,
    translated,
    comparison: ports.compareTranslated ? aligned : translated,
  };
}
