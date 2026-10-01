import { BookOpen, Ellipsis, FolderPlus, Star, Trash2, Undo2 } from "lucide-react";
import type { WorkbenchRow } from "@/platform/contracts/workbench.js";
import { cn } from "@/ui/lib/utils.js";
import { Button, IconButton } from "@/ui/wb/Button.js";
import { WbEmptyState } from "@/ui/wb/EmptyState.js";
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from "@/ui/wb/Menu.js";
import { arxivId } from "../../domain/citation.js";
import { useWb, useWorkbench } from "../context.js";
import { CitationBox } from "./CitationBox.js";
import { GroupPicker } from "./GroupPicker.js";
import { InlineEdit } from "./InlineEdit.js";
import { AbstractSection, GroupsSection, MetadataSection, StatusSection } from "./InspectorSections.js";

function identifier(row: WorkbenchRow): string {
  const arxiv = arxivId(row);
  if (arxiv) return "arXiv:" + arxiv;
  return row.doi ? "doi:" + row.doi : row.citekey;
}

function BulkPanel({ ids }: { ids: string[] }) {
  const wb = useWorkbench();
  const trashView = useWb((state) => state.view === "trash");
  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="m-0 text-[13px] font-semibold">已选 {ids.length} 篇文献</p>
      <p className="m-0 text-[12px] leading-relaxed text-wb-text-3">
        可以一次把它们加入一个或多个分组；已在其他分组中的不受影响。也可以把它们拖到左侧分组上。
      </p>
      <div className="flex flex-wrap gap-1.5">
        {trashView ? (
          <Button icon={<Undo2 size={13} aria-hidden="true" />} onClick={() => void wb.restore(ids)}>恢复</Button>
        ) : (
          <>
            <GroupPicker itemIds={ids}>
              <Button variant="primary" icon={<FolderPlus size={13} aria-hidden="true" />} shortcut="G">加入分组</Button>
            </GroupPicker>
            <Button icon={<Star size={13} aria-hidden="true" />} onClick={() => void wb.toggleStar(ids)}>星标</Button>
            <Button onClick={() => void wb.setReadStatus(ids, "read")}>标为已读</Button>
            <Button variant="danger" icon={<Trash2 size={13} aria-hidden="true" />} onClick={() => void wb.trash(ids)}>移到回收站</Button>
          </>
        )}
      </div>
    </div>
  );
}

export function Inspector() {
  const wb = useWorkbench();
  const selectedIds = useWb((state) => state.selectedIds);
  const rows = useWb((state) => state.list.result?.items ?? []);
  const groups = useWb((state) => state.list.result?.groups ?? []);
  const detail = useWb((state) => state.detail.item);
  const trashView = useWb((state) => state.view === "trash");

  if (selectedIds.length > 1) {
    return (
      <aside aria-label="详情" className="border-l border-wb-line bg-wb-panel">
        <BulkPanel ids={selectedIds} />
      </aside>
    );
  }
  const row = rows.find((entry) => entry.id === selectedIds[0]);
  if (!row) {
    return (
      <aside aria-label="详情" className="flex border-l border-wb-line bg-wb-panel">
        <WbEmptyState title="选择一篇文献查看详情" hint="J / K 上下移动，Enter 打开阅读，G 加入分组。" className="flex-1" />
      </aside>
    );
  }
  const item = detail?.id === row.id ? detail : null;

  return (
    <aside aria-label="详情" className="wb-scroll border-l border-wb-line bg-wb-panel">
      <div className="flex flex-col gap-1.5 px-4 pb-3 pt-3.5">
        <span className="font-wb-mono text-[11.5px] text-wb-text-3">{identifier(row)}</span>
        <h2 className="m-0 text-[14.5px] font-semibold leading-snug">{row.title}</h2>
        <InlineEdit
          value={row.title_translated}
          placeholder="添加中文题名"
          label="中文题名"
          className="text-[13px] leading-normal text-wb-text-2"
          onSave={(title_translated) => void wb.updateState(row.id, { title_translated })}
        />
        <p className="m-0 line-clamp-3 text-[12px] leading-normal text-wb-text-2">{row.authors.join(", ")}</p>
        <div className="mt-1.5 flex items-center gap-1.5">
          {trashView ? (
            <Button variant="primary" icon={<Undo2 size={13} aria-hidden="true" />} onClick={() => void wb.restore([row.id])}>从回收站恢复</Button>
          ) : (
            <Button variant="primary" icon={<BookOpen size={13} aria-hidden="true" />} shortcut="Enter" disabled={!row.attachment_id} onClick={() => void wb.openReader(row.id)}>
              打开阅读
            </Button>
          )}
          <IconButton label={row.starred ? "取消星标" : "加星标"} active={row.starred} onClick={() => void wb.toggleStar([row.id])}>
            <Star size={15} aria-hidden="true" className={cn(row.starred && "fill-current")} />
          </IconButton>
          <MenuRoot>
            <MenuTrigger asChild>
              <IconButton label="更多操作">
                <Ellipsis size={15} aria-hidden="true" />
              </IconButton>
            </MenuTrigger>
            <MenuContent align="end">
              {row.read_status === "read" ? (
                <MenuItem onSelect={() => void wb.setReadStatus([row.id], "unread")}>标为未读</MenuItem>
              ) : (
                <MenuItem onSelect={() => void wb.setReadStatus([row.id], "read")}>标为已读</MenuItem>
              )}
              <MenuItem onSelect={() => void wb.api.exportItem(row.id, "markdown", row.title)}>导出笔记（Markdown）</MenuItem>
              <MenuItem onSelect={() => void wb.api.exportItem(row.id, "bibtex", row.title)}>导出 BibTeX 文件</MenuItem>
              <MenuSeparator />
              {trashView ? null : (
                <MenuItem danger icon={<Trash2 size={13} aria-hidden="true" />} shortcut="Del" onSelect={() => void wb.trash([row.id])}>移到回收站</MenuItem>
              )}
            </MenuContent>
          </MenuRoot>
        </div>
      </div>
      <GroupsSection row={row} groups={groups} />
      <MetadataSection row={row} />
      <StatusSection row={row} />
      <CitationBox row={row} />
      <AbstractSection item={item} />
    </aside>
  );
}
