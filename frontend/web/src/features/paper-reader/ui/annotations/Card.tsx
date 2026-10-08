import { useFlashcards } from "@/features/flashcards/index.js";
import { MoreHorizontal } from "lucide-react";
import { IconButton } from "@/ui/wb/Button.js";
import { MenuRoot, MenuTrigger, MenuContent, MenuItem } from "@/ui/wb/Menu.js";
import { annotationMarkdown } from "../../domain/annotations/markdown.js";
import { useEffect, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import type { Annotation } from "../../domain/annotations/types.js";
import type { AnnotationController } from "../../state/annotations/useAnnotations.js";
import { AnnotationTags } from "./Tags.js";
import { annotationDragPayload } from "../../domain/annotations/citation.js";
export function AnnotationCard({
  row,
  controller: c,
  jump,
  links,
  addToCanvas,
  openCanvas,
}: {
  row: Annotation;
  controller: AnnotationController;
  jump: () => void;
  links?: Array<{ annotation_id: string; canvas_id: string; node_id: string; name: string }>;
  addToCanvas?: (id: string) => void;
  openCanvas?: (id: string, name: string, node: string) => void;
}) {
  const cards = useFlashcards();
  const [note, setNote] = useState(row.note);
  const [image, setImage] = useState(row.image ?? "");
  useEffect(() => setNote(row.note), [row.note]);
  useEffect(() => {
    if (!row.image_ref || row.image) {
      return;
    }
    let alive = true;
    void c.api
      .image(row)
      .then((value) => {
        if (alive) {
          setImage(value);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [row.image_ref]);
  const inkX = row.ink.map((point) => point.x * 1000);
  const inkY = row.ink.map((point) => point.y * 1000);
  const inkBounds = row.ink.length
    ? [
        Math.min(...inkX) - 10,
        Math.min(...inkY) - 10,
        Math.max(...inkX) - Math.min(...inkX) + 20,
        Math.max(...inkY) - Math.min(...inkY) + 20,
      ].join(" ")
    : "0 0 1000 1000";
  return (
    <article
      draggable
      onDragStart={(event) => {
        const payload = annotationDragPayload(row, c.citation(row));
        event.dataTransfer.setData("application/x-readflow-canvas", payload.canvas);
        event.dataTransfer.setData("text/plain", payload.plain);
        event.dataTransfer.setData("text/html", payload.html);
      }}
      data-annotation-card={row.id}
      data-annotation-color={row.color}
      onMouseEnter={() => c.setHover(row.id)}
      onMouseLeave={() => c.setHover(null)}
      className="pr-annotation-card rounded-lg border-l-4 bg-wb-panel-2 p-3 text-[0.75rem]"
    >
      <div className="flex items-center justify-between gap-2">
        <MenuRoot>
          <MenuTrigger asChild>
            <IconButton label="批注操作" title="批注操作" size="xs">
              <MoreHorizontal size={14} />
            </IconButton>
          </MenuTrigger>
          <MenuContent>
            <MenuItem
              onSelect={() => {
                jump();
                requestAnimationFrame(() => c.setEditingId(row.id));
              }}
            >
              编辑批注
            </MenuItem>
            {cards ? (
              <MenuItem
                onSelect={() =>
                  cards.create({
                    item_id: row.item_id,
                    annotation_id: row.id,
                    page: row.page_index + 1,
                    quote: row.quote,
                  })
                }
              >
                做成闪卡
              </MenuItem>
            ) : null}
            <MenuItem onSelect={() => void c.exportRows([row.id])}>导出这条批注</MenuItem>
            <MenuItem onSelect={() => void navigator.clipboard.writeText(c.citation(row))}>
              复制为引文
            </MenuItem>
            <MenuItem
              onSelect={() => {
                jump();
                requestAnimationFrame(() => c.setEditingId(row.id));
              }}
            >
              删除…
            </MenuItem>
            {addToCanvas ? <MenuItem onSelect={() => addToCanvas(row.id)}>加入画布…</MenuItem> : null}
          </MenuContent>
        </MenuRoot>
        <label>
          <input
            type="checkbox"
            aria-label={`选择第 ${row.page_index + 1} 页批注`}
            checked={c.selected.includes(row.id)}
            onChange={(event) =>
              c.setSelected(
                event.target.checked ? [...c.selected, row.id] : c.selected.filter((id) => id !== row.id),
              )
            }
          />{" "}
          选择
        </label>
        <button type="button" className="border-0 bg-transparent text-wb-text-3" onClick={jump}>
          第 {row.page_index + 1} 页 · {new Date(row.updated_at).toLocaleDateString()}
        </button>
      </div>
      <button type="button" className="mt-2 w-full border-0 bg-transparent text-left" onClick={jump}>
        {row.quote ? (
          <blockquote className="m-0 line-clamp-4 font-wb-serif leading-relaxed">{row.quote}</blockquote>
        ) : null}
        {image ? <img src={image} alt="区域截图" className="max-h-36 w-full object-contain" /> : null}
        {row.type === "ink" ? (
          <svg viewBox={inkBounds} className="pr-ink-preview h-20 w-full">
            <polyline
              points={row.ink.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth={row.width * 2}
            />
          </svg>
        ) : null}
        {!row.quote && !row.image_ref && row.type === "sticky" ? "便签" : null}
        {!row.rects.length && row.type !== "ink" ? (
          <span className="text-wb-text-3">旧批注 · 定位至本页</span>
        ) : null}
      </button>
      {links?.map((link) => (
        <button
          key={link.node_id}
          className="border-0 bg-transparent text-left text-[0.6875rem] text-wb-link"
          onClick={() => openCanvas?.(link.canvas_id, link.name, link.node_id)}
        >
          画布 · {link.name}
        </button>
      ))}
      <AnnotationTags row={row} controller={c} />
      <textarea
        aria-label="批注说明"
        placeholder="添加说明（支持 Markdown）"
        value={note}
        maxLength={100000}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
        className="mt-2 w-full resize-y rounded bg-transparent p-1 font-inherit text-wb-text"
      />
      {row.note && note === row.note ? (
        <div
          aria-label="批注说明预览"
          className="mt-1 text-[0.75rem]"
          dangerouslySetInnerHTML={{ __html: annotationMarkdown(row.note) }}
        />
      ) : null}
      {note !== row.note ? (
        <Button size="sm" disabled={c.busy} onClick={() => void c.update([row.id], { note })}>
          保存说明
        </Button>
      ) : null}
    </article>
  );
}
