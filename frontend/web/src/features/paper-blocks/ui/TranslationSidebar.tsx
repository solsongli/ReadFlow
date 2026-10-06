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
import type { ReactNode } from "react";

export const TranslationSidebar = memo(function TranslationSidebar({
  blocks,
  page,
  open,
  hover,
  translate,
  sending,
  terms,
  summary,
}: {
  blocks: Block[];
  page: number;
  open: (block: Block, page: number) => void;
  hover: (id?: string) => void;
  translate: (id: string) => void;
  sending: boolean;
  terms?: ReactNode;
  summary?: ReactNode;
}) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    root.current?.parentElement?.scrollTo({ top: 0 });
  }, [page]);
  const [notice, setNotice] = useState("");
  const [review, setReview] = useState(false);
  const rows = review ? blocks.filter((b) => b.qa?.issues.length) : pageTranslations(blocks, page);
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
      {summary}
      {terms}
      <Button size="sm" aria-pressed={review} onClick={() => setReview(!review)}>
        需核对
      </Button>
      <header className="flex items-center justify-between text-sm text-wb-text-3">
        <span>
          {review ? "全文需核对" : `第 ${page} 页`} · {rows.length} 块
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
        const currentPage = review ? block.page : page;
        const parts = translatedParts(block).filter((p) => p.anchor.page === currentPage);
        const translated = parts.map((p) => p.text).join("\n");
        const copied = blockCopyText(block, blocks, currentPage);
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
              onClick={() => open(block, currentPage)}
              className="w-full border-0 bg-transparent p-0 text-left"
            >
              <span className="text-xs text-wb-text-3">
                {BLOCK_LABELS[block.type] || "正文"} · 第 {currentPage} 页
              </span>
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
              {block.qa?.issues.length ? (
                <span className="text-xs text-wb-text-3">
                  {block.qa.issues.includes("internal_markers")
                    ? "内部片段未能恢复，请核对原文"
                    : "需核对数字、引用或译法"}
                </span>
              ) : null}
            </div>
          </article>
        );
      })}
    </section>
  );
});
