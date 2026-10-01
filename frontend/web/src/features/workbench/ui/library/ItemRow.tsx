import { memo, type MouseEvent } from "react";
import { Star } from "lucide-react";
import type { WorkbenchGroup, WorkbenchRow } from "@/platform/contracts/workbench.js";
import { cn } from "@/ui/lib/utils.js";
import { Chip } from "@/ui/wb/Chip.js";
import { formatDay, shortAuthors } from "../../domain/format.js";
import { chipGroups } from "../../domain/groups.js";
import type { Density } from "../../domain/workbench-store.js";
import { writeDraggedIds } from "./drag.js";

/** Column template shared by the header and every row. */
export const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_176px_44px_64px_72px_34px_48px] items-center gap-x-3";

function TranslationCell({ row }: { row: WorkbenchRow }) {
  const { status = "none", percent = null } = row.translation ?? {};
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 text-wb-accent" title="已有全文译文，打开阅读即可对照">
        <span aria-hidden="true" className="h-2 w-2 rounded-sm bg-wb-accent" />
        已译
      </span>
    );
  }
  if (status === "running" || status === "queued") {
    return (
      <span className="inline-flex items-center gap-1.5 text-wb-warn">
        <span aria-hidden="true" className="h-2 w-2 rounded-sm border-[1.5px] border-wb-warn" />
        {status === "queued" ? "排队" : percent != null ? <span className="wb-numeric text-[12px]">{percent}%</span> : "翻译中"}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-wb-danger" title="最近一次翻译失败">
        <span aria-hidden="true" className="h-2 w-2 rounded-sm border-[1.5px] border-wb-danger" />
        失败
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-wb-text-3" title={status === "unknown" ? "翻译服务暂不可用，状态未知" : "尚未翻译"}>
      <span aria-hidden="true" className="h-2 w-2 rounded-sm border-[1.5px] border-wb-line-strong" />
      {status === "unknown" ? "?" : "—"}
    </span>
  );
}

/** Second line: the Chinese title, or (until one exists) who/where/when — never a wall of "未翻译". */
function secondLine(row: WorkbenchRow): { text: string; translated: boolean } {
  if (row.title_translated) return { text: row.title_translated, translated: true };
  return { text: [shortAuthors(row.authors), row.venue_short, row.year].filter((part) => part && part !== "—").join(" · ") || "—", translated: false };
}

export interface ItemRowProps {
  row: WorkbenchRow;
  groups: WorkbenchGroup[];
  browsingGroup: string | null;
  density: Density;
  selected: boolean;
  selection: string[];
  onSelect: (id: string, event: MouseEvent) => void;
  onOpen: (id: string) => void;
  hideGroupChip?: string;
}

export const ItemRow = memo(function ItemRow({ row, groups, browsingGroup, density, selected, selection, onSelect, onOpen, hideGroupChip }: ItemRowProps) {
  const chips = chipGroups(groups, row.group_ids, hideGroupChip ?? browsingGroup);
  const shown = chips.slice(0, 2);
  const line = secondLine(row);
  return (
    <div
      role="row"
      aria-selected={selected}
      draggable
      onDragStart={(event) => writeDraggedIds(event.dataTransfer, selected && selection.length ? selection : [row.id])}
      onClick={(event) => onSelect(row.id, event)}
      onDoubleClick={() => onOpen(row.id)}
      className={cn(
        ROW_GRID,
        "cursor-default select-none border-b border-wb-line-soft px-3.5",
        density === "bilingual" ? "min-h-11 py-[5px]" : "h-[30px]",
        selected ? "bg-wb-accent-soft" : "hover:bg-wb-hover",
      )}
    >
      <div role="gridcell" className="flex min-w-0 flex-col gap-px">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-label={row.read_status === "unread" ? "未读" : undefined}
            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", row.read_status === "unread" ? "bg-wb-accent" : "bg-transparent")}
          />
          <span className="wb-truncate text-[13px] text-wb-text" title={row.title}>{row.title}</span>
          {row.starred ? <Star size={12} aria-label="星标" className="shrink-0 fill-current text-wb-warn" /> : null}
        </div>
        {density === "bilingual" ? (
          <span className={cn("wb-truncate pl-3.5 text-[12px]", line.translated ? "text-wb-text-2" : "text-wb-text-3")} title={line.translated ? line.text : undefined}>
            {line.text}
          </span>
        ) : null}
      </div>
      <div role="gridcell" className="flex min-w-0 items-center gap-1 overflow-hidden">
        {shown.length ? (
          shown.map((group) => (
            <Chip key={group.id} title={group.name} className="max-w-[112px]">{group.name}</Chip>
          ))
        ) : (
          <span className="text-wb-text-3">—</span>
        )}
        {chips.length > 2 ? <span className="wb-numeric shrink-0 text-[11.5px] text-wb-text-3">+{chips.length - 2}</span> : null}
      </div>
      <span role="gridcell" className="wb-numeric text-[12px] text-wb-text-2">{row.year || "—"}</span>
      <span role="gridcell" className="wb-truncate text-wb-text-2" title={row.venue || undefined}>{row.venue_short || "—"}</span>
      <span role="gridcell"><TranslationCell row={row} /></span>
      <span role="gridcell" className="wb-numeric text-[12px] text-wb-text-2">{row.notes_count || "—"}</span>
      <span role="gridcell" className="wb-numeric text-[12px] text-wb-text-3">{formatDay(row.created_at)}</span>
    </div>
  );
});
