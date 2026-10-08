import { memo, type MouseEvent } from "react";
import { Languages, Pencil, Star } from "lucide-react";
import type { TagColor, WorkbenchRow } from "@/platform/contracts/workbench.js";
import { cn } from "@/ui/lib/utils.js";
import { mailDate } from "../../domain/format.js";
import { rowMetadata, translationLabel } from "../../domain/presentation.js";
import { rowColoredTags, TAG_DOT } from "../../domain/tags.js";
import type { Density } from "../../domain/workbench-store.js";
import { writeDraggedIds } from "./drag.js";

export interface ItemRowProps {
  id?: string;
  position?: number;
  total?: number;
  row: WorkbenchRow;
  density: Density;
  selected: boolean;
  selection: string[];
  onSelect: (id: string, event: MouseEvent) => void;
  onOpen: (id: string) => void;
  /** Colored tags, drawn as dots beside the title (Zotero style). */
  colors?: TagColor[];
}

export const ItemRow = memo(function ItemRow({ id, position, total, row, density, selected, selection, onSelect, onOpen, colors = [] }: ItemRowProps) {
  const dots = rowColoredTags(row.tags, colors);
  const compact = density === "compact";
  const metadata = rowMetadata(row, compact);
  const translation = translationLabel(row.translation);
  return (
    <div
      role="option"
      id={id}
      aria-posinset={position}
      aria-setsize={total}
      aria-selected={selected}
      aria-label={row.title}
      draggable
      onDragStart={(event) => {
        writeDraggedIds(event.dataTransfer, selected && selection.length ? selection : [row.id]);
        event.dataTransfer.setData("application/x-readflow-canvas", JSON.stringify({ type: "paper", itemId: row.id }));
      }}
      onClick={(event) => onSelect(row.id, event)}
      onDoubleClick={() => onOpen(row.id)}
      className={cn(
        "wb-transition relative flex h-full cursor-default select-none gap-2.5 rounded-[10px] px-3 pl-2",
        // A hairline between rows (macOS list style); hidden where the row already has a fill.
        "after:pointer-events-none after:absolute after:-bottom-px after:left-7 after:right-3 after:h-px after:bg-wb-line-strong",
        compact ? "items-center py-2" : "py-2.5",
        selected ? "bg-wb-accent-soft after:hidden" : cn("hover:bg-wb-hover hover:after:hidden", position !== undefined && position % 2 === 0 && "bg-wb-zebra"),
      )}
    >
      <span className={cn("flex w-2 shrink-0 justify-center", !compact && "pt-1.5")}>
        <span aria-label={row.read_status === "unread" ? "未读" : undefined} className={cn("h-2 w-2 rounded-full", row.read_status === "unread" ? "bg-wb-accent" : "bg-transparent")} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex h-5 min-w-0 items-baseline gap-3 leading-5">
          <span className="wb-truncate min-w-0 flex-1 text-[0.84375rem] font-semibold tracking-[-0.01em]" title={row.title}>{row.title}</span>
          {dots.length ? (
            <span className="flex shrink-0 items-center gap-0.5 self-center" title={dots.map((dot) => dot.name).join("、")} aria-label={`标签：${dots.map((dot) => dot.name).join("、")}`}>
              {dots.map((dot) => <span key={dot.name} aria-hidden="true" className={cn("h-2 w-2 rounded-full", TAG_DOT[dot.color])} />)}
            </span>
          ) : null}
          {row.starred ? <Star size={12} aria-label="星标" className="shrink-0 self-center fill-current text-wb-warn" /> : null}
          <span className={cn("text-[0.75rem] text-wb-text-3", compact ? "wb-truncate max-w-[35%]" : "shrink-0")} title={compact ? row.authors.join(", ") : row.created_at}>
            {compact ? metadata : mailDate(row.created_at)}
          </span>
        </div>
        {!compact && row.title_translated ? <span className="wb-truncate text-[0.8125rem] leading-[1.1875rem] text-wb-text-2" title={row.title_translated}>{row.title_translated}</span> : null}
        {!compact ? (
          <div className="flex h-[1.125rem] min-w-0 items-center gap-2.5 text-[0.75rem] leading-[1.125rem] text-wb-text-3">
            {metadata ? <span className="wb-truncate flex-1" title={metadata}>{metadata}</span> : <span className="flex-1" aria-hidden="true" />}
            {translation ? <span className="inline-flex shrink-0 items-center gap-1" title={translationLabel(row.translation, true)}><Languages size={13} strokeWidth={1.7} aria-hidden="true" />{translation}</span> : null}
            {row.notes_count > 0 ? <span className="inline-flex shrink-0 items-center gap-1" title={`${row.notes_count} 条笔记`}><Pencil size={13} strokeWidth={1.7} aria-hidden="true" />{row.notes_count}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
});
