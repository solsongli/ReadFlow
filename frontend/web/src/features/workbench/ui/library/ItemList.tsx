import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ChevronDown, ChevronRight, FileUp, SearchX } from "lucide-react";
import type { WorkbenchGroup, WorkbenchRow } from "@/platform/contracts/workbench.js";
import { cn } from "@/ui/lib/utils.js";
import { Button } from "@/ui/wb/Button.js";
import { WbEmptyState } from "@/ui/wb/EmptyState.js";
import { buildGroupTree, descendantIds, flattenGroupTree, groupLabel } from "../../domain/groups.js";
import { openPdfPicker } from "../import/pdf-picker.js";
import { useWb, useWorkbench } from "../context.js";
import { ItemRow, ROW_GRID } from "./ItemRow.js";

const SORTABLE: Array<[string, "title" | "year" | "venue" | "added" | null]> = [
  ["标题 / 中文题名", "title"],
  ["分组", null],
  ["年份", "year"],
  ["来源", "venue"],
  ["译文", null],
  ["笔记", null],
  ["添加", "added"],
];

function HeaderRow() {
  const wb = useWorkbench();
  const sort = useWb((state) => state.sort);
  const order = useWb((state) => state.order);
  return (
    <div role="row" className={cn(ROW_GRID, "h-7 shrink-0 border-b border-wb-line bg-wb-panel-2 px-3.5 text-[11.5px] font-semibold text-wb-text-3")}>
      {SORTABLE.map(([label, key], index) => (
        <span key={label} role="columnheader" className={index === 0 ? "pl-3.5" : ""}>
          {key ? (
            <button
              type="button"
              onClick={() => wb.setPrefs({ sort: key, order: sort === key && order === "desc" ? "asc" : "desc" })}
              className={cn("border-0 bg-transparent p-0 font-semibold", sort === key ? "text-wb-text" : "text-wb-text-3 hover:text-wb-text")}
            >
              {label}
              {sort === key ? (order === "desc" ? " ↓" : " ↑") : ""}
            </button>
          ) : (
            label
          )}
        </span>
      ))}
    </div>
  );
}

/** Sections for the 按分组 layout: every group (pre-order) with the rows in it; papers repeat across groups. */
function sectionsOf(rows: WorkbenchRow[], groups: WorkbenchGroup[], browsing: string | null) {
  const scope = browsing ? descendantIds(groups, browsing) : null;
  const ordered = flattenGroupTree(buildGroupTree(groups)).filter((node) => !scope || (scope.has(node.id) && node.id !== browsing));
  const sections = ordered
    .map((node) => ({ id: node.id, label: groupLabel(groups, node.id), rows: rows.filter((row) => row.group_ids.includes(node.id)) }))
    .filter((section) => section.rows.length);
  const covered = new Set(ordered.map((node) => node.id));
  const rest = rows.filter((row) => !row.group_ids.some((id) => covered.has(id)));
  if (rest.length) sections.push({ id: "__ungrouped", label: browsing ? "只在当前分组中" : "未分组", rows: rest });
  return sections;
}

export function ItemList() {
  const wb = useWorkbench();
  const result = useWb((state) => state.list.result);
  const status = useWb((state) => state.list.status);
  const error = useWb((state) => state.list.error);
  const selectedIds = useWb((state) => state.selectedIds);
  const density = useWb((state) => state.density);
  const layout = useWb((state) => state.layout);
  const groupId = useWb((state) => state.groupId);
  const view = useWb((state) => state.view);
  const query = useWb((state) => state.query);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  const rows = result?.items ?? [];
  const groups = result?.groups ?? [];
  const selection = useMemo(() => new Set(selectedIds), [selectedIds]);

  const onSelect = useCallback((id: string, event: MouseEvent) => {
    wb.select(id, event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "single");
  }, [wb]);
  const onOpen = useCallback((id: string) => void wb.openReader(id), [wb]);

  const focus = selectedIds[selectedIds.length - 1];
  useEffect(() => {
    if (!focus) return;
    scroller.current?.querySelector(`[data-row="${CSS.escape(focus)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focus]);

  if (status === "error") {
    return <WbEmptyState title="文献库没有加载出来" hint={error ?? undefined} action={<Button onClick={() => void wb.refreshList()}>重试</Button>} />;
  }
  if (result && !rows.length) {
    const searching = Boolean(query);
    return (
      <div className="flex flex-1 flex-col">
        <HeaderRow />
        <WbEmptyState
          icon={searching ? <SearchX size={28} /> : <FileUp size={28} />}
          title={searching ? `没有找到与「${query}」相关的文献` : view === "trash" ? "回收站是空的" : "这里还没有文献"}
          hint={searching ? "搜索覆盖中英题名、作者、DOI、出处、引用键和标签。" : view === "trash" ? undefined : "导入 PDF，或把 PDF 文件拖到这里。"}
          action={!searching && view !== "trash" ? <Button variant="primary" onClick={openPdfPicker}>导入 PDF</Button> : undefined}
        />
      </div>
    );
  }

  const renderRow = (row: WorkbenchRow, sectionId?: string) => (
    <div key={(sectionId ?? "") + row.id} data-row={row.id}>
      <ItemRow
        row={row}
        groups={groups}
        browsingGroup={groupId}
        hideGroupChip={sectionId && sectionId !== "__ungrouped" ? sectionId : undefined}
        density={density}
        selected={selection.has(row.id)}
        selection={selectedIds}
        onSelect={onSelect}
        onOpen={onOpen}
      />
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <HeaderRow />
      <div ref={scroller} role="grid" aria-label="文献列表" aria-multiselectable="true" aria-busy={status === "loading"} className="wb-scroll min-h-0 flex-1">
        {layout === "grouped"
          ? sectionsOf(rows, groups, groupId).map((section) => {
              const closed = collapsed.includes(section.id);
              return (
                <section key={section.id} aria-label={section.label}>
                  <button
                    type="button"
                    onClick={() => setCollapsed((list) => (closed ? list.filter((id) => id !== section.id) : [...list, section.id]))}
                    className="sticky top-0 z-[1] flex h-8 w-full items-center gap-2 border-0 border-b border-wb-line bg-wb-panel-3 px-3.5 text-left"
                  >
                    {closed ? <ChevronRight size={12} strokeWidth={2.4} aria-hidden="true" /> : <ChevronDown size={12} strokeWidth={2.4} aria-hidden="true" />}
                    <span className="font-semibold">{section.label}</span>
                    <span className="wb-numeric text-[11.5px] text-wb-text-3">{section.rows.length}</span>
                  </button>
                  {closed ? null : section.rows.map((row) => renderRow(row, section.id))}
                </section>
              );
            })
          : rows.map((row) => renderRow(row))}
      </div>
    </div>
  );
}
