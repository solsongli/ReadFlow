import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Bookmark, ChevronDown, ChevronRight, Clock, FileUp, Folder, Languages, Link2, NotebookPen, ScanText, SearchX, Star, Tag, Trash2 } from "lucide-react";
import { Button } from "@/ui/wb/Button.js";
import { WbEmptyState } from "@/ui/wb/EmptyState.js";
import { buildVirtualList, rowScrollTarget, virtualWindow } from "../../domain/virtual-list.js";
import { libraryEmptyState } from "../../domain/library-presentation.js";
import { openPdfPicker } from "../import/pdf-picker.js";
import { useWb, useWorkbench } from "../context.js";
import { ItemRow } from "./ItemRow.js";

const EMPTY_ICONS = { import: FileUp, trash: Trash2, unread: Bookmark, starred: Star, recent: Clock, group: Folder, notes: NotebookPen, ocr: ScanText, doi: Link2, translation: Languages, search: SearchX, tag: Tag };

export function ItemList() {
  const wb = useWorkbench();
  const result = useWb((state) => state.list.result);
  const status = useWb((state) => state.list.status);
  const selectedIds = useWb((state) => state.selectedIds);
  const focusId = useWb((state) => state.selectionFocusId);
  const density = useWb((state) => state.density);
  const layout = useWb((state) => state.layout);
  const groupId = useWb((state) => state.groupId);
  const view = useWb((state) => state.view);
  const query = useWb((state) => state.query);
  const tag = useWb((state) => state.tag);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [viewport, setViewport] = useState({ top: 0, height: 700 });
  const scroller = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const lastScroll = useRef("");
  const selection = useMemo(() => new Set(selectedIds), [selectedIds]);
  const list = useMemo(() => buildVirtualList(result?.items ?? [], result?.groups ?? [], layout, density, groupId, collapsed), [result, layout, density, groupId, collapsed]);
  const windowed = virtualWindow(list, viewport.top, viewport.height);
  const onSelect = useCallback((id: string, event: MouseEvent) => {
    wb.select(id, event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "single");
  }, [wb]);
  const onOpen = useCallback((id: string) => void wb.openReader(id), [wb]);
  const measure = useCallback(() => {
    const node = scroller.current;
    if (node) setViewport({ top: node.scrollTop, height: node.clientHeight });
  }, []);
  useEffect(() => { wb.setLibraryOrder(list.order); return () => wb.setLibraryOrder(null); }, [list, wb]);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    measure(); const observer = new ResizeObserver(measure); observer.observe(node);
    return () => { observer.disconnect(); cancelAnimationFrame(frame.current); };
  }, [Boolean(result?.items.length), measure]);
  const focus = focusId ?? selectedIds[selectedIds.length - 1];
  useEffect(() => {
    const node = scroller.current;
    if (!node || !focus) return;
    const key = JSON.stringify([focus, density, layout, groupId, view, query, viewport.height]);
    if (lastScroll.current === key) return;
    lastScroll.current = key;
    node.scrollTop = rowScrollTarget(list, focus, node.scrollTop, node.clientHeight); measure();
  }, [focus, list, density, layout, groupId, view, query, collapsed, viewport.height, measure]);
  if (status === "error" && !result) return <WbEmptyState title="文献库没有加载出来" hint="请检查本地服务后重试。" action={<Button onClick={() => void wb.refreshList()}>重试</Button>} />;
  if (result && !result.items.length) {
    const empty = libraryEmptyState({ view, query, group: groupId, tag });
    const Icon = EMPTY_ICONS[empty.icon];
    return <WbEmptyState icon={<Icon size={28} aria-hidden="true" />} title={empty.title} hint={empty.hint} action={empty.icon === "import" ? <Button onClick={openPdfPicker}>导入 PDF</Button> : undefined} />;
  }
  const active = windowed.indices.find((index) => { const entry = list.entries[index]; return entry.kind === "row" && entry.row.id === focus; });
  return <div ref={scroller} data-wb-list role="listbox" tabIndex={0} aria-label="文献列表" aria-multiselectable="true" aria-activedescendant={active == null ? undefined : `wb-row-${active}`} aria-busy={status === "loading"}
    title="J / K 或 ↑ / ↓ 移动；Enter 阅读；Ctrl / Shift 多选；S 星标；G 加入分组；Del 回收站" className="wb-scroll min-h-0 flex-1 px-2.5" onScroll={() => { cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(measure); }}>
    <div className="relative" style={{ height: list.height }}>
      {windowed.indices.map((index) => {
        const entry = list.entries[index];
        if (entry.kind === "header") return <button key={entry.key} type="button" aria-expanded={!entry.collapsed} title={entry.label} onClick={() => {
          if (!entry.collapsed && scroller.current) { scroller.current.scrollTop = entry.top; measure(); }
          setCollapsed((value) => entry.collapsed ? value.filter((id) => id !== entry.sectionId) : [...value, entry.sectionId]);
        }}
          className="wb-transition absolute left-0 z-10 flex h-8 w-full items-center gap-2 rounded-lg bg-wb-sticky px-3.5 text-left text-[12px] text-wb-text-3 backdrop-blur-md" style={{ top: windowed.sticky === index ? windowed.stickyTop : entry.top }}>
          {entry.collapsed ? <ChevronRight size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}<span className="wb-truncate font-semibold">{entry.label}</span><span className="shrink-0">{entry.count}</span>
        </button>;
        return <div key={entry.key} data-row={entry.row.id} className="absolute left-0 w-full" style={{ top: entry.top, height: entry.height }}>
          <ItemRow id={`wb-row-${index}`} position={entry.position} total={list.order.length} row={entry.row} density={density} selected={selection.has(entry.row.id)} selection={selectedIds} onSelect={onSelect} onOpen={onOpen} />
        </div>;
      })}
    </div>
  </div>;
}
