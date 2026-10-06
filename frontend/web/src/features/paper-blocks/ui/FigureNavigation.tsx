import { FigureThumbnail } from "./FigureThumbnail.js";
import { useEffect, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import type { Block } from "../domain/model.js";
export function FigureNavigation({
  prepare,
  blocks,
  url,
  jump,
  enlarge,
}: {
  prepare?: () => void;
  blocks: Block[];
  url: (path: string) => string;
  jump: (page: number, y: number) => void;
  enlarge: (block: Block) => void;
}) {
  useEffect(() => {
    prepare?.();
  }, []);
  const [filter, setFilter] = useState("all");
  const figures = blocks.filter(
    (b) => ["figure", "table"].includes(b.type) && (filter === "all" || b.type === filter),
  );
  return (
    <section aria-label="图表导航">
      <div role="group" aria-label="图表筛选" className="mb-3 flex rounded-lg bg-wb-fill p-1">
        {[
          ["all", "全部"],
          ["figure", "图"],
          ["table", "表"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={`flex-1 rounded-md border-0 py-1 text-xs ${filter === id ? "bg-wb-panel shadow-sm" : "bg-transparent"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {!figures.length ? (
        <p className="text-xs text-wb-text-3">{prepare ? "正在本机识别图表…" : "未识别到图表。"}</p>
      ) : null}
      {figures.map((block, index) => {
        const caption = blocks.find((b) => b.id === block.caption_id);
        const number = caption?.text.match(/^(?:Figure|Fig\.?|Table|图|表)\s*([\w.-]+)/i)?.[0];
        return (
          <article key={block.id} data-figure-entry={block.id} className="mb-3 rounded-xl bg-wb-fill p-2">
            <button
              className="block w-full bg-transparent text-left"
              title={caption?.translation || caption?.text}
              onClick={() => jump(block.page, block.anchors[0]?.view_bbox[1] || 0)}
              onDoubleClick={() => enlarge(block)}
            >
              {block.asset ? (
                <FigureThumbnail
                  label={number || `图表 ${index + 1}`}
                  url={url(`/files/${block.asset.replace(/\.pdf$/, ".png")}`)}
                />
              ) : null}
              <span className="block text-xs font-semibold">
                {number || (block.type === "table" ? "表" : "图")} · 第 {block.page} 页
              </span>
              <span className="mt-1 line-clamp-3 text-xs leading-relaxed text-wb-text-2">
                {caption?.translation || caption?.text || "无题注"}
              </span>
            </button>
            <Button size="sm" disabled={!block.asset} onClick={() => enlarge(block)}>
              放大
            </Button>
          </article>
        );
      })}
    </section>
  );
}
