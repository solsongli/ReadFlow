import { useFlashcards } from "@/features/flashcards/index.js";
import { canvasMarkdown } from "../domain/markdown.js";
import { useEffect, useState, useMemo } from "react";
import { canvasApi } from "../state/api.js";
import type { CanvasNode, SourceTarget } from "../domain/types.js";
export function NodeCard({
  node,
  canvas,
  selected,
  edit,
  source,
}: {
  node: CanvasNode;
  canvas: string;
  selected: boolean;
  edit: (text: string) => void;
  source: (target: SourceTarget) => void;
}) {
  const cards = useFlashcards();
  const markdown = useMemo(
    () =>
      canvasMarkdown(
        node.text || (!node.quote && !node.image_ref && node.type !== "paper" ? "双击写下想法…" : ""),
      ),
    [node.text, node.quote, node.image_ref, node.type],
  );
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(node.text);
  const [image, setImage] = useState("");
  useEffect(() => setText(node.text), [node.text]);
  useEffect(() => {
    if (!node.image_ref) {
      return;
    }
    let gone = false,
      url = "";
    void canvasApi
      .image(canvas, node.id)
      .then((value) => {
        url = value;
        if (gone) {
          URL.revokeObjectURL(value);
        } else {
          setImage(value);
        }
      })
      .catch(() => {});
    return () => {
      gone = true;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [canvas, node.id, node.image_ref]);
  return (
    <article
      data-canvas-node={node.id}
      data-kind={node.type}
      data-selected={selected}
      data-annotation-color={node.color}
      className="tc-card group absolute flex flex-col rounded-xl p-3"
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
      onDoubleClick={() => setEditing(true)}
    >
      {node.type === "group" ? (
        <div className="text-[0.8125rem] font-semibold">{node.text || "分组"}</div>
      ) : null}
      {image ? (
        <img src={image} draggable={false} alt="摘录截图" className="min-h-0 flex-1 object-contain" />
      ) : null}
      {node.quote ? (
        <blockquote className="m-0 line-clamp-5 whitespace-pre-wrap font-wb-serif text-[0.8125rem] leading-relaxed">
          {node.quote}
        </blockquote>
      ) : null}
      {node.type === "paper" ? (
        <div className="min-h-0 overflow-hidden">
          <strong>{node.title}</strong>
          <p className="text-[0.75rem] text-wb-text-3">
            {node.authors?.join(", ")} · {node.year} · {node.venue}
          </p>
        </div>
      ) : null}
      {editing ? (
        <textarea
          autoFocus
          aria-label="编辑画布文字"
          value={text}
          maxLength={100000}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => {
            edit(text);
            setEditing(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setText(node.text);
              setEditing(false);
            }
          }}
          className="min-h-10 w-full flex-1 resize-none border-0 bg-transparent text-[0.8125rem]"
        />
      ) : node.type !== "group" ? (
        <div className="m-0 min-h-0 flex-1 overflow-hidden whitespace-pre-wrap text-[0.8125rem] leading-relaxed">
          <div className="tc-markdown" dangerouslySetInnerHTML={{ __html: markdown }} />
        </div>
      ) : null}
      {cards && node.item_id && node.type === "excerpt" ? (
        <button
          type="button"
          className="border-0 bg-transparent text-left text-wb-link"
          onClick={() =>
            cards.create({
              item_id: node.item_id!,
              annotation_id: node.annotation_id,
              page: node.page || 1,
              quote: node.quote || "",
              item_title: node.title,
            })
          }
        >
          做成闪卡
        </button>
      ) : null}
      {node.orphaned ? <span className="text-[0.6875rem] text-wb-text-3">原批注已删除</span> : null}
      {node.item_id ? (
        <button
          className="mt-2 truncate border-0 bg-transparent text-left text-[0.6875rem] text-wb-link"
          title={`${node.title || "来源文献"} · 第 ${node.page || 1} 页`}
          onClick={() =>
            source({
              itemId: node.item_id!,
              page: node.page || 1,
              annotationId: node.annotation_id ?? undefined,
            })
          }
        >
          {node.title || "来源文献"} · 第 {node.page || 1} 页 ↗
        </button>
      ) : null}
      <button
        data-connect
        title="拖动连线"
        aria-label="拖动连线"
        className="tc-port absolute -right-1.5 top-1/2 h-3 w-3 rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100"
      />
      <button
        data-resize
        title="调整卡片尺寸"
        aria-label="调整卡片尺寸"
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize border-0 bg-transparent opacity-0 group-hover:opacity-100"
      >
        ◢
      </button>
    </article>
  );
}
