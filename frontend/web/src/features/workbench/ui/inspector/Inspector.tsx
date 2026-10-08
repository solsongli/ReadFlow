import { activeTranslation, translationProgress } from "../../domain/translation.js";
import { Ellipsis, FolderPlus, Star, Trash2, Undo2 } from "lucide-react";
import { cn } from "@/ui/lib/utils.js";
import { Button, IconButton } from "@/ui/wb/Button.js";
import { WbEmptyState } from "@/ui/wb/EmptyState.js";
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from "@/ui/wb/Menu.js";
import { inspectorAuthors, inspectorStatus } from "../../domain/presentation.js";
import { useWb, useWorkbench } from "../context.js";
import { CitationBox } from "./CitationBox.js";
import { GroupPicker } from "./GroupPicker.js";
import { InlineEdit } from "./InlineEdit.js";
import { AbstractSection, GroupsSection, MetadataSection } from "./InspectorSections.js";
import { InspectorNotes } from "./InspectorNotes.js";
import { PdfTitleSuggestion } from "./PdfTitleSuggestion.js";
import { TagEditor } from "./TagEditor.js";

const PANEL = "wb-scroll w-[360px] min-w-0 shrink-0 border-l border-wb-line-soft bg-wb-panel";

function BulkPanel({ ids }: { ids: string[] }) {
  const wb = useWorkbench();
  const trashView = useWb((state) => state.view === "trash");
  const translating = useWb((state) => state.translatingIds ?? []);
  const rows = useWb((state) => state.list.result?.items ?? []);
  const chosen = rows.filter((row) => ids.includes(row.id));
  const commonTags = chosen.length ? chosen[0].tags.filter((tag) => chosen.every((row) => row.tags.includes(tag))) : [];
  return (
    <div className="flex flex-col gap-[1.125rem] p-[1.375rem]">
      <h2 className="m-0 text-[1.125rem] font-bold">已选 {ids.length} 篇文献</h2>
      <p className="m-0 text-[0.8125rem] leading-relaxed text-wb-text-3">一起整理这些文献，或将它们拖到侧栏分组。</p>
      {trashView ? <Button variant="primary" icon={<Undo2 size={15} aria-hidden="true" />} onClick={() => void wb.restore(ids)}>从回收站恢复</Button> : <>
        <Button disabled={ids.some((id) => translating.includes(id))} onClick={() => void wb.translations.start(ids)}>翻译所选</Button>
        <GroupPicker itemIds={ids}><Button variant="primary" icon={<FolderPlus size={15} aria-hidden="true" />} shortcut="G">加入分组…</Button></GroupPicker>
        <section aria-label="批量标签" className="flex flex-col gap-1.5">
          <h3 className="m-0 text-[0.8125rem] font-semibold">标签</h3>
          <p className="m-0 text-[0.75rem] text-wb-text-3">下方为所选文献共有的标签；也可按 1–9 切换彩色标签。</p>
          <TagEditor ids={ids} tags={commonTags} align="start" />
        </section>
        <div className="flex flex-col overflow-hidden rounded-xl bg-wb-panel-2">
          <button type="button" title="切换星标（S）" className="wb-info-row wb-transition relative px-3.5 py-2.5 text-left hover:bg-wb-hover" onClick={() => void wb.toggleStar(ids)}>切换星标</button>
          <button type="button" className="wb-info-row wb-transition relative px-3.5 py-2.5 text-left hover:bg-wb-hover" onClick={() => void wb.setReadStatus(ids, "read")}>标为已读</button>
          <button type="button" className="wb-info-row wb-transition relative px-3.5 py-2.5 text-left hover:bg-wb-hover" onClick={() => void wb.setReadStatus(ids, "unread")}>标为未读</button>
          <button type="button" title="移到回收站（Del）" className="wb-info-row wb-transition relative px-3.5 py-2.5 text-left text-wb-danger hover:bg-wb-danger-soft" onClick={() => void wb.trash(ids)}>移到回收站</button>
        </div>
      </>}
    </div>
  );
}

export function Inspector() {
  const wb = useWorkbench();
  const selectedIds = useWb((state) => state.selectedIds);
  const rows = useWb((state) => state.list.result?.items ?? []);
  const groups = useWb((state) => state.list.result?.groups ?? []);
  const detail = useWb((state) => state.detail);
  const trashView = useWb((state) => state.view === "trash");
  const translating = useWb((state) => state.translatingIds ?? []);
  if (selectedIds.length > 1) return <aside aria-label="详情" className={PANEL}><BulkPanel ids={selectedIds} /></aside>;
  const row = rows.find((entry) => entry.id === selectedIds[0]);
  if (!row) return <aside aria-label="详情" className={cn(PANEL, "flex items-center")}><WbEmptyState title="选择一篇文献" hint="题名、分组与文献信息会显示在这里。" className="flex-1" /></aside>;
  const item = detail.item?.id === row.id ? detail.item : null;
  return (
    <aside aria-label="详情" className={PANEL}>
      <div key={row.id} className="flex flex-col gap-[1.125rem] p-[1.375rem]">
        <div className="flex flex-col gap-2">
          <h2 className="m-0 break-words text-[1.125rem] font-bold leading-[1.28]">{row.title}</h2>
          <InlineEdit value={row.title_translated} placeholder="添加中文题名" label="中文题名" className="text-[0.875rem] leading-[1.45] text-wb-text-2" onSave={(title_translated) => void wb.updateState(row.id, { title_translated })} />
          <p className="m-0 wb-truncate text-[0.78125rem] text-wb-text-3" title={row.authors.join(", ")}>{inspectorAuthors(row.authors)}</p>
          <p className="m-0 text-[0.75rem] text-wb-text-3">{inspectorStatus(row)}</p>
          {["needs_ocr", "partial_needs_ocr"].includes(row.text_status) ? <p className="m-0 text-[0.75rem] text-wb-text-3">翻译前将使用本地 OCR 识别缺字页面。</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {trashView ? <Button variant="primary" icon={<Undo2 size={14} aria-hidden="true" />} onClick={() => void wb.restore([row.id])}>恢复</Button> : <>
            <Button variant="primary" shortcut="Enter" disabled={!row.attachment_id} onClick={() => void wb.openReader(row.id)}>阅读</Button>
            <Button disabled={!row.attachment_id || activeTranslation(row.translation) || translating.includes(row.id)} onClick={() => row.translation.status === "done" ? void wb.openReader(row.id) : void wb.translations.start([row.id])}>{translating.includes(row.id) ? "正在提交…" : row.translation.status === "done" ? "对照阅读" : "翻译全文"}</Button>
          </>}
          <span className="flex-1" />
          <IconButton label={row.starred ? "取消星标" : "加星标"} title={row.starred ? "取消星标（S）" : "加星标（S）"} active={row.starred} onClick={() => void wb.toggleStar([row.id])} className="h-8 w-8 rounded-full bg-wb-fill text-wb-text">
            <Star size={16} strokeWidth={1.7} aria-hidden="true" className={cn(row.starred && "fill-current text-wb-link")} />
          </IconButton>
          <MenuRoot>
            <MenuTrigger asChild><IconButton label="更多操作" className="h-8 w-8 rounded-full bg-wb-fill text-wb-text"><Ellipsis size={16} aria-hidden="true" /></IconButton></MenuTrigger>
            <MenuContent align="end">
              {row.translation.status === "failed" ? <MenuItem onSelect={() => void wb.translations.details(row.id)}>查看翻译失败原因</MenuItem> : null}
              <MenuItem disabled={!row.attachment_id || activeTranslation(row.translation)} onSelect={() => void wb.translations.start([row.id])}>重新翻译</MenuItem>
              {activeTranslation(row.translation) ? <MenuItem onSelect={() => void wb.translations.cancel(row.id)}>取消翻译</MenuItem> : null}
              <MenuItem onSelect={() => void wb.setReadStatus([row.id], row.read_status === "read" ? "unread" : "read")}>{row.read_status === "read" ? "标为未读" : "标为已读"}</MenuItem>
              <MenuItem onSelect={() => void wb.api.exportItem(row.id, "markdown", row.title).catch((error) => wb.failure(error, () => wb.api.exportItem(row.id, "markdown", row.title)))}>导出 Markdown</MenuItem>
              <MenuItem onSelect={() => void wb.api.exportItem(row.id, "bibtex", row.title).catch((error) => wb.failure(error, () => wb.api.exportItem(row.id, "bibtex", row.title)))}>导出 BibTeX</MenuItem>
              {!trashView ? <><MenuSeparator /><MenuItem danger icon={<Trash2 size={14} aria-hidden="true" />} shortcut="Del" onSelect={() => void wb.trash([row.id])}>移到回收站</MenuItem></> : null}
            </MenuContent>
          </MenuRoot>
        </div>
        {!trashView ? <GroupsSection row={row} groups={groups} /> : null}
        <MetadataSection row={row} />
        {!trashView ? <PdfTitleSuggestion item={item} venue={row.venue} /> : null}
        {!trashView ? <InspectorNotes row={row} item={item} /> : null}
        <CitationBox row={row} />
        {detail.status === "error" ? <p role="status" className="m-0 text-[0.75rem] text-wb-text-3">详情加载失败。<button type="button" className="text-wb-link" onClick={() => wb.select(row.id)}>重试</button></p> : null}
        <AbstractSection item={item} />
      </div>
    </aside>
  );
}
