import { useMemo } from "react";
import { locateTerms } from "../domain/terms.js";
import type { BlockStatus } from "../domain/model.js";
import { TermLayer } from "../ui/TermLayer.js";
import { FigureNavigation } from "../ui/FigureNavigation.js";
import { useUserTerms } from "./useUserTerms.js";
import type { useBlockReading } from "./useBlockReading.js";
export function useReadingAids(
  status: BlockStatus | null,
  active: boolean,
  hover: boolean,
  url: (path: string) => string,
  reading: ReturnType<typeof useBlockReading>,
  prepare: () => void,
) {
  const userTerms = useUserTerms(active);
  const blocks = status?.document?.blocks || [];
  const signature = JSON.stringify([blocks, status?.terms?.entries, userTerms]);
  const terms = useMemo(() => locateTerms(blocks, status?.terms?.entries || [], userTerms), [signature]);
  const regions = useMemo(() => {
    const result = new Map<number, number[][]>();
    for (const b of blocks) {
      if (!["title", "abstract", "heading", "text", "list", "caption", "footnote"].includes(b.type)) continue;
      for (const anchor of b.anchors) {
        const values = result.get(anchor.page) || [];
        values.push(anchor.view_bbox);
        result.set(anchor.page, values);
      }
    }
    return result;
  }, [signature]);
  const headings = useMemo(
    () =>
      blocks
        .filter((b) => b.type === "heading" || b.type === "title")
        .map((b) => ({
          id: b.id,
          title: b.text,
          translation: b.translation,
          page: b.page,
          y:
            (b.anchors[0]?.view_bbox[1] || 0) *
            (status?.document?.pages?.find((p) => p.page === b.page)?.height || 842),
          level: Math.max(1, b.text.match(/^\d+(?:\.\d+)*/)?.[0].split(".").length || 1),
        })),
    [signature],
  );
  return {
    terms,
    headings,
    figures: (
      <FigureNavigation
        prepare={!status?.document ? prepare : undefined}
        blocks={blocks}
        url={url}
        jump={reading.jump}
        enlarge={reading.enlarge}
      />
    ),
    termLayer: (page: number, interactive: boolean, inline = false, peek = false) => (
      <TermLayer
        terms={terms}
        regions={regions.get(page)}
        enabled={active && hover && interactive}
        inline={inline && !peek}
        jump={reading.jump}
      />
    ),
  };
}
