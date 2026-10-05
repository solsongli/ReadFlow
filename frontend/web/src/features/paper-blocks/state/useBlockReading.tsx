import { useCallback, useRef, useState } from "react";
import type { Block, BlockStatus } from "../domain/model.js";
import { adjacentBlock } from "../domain/reading.js";
import { BlockLayer } from "../ui/BlockLayer.js";
import { InlineLayer } from "../ui/InlineLayer.js";
import { TranslationSidebar } from "../ui/TranslationSidebar.js";
import { FigureViewer } from "../ui/FigureViewer.js";
import type { ReactNode } from "react";
export function useBlockReading(
  status: BlockStatus | null,
  active: boolean,
  enabled: boolean,
  imageText: boolean,
  url: (suffix: string) => string,
  setEnabled: () => void,
  start: (id: string) => void,
  sending: boolean,
  terms?: ReactNode,
) {
  const blocks = status?.document?.blocks || [];
  const [selected, setSelected] = useState<{ id: string; x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState<string>(),
    [figure, setFigure] = useState<string>();
  const [originals, setOriginals] = useState<Set<string>>(new Set());
  const navigation = useRef<(page: number, offset: number) => void>(() => {});
  const registerNavigation = useCallback((work: (page: number, offset: number) => void) => {
    navigation.current = work;
    return () => {
      navigation.current = () => {};
    };
  }, []);
  const open = useCallback((block: Block, x: number, y: number) => setSelected({ id: block.id, x, y }), []);
  const locate = (block: Block, page = block.page) => {
    setHovered(undefined);
    if (!enabled) setEnabled();
    const anchor = block.anchors.find((a) => a.page === page) || block.anchors[0];
    navigation.current(anchor.page, Math.max(0, anchor.view_bbox[1] - 0.05));
    setSelected({ id: block.id, x: Math.max(100, innerWidth / 2 - 180), y: 100 });
  };
  const move = (direction: number) => {
    if (!selected) return;
    const next = adjacentBlock(blocks, selected.id, direction);
    if (next) locate(next);
  };
  const asset = blocks.find((b) => b.id === figure);
  return {
    selected,
    setSelected,
    open,
    move,
    figure:
      active && asset?.asset ? (
        <FigureViewer
          block={asset}
          caption={blocks.find((b) => b.id === asset.caption_id)}
          geometry={status?.document?.pages?.find((p) => p.page === asset.page)}
          url={url(`/files/${encodeURIComponent(asset.asset)}`)}
          imageText={imageText}
          close={() => setFigure(undefined)}
        />
      ) : null,
    enlarge: (block: Block) => {
      setSelected(null);
      setFigure(block.id);
    },
    registerNavigation,
    sidebar: (page: number) => (
      <TranslationSidebar
        blocks={blocks}
        page={page}
        open={locate}
        hover={setHovered}
        translate={start}
        sending={sending}
        terms={terms}
        qa={status?.qa}
      />
    ),
    overlay: (page: number, interactive: boolean, inline = false, peek = false) => (
      <>
        {inline ? (
          <InlineLayer
            blocks={blocks}
            page={page}
            geometry={status?.document?.pages?.find((p) => p.page === page)}
            hidden={peek || !interactive}
            originals={originals}
            imageText={imageText}
          />
        ) : null}
        <BlockLayer
          blocks={blocks}
          page={page}
          active={active && (enabled || inline) && interactive}
          highlighted={hovered || selected?.id}
          geometry={status?.document?.pages?.find((p) => p.page === page)}
          labelHints={inline && imageText}
          expand={inline ? open : undefined}
          open={(block, x, y) => {
            if (["figure", "table"].includes(block.type) && block.asset) {
              setSelected(null);
              setFigure(block.id);
            } else if (inline && block.translation)
              setOriginals((old) => {
                const next = new Set(old);
                if (next.has(block.id)) next.delete(block.id);
                else next.add(block.id);
                return next;
              });
            else open(block, x, y);
          }}
        />
      </>
    ),
  };
}
