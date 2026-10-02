import { memo, type MouseEvent } from "react";
import { Languages, Pencil, Star } from "lucide-react";
import type { WorkbenchRow } from "@/platform/contracts/workbench.js";
import { cn } from "@/ui/lib/utils.js";
import { mailDate } from "../../domain/format.js";
import { rowMetadata, translationLabel } from "../../domain/presentation.js";
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
}

export const ItemRow = memo(function ItemRow({ id, position, total, row, density, selected, selection, onSelect, onOpen }: ItemRowProps) {
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
      onDragStart={(event) => writeDraggedIds(event.dataTransfer, selected && selection.length ? selection : [row.id])}
      onClick={(event) => onSelect(row.id, event)}
      onDoubleClick={() => onOpen(row.id)}
      className={cn("wb-transition flex h-full cursor-default select-none gap-2.5 rounded-[10px] px-3 pl-2", compact ? "items-center py-2" : "py-2.5", selected ? "bg-wb-accent-soft" : "hover:bg-wb-hover")}
    >
      <span className={cn("flex w-2 shrink-0 justify-center", !compact && "pt-1.5")}>
        <span aria-label={row.read_status === "unread" ? "未读" : undefined} className={cn("h-2 w-2 rounded-full", row.read_status === "unread" ? "bg-wb-accent" : "bg-transparent")} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex h-5 min-w-0 items-baseline gap-3 leading-5">
          <span className="wb-truncate min-w-0 flex-1 text-[13.5px] font-semibold tracking-[-0.01em]" title={row.title}>{row.title}</span>
          {row.starred ? <Star size={12} aria-label="星标" className="shrink-0 self-center fill-current text-wb-warn" /> : null}
          <span className={cn("text-[12px] text-wb-text-3", compact ? "wb-truncate max-w-[35%]" : "shrink-0")} title={compact ? row.authors.join(", ") : row.created_at}>
            {compact ? metadata : mailDate(row.created_at)}
          </span>
        </div>
        {!compact && row.title_translated ? <span className="wb-truncate text-[13px] leading-[19px] text-wb-text-2" title={row.title_translated}>{row.title_translated}</span> : null}
        {!compact ? (
          <div className="flex h-[18px] min-w-0 items-center gap-2.5 text-[12px] leading-[18px] text-wb-text-3">
            {metadata ? <span className="wb-truncate flex-1" title={metadata}>{metadata}</span> : <span className="flex-1" aria-hidden="true" />}
            {translation ? <span className="inline-flex shrink-0 items-center gap-1" title={translationLabel(row.translation, true)}><Languages size={13} strokeWidth={1.7} aria-hidden="true" />{translation}</span> : null}
            {row.notes_count > 0 ? <span className="inline-flex shrink-0 items-center gap-1" title={`${row.notes_count} 条笔记`}><Pencil size={13} strokeWidth={1.7} aria-hidden="true" />{row.notes_count}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
});
