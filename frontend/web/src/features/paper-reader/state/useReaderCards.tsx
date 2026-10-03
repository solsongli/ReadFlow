import { useEffect, useRef } from "react";
import { useFlashcards } from "@/features/flashcards/index.js";
import { Button } from "@/ui/wb/Button.js";
import type { ReaderPorts } from "../domain/types.js";
import type { useAnnotationReader } from "./annotations/useAnnotationReader.js";
export function useReaderCards(
  ports: ReaderPorts,
  annotations: ReturnType<typeof useAnnotationReader>,
  translation?: (quote: string, page: number) => string | undefined,
) {
  const cards = useFlashcards();
  const previous = useRef(new Set<string>());
  useEffect(() => {
    const ids = new Set(annotations.c.rows.map((row) => row.id));
    if ([...previous.current].some((id) => !ids.has(id))) void cards?.reload();
    previous.current = ids;
  }, [annotations.c.rows]);
  function create() {
    const anchors = annotations.readSelection();
    if (!cards || !anchors.length) return false;
    const linked = annotations.c.rows.find(
      (row) => row.page_index === anchors[0].page && row.quote === anchors.map((a) => a.quote).join("\n"),
    );
    cards.create({
      annotation_id: linked?.id,
      item_id: ports.metadata.id,
      item_title: ports.metadata.title,
      page: anchors[0].page + 1,
      quote: anchors.map((a) => a.quote).join("\n"),
      translation: translation?.(anchors.map((a) => a.quote).join("\n"), anchors[0].page + 1),
      link: async () => {
        const ids = await annotations.c.createLinked(
          anchors.map((anchor) => ({
            type: "highlight",
            color: annotations.c.color,
            quote: anchor.quote,
            page_index: anchor.page,
            rects: anchor.rects,
          })),
        );
        if (!ids.length) throw new Error("高亮未能保存，请重试。");
        return ids[0];
      },
    });
    return true;
  }
  return {
    tool: cards ? (
      <Button size="sm" title="做成闪卡（C）" onClick={create}>
        做成闪卡
      </Button>
    ) : null,
    key: (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "c" || event.ctrlKey || event.metaKey || event.altKey) return false;
      if (!create()) return false;
      event.preventDefault();
      return true;
    },
  };
}
