import { memo, useEffect, useRef, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import type { Block } from "../domain/model.js";
import {
  blockCopyText,
  BLOCK_LABELS,
  copyPage,
  inlineTypes,
  pageTranslations,
  translatedParts,
} from "../domain/reading.js";
import { InlineRuns } from "./InlineRuns.js";
export const TranslationSidebar = memo(function TranslationSidebar({
  blocks,
  page,
  open,
  hover,
  translate,
  sending,
}: {
  blocks: Block[];
  page: number;
  open: (block: Block, page: number) => void;
  hover: (id?: string) => void;
  translate: (id: string) => void;
  sending: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    root.current?.parentElement?.scrollTo({ top: 0 });
  }, [page]);
  const [notice, setNotice] = useState("");
  const rows = pageTranslations(blocks, page);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("已复制");
    } catch {
      setNotice("复制失败，请重试。");
    }
  };
  return (
    <section ref={root} aria-label="本页译文" className="space-y-3 p-3">
      <header className="flex items-center justify-between text-sm text-wb-text-3">
        <span>
          第 {page} 页 · {rows.length} 块
        </span>
        <Button
          size="sm"
          disabled={!copyPage(blocks, page)}
          onClick={() => void copy(copyPage(blocks, page))}
        >
          复制本页译文
        </Button>
      </header>
      {notice ? (
        <p role="status" className="text-xs text-wb-text-3">
          {notice}
        </p>
      ) : null}
      {!rows.length ? (
        <p className="text-sm text-wb-text-3">本页暂无可显示的块，打开块模式后会在本机分析。</p>
      ) : null}
      {rows.map((block) => {
        const parts = translatedParts(block).filter((p) => p.anchor.page === page);
        const translated = parts.map((p) => p.text).join("\n");
        const copied = blockCopyText(block, blocks, page);
        return (
          <article
            key={block.id}
            data-sidebar-block={block.id}
            className="rounded-xl bg-wb-fill p-3"
            onMouseEnter={() => hover(block.id)}
            onMouseLeave={() => hover(undefined)}
          >
            <button
              type="button"
              onClick={() => open(block, page)}
              className="w-full border-0 bg-transparent p-0 text-left"
            >
              <span className="text-xs text-wb-text-3">{BLOCK_LABELS[block.type] || "正文"}</span>
              <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-wb-text">
                {translated
                  ? parts.map((p, i) => (
                      <span key={i}>
                        <InlineRuns text={p.text} runs={p.runs} />
                      </span>
                    ))
                  : inlineTypes.includes(block.type)
                    ? "尚未翻译"
                    : "按原样保留，单击查看"}
              </div>
            </button>
            <div className="mt-2 flex gap-1">
              <Button
                size="sm"
                disabled={!copied}
                title={translated ? "复制译文" : "复制原文或图注"}
                onClick={() => void copy(copied)}
              >
                复制
              </Button>
              {!translated && inlineTypes.includes(block.type) ? (
                <Button size="sm" disabled={sending} onClick={() => translate(block.id)}>
                  翻译这一块
                </Button>
              ) : null}
            </div>
          </article>
        );
      })}
    </section>
  );
});
