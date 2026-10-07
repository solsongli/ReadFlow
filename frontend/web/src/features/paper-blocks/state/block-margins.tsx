import type { MarginEntry } from "@/ui/wb/PageMargins.js";
import type { AssistancePorts } from "@/features/reader-assistance/domain.js";
import type { Block } from "../domain/model.js";
import { translatedParts } from "../domain/reading.js";
import { BlockCard } from "../ui/BlockCard.js";
export function blockMargins({
  blocks,
  page,
  selected,
  selectedPage,
  all,
  item,
  ports,
  translate,
  running,
  move,
  enlarge,
  close,
}: {
  blocks: Block[];
  page: number;
  selected?: string;
  selectedPage?: number;
  all: boolean;
  item: string;
  ports: AssistancePorts;
  translate: (id: string, force?: boolean) => void;
  running: boolean;
  move: (direction: number) => void;
  enlarge: (block: Block) => void;
  close: () => void;
}): MarginEntry[] {
  return blocks.flatMap((block) => {
    const isSelected = block.id === selected && (selectedPage === undefined || selectedPage === page);
    const anchor = block.anchors.find((value) => value.page === page);
    if (
      !anchor ||
      (!isSelected && (!all || !block.translation)) ||
      (!isSelected && ["figure", "table", "formula", "reference", "algorithm", "code"].includes(block.type))
    )
      return [];
    const part = translatedParts(block).filter((value) => value.anchor.page === page);
    const value =
      all && part.length
        ? {
            ...block,
            page,
            translation: part.map((p) => p.text).join("\n"),
            translation_runs: part.flatMap((p) => p.runs || []),
          }
        : block;
    return [
      {
        id: `block-${block.id}`,
        kind: "translation",
        x: anchor.view_bbox[0],
        right: anchor.view_bbox[2],
        y: anchor.view_bbox[1],
        bottom: anchor.view_bbox[3],
        selected: isSelected,
        compact: all && !isSelected,
        width: Math.max(220, anchor.bbox[2] - anchor.bbox[0]),
        height: isSelected ? 220 : ["title", "heading"].includes(block.type) ? 68 : 104,
        label: `块译文 · 第 ${page} 页`,
        activate: () => {},
        content: (width, scale) => (
          <BlockCard
            block={value}
            blocks={blocks}
            item={item}
            x={0}
            y={0}
            ports={ports}
            translate={translate}
            running={running}
            move={move}
            enlarge={() => enlarge(block)}
            close={close}
            margin={{ width, scale, selected: isSelected, compact: all && !isSelected }}
          />
        ),
      },
    ];
  });
}
