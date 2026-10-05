import { useEffect, useRef, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import { useFlashcards } from "@/features/flashcards/index.js";
import type { AssistancePorts } from "@/features/reader-assistance/domain.js";
import { InlineRuns } from "./InlineRuns.js";
import { sourceRuns } from "../domain/model.js";
import type { Block } from "../domain/model.js";
import { BLOCK_LABELS as labels, adjacentBlock } from "../domain/reading.js";
export function BlockCard({
  block,
  blocks,
  item,
  x,
  y,
  ports,
  translate,
  close,
  running,
  move,
  enlarge,
}: {
  block: Block;
  blocks: Block[];
  item: string;
  x: number;
  y: number;
  ports: AssistancePorts;
  translate: (id: string, force?: boolean) => void;
  close: () => void;
  running: boolean;
  move?: (direction: number) => void;
  enlarge?: () => void;
}) {
  const cards = useFlashcards();
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.focus({ preventScroll: true });
    return () => {
      if (root.current?.contains(document.activeElement) && previous?.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);
  const [source, setSource] = useState(false),
    [error, setError] = useState("");
  const value = blocks.find((b) => b.id === block.caption_id) || block;
  const translated = value.translation;
  const readable =
    !["figure", "table", "formula", "reference", "author", "algorithm", "code"].includes(value.type) ||
    Boolean(block.figure_text?.some((label) => label.translatable));
  async function act(work: () => Promise<unknown>) {
    try {
      await work();
    } catch {
      setError("操作未完成，请重试。");
    }
  }
  return (
    <section
      ref={root}
      tabIndex={-1}
      role="dialog"
      aria-label="块译文"
      data-block-card={block.id}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
        if (
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !event.isDefaultPrevented() &&
          ["ArrowUp", "ArrowDown"].includes(event.key)
        ) {
          event.preventDefault();
          move?.(event.key === "ArrowUp" ? -1 : 1);
        }
      }}
      className="fixed z-50 w-[min(440px,92vw)] space-y-3 rounded-xl bg-wb-panel p-4 shadow-wb-pop"
      style={{
        left: Math.max(8, Math.min(x, innerWidth - 460)),
        top: Math.max(8, Math.min(y + 12, innerHeight - 390)),
        maxHeight: "70vh",
        overflow: "auto",
      }}
    >
      <header className="flex items-center justify-between text-sm text-wb-text-3">
        <span>
          块译文 · 第 {block.page} 页 · {labels[block.type] || "正文"}
        </span>
        <Button size="sm" onClick={close}>
          关闭
        </Button>
      </header>
      {move ? (
        <div className="flex gap-1">
          <Button
            size="sm"
            title="上一块（↑）"
            disabled={!adjacentBlock(blocks, block.id, -1)}
            onClick={() => move(-1)}
          >
            上一块
          </Button>
          <Button
            size="sm"
            title="下一块（↓）"
            disabled={!adjacentBlock(blocks, block.id, 1)}
            onClick={() => move(1)}
          >
            下一块
          </Button>
        </div>
      ) : null}
      <p className="whitespace-pre-wrap text-[1rem] leading-relaxed">
        {translated ? (
          <InlineRuns runs={value.translation_runs} text={translated} />
        ) : readable ? (
          "此块尚未翻译。"
        ) : (
          "此类内容按原样保留。图、表有图注时可翻译图注。"
        )}
      </p>
      {block.figure_text?.length ? (
        <section aria-label="图内文字" className="rounded-lg bg-wb-fill p-3 text-sm">
          <h3 className="mb-2 mt-0 text-sm font-medium">图内文字</h3>
          <dl className="m-0 space-y-2">
            {block.figure_text.map((label, index) => (
              <div key={label.id || index}>
                <dt className="text-wb-text-3">{label.text}</dt>
                <dd className="m-0">{label.translation || (label.translatable ? "尚未翻译" : "保留原文")}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {block.asset && ["figure", "table"].includes(block.type) && enlarge ? (
          <Button size="sm" onClick={enlarge}>
            放大
          </Button>
        ) : null}
        {readable ? (
          <Button size="sm" disabled={running} onClick={() => translate(block.id, Boolean(translated))}>
            {translated ? "重新翻译" : "翻译这一块"}
          </Button>
        ) : null}
        <Button
          size="sm"
          disabled={!translated}
          onClick={() => void act(() => navigator.clipboard.writeText(translated!))}
        >
          复制
        </Button>
        <Button
          size="sm"
          disabled={!translated}
          onClick={() =>
            void act(() => ports.note(`${translated}\n\n> ${value.text}\n\n第 ${block.page} 页`))
          }
        >
          加入笔记
        </Button>
        <Button
          size="sm"
          disabled={!translated}
          onClick={() => {
            ports.canvas(`${translated}\n\n> ${value.text}\n\n第 ${block.page} 页`);
            close();
          }}
        >
          加入画布
        </Button>
        {cards ? (
          <Button
            size="sm"
            onClick={() => {
              cards.create({
                item_id: item,
                page: block.page,
                quote: value.text,
                translation: translated,
              });
              close();
            }}
          >
            加入闪卡
          </Button>
        ) : null}
        <Button size="sm" onClick={() => setSource(!source)}>
          查看原文
        </Button>
      </div>
      {source ? (
        <blockquote className="m-0 whitespace-pre-wrap rounded-lg bg-wb-fill p-3 font-wb-serif">
          {value.text ? <InlineRuns runs={sourceRuns(value)} text={value.text} /> : "图形内容请查看原页面。"}
        </blockquote>
      ) : null}
      {error ? (
        <p role="status" className="text-sm text-wb-text-3">
          {error}
        </p>
      ) : null}
    </section>
  );
}
