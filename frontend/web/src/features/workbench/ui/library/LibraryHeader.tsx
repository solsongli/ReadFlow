import { useEffect, useState } from "react";
import { ServiceBanner } from "../shell/ServiceBanner.js";
import { ArrowDownWideNarrow, LayoutList, Search, X } from "lucide-react";
import type { SortOrder, WorkbenchSort } from "@/platform/contracts/workbench.js";
import { cn } from "@/ui/lib/utils.js";
import { IconButton } from "@/ui/wb/Button.js";
import { MenuContent, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuRoot, MenuSeparator, MenuTrigger } from "@/ui/wb/Menu.js";
import { groupLabel } from "../../domain/groups.js";
import { SORT_OPTIONS, sortLabel } from "../../domain/presentation.js";
import { librarySubtitle } from "../../domain/library-presentation.js";
import type { Density, ListLayout } from "../../domain/workbench-store.js";
import { useWb, useWorkbench } from "../context.js";
import { ImportMenu } from "../import/ImportMenu.js";
import { TaskProgress } from "../shell/TaskProgress.js";

const VIEW_TITLE = { all: "全部文献", unread: "待读", starred: "星标", recent: "最近阅读", unfiled: "未分组", trash: "回收站", notes: "有笔记的文献", needs_ocr: "需要 OCR", missing_doi: "缺少 DOI", no_zh_title: "没有中文题名" } as const;

function SortMenu() {
  const wb = useWorkbench();
  const sort = useWb((state) => state.sort);
  const order = useWb((state) => state.order);
  return (
    <MenuRoot>
      <MenuTrigger asChild>
        <IconButton label="排序" title={`排序：${sortLabel(sort)} · ${order === "asc" ? "升序" : "降序"}`}>
          <ArrowDownWideNarrow size={17} strokeWidth={1.7} aria-hidden="true" />
        </IconButton>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuLabel>排序方式</MenuLabel>
        <MenuRadioGroup value={sort} onValueChange={(value) => wb.setPrefs({ sort: value as WorkbenchSort })}>
          {SORT_OPTIONS.map((option) => <MenuRadioItem key={option.value} value={option.value}>{option.label}</MenuRadioItem>)}
          {sort === "opened" ? <MenuRadioItem value="opened">最近阅读</MenuRadioItem> : null}
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuRadioGroup value={order} onValueChange={(value) => wb.setPrefs({ order: value as SortOrder })}>
          <MenuRadioItem value="asc">升序</MenuRadioItem>
          <MenuRadioItem value="desc">降序</MenuRadioItem>
        </MenuRadioGroup>
      </MenuContent>
    </MenuRoot>
  );
}

function DisplayMenu() {
  const wb = useWorkbench();
  const layout = useWb((state) => state.layout);
  const density = useWb((state) => state.density);
  return (
    <MenuRoot>
      <MenuTrigger asChild>
        <IconButton label="显示" title="显示：列表 / 按分组，双语 / 紧凑">
          <LayoutList size={17} strokeWidth={1.7} aria-hidden="true" />
        </IconButton>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuLabel>排列方式</MenuLabel>
        <MenuRadioGroup value={layout} onValueChange={(value) => wb.setPrefs({ layout: value as ListLayout })}>
          <MenuRadioItem value="list">列表</MenuRadioItem>
          <MenuRadioItem value="grouped" title="同一篇文献会出现在每个所属分组下">按分组</MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuLabel>行密度</MenuLabel>
        <MenuRadioGroup value={density} onValueChange={(value) => wb.setPrefs({ density: value as Density })}>
          <MenuRadioItem value="bilingual">双语</MenuRadioItem>
          <MenuRadioItem value="compact">紧凑</MenuRadioItem>
        </MenuRadioGroup>
      </MenuContent>
    </MenuRoot>
  );
}

export function LibraryHeader() {
  const wb = useWorkbench();
  const state = useWb((value) => value);
  const { main, view, groupId, tag, query, list } = state;
  const desk = main === "desk";
  const [search, setSearch] = useState(query);
  const [composing, setComposing] = useState(false);
  useEffect(() => setSearch(query), [query]);
  useEffect(() => { if (search === query || composing) return; const timer = setTimeout(() => wb.setQuery(search), 180); return () => clearTimeout(timer); }, [search, query, composing, wb]);
  const filtered = Boolean(groupId || tag || query);
  const subtitle = librarySubtitle({ view, group: groupId ? groupLabel(list.result?.groups ?? [], groupId) : null, tag, query,
    total: list.result?.total ?? (view === "all" && !filtered ? state.desk.data?.total : undefined), unread: list.result?.counts.unread });
  return (
    <><header className={cn("flex h-[52px] shrink-0 items-center gap-1.5 px-4 pl-[22px]", desk ? "bg-wb-desk-bg" : "border-b border-wb-line-soft")} aria-label="工作台工具栏">
      <div className="flex min-w-0 flex-1 flex-col">{!desk ? <>
        <h1 className="m-0 wb-truncate text-[15px] font-semibold">{desk ? "书桌" : groupId || tag ? "文献库" : VIEW_TITLE[view]}</h1>
        <div className="flex min-w-0 items-center gap-1 text-[11.5px] text-wb-text-3">
          <span className="wb-truncate" title={subtitle || undefined}>
            {subtitle}
          </span>
          {!desk && filtered ? <IconButton label="清除筛选" size="xs" onClick={() => wb.browse({ query: "" })}><X size={11} aria-hidden="true" /></IconButton> : null}
        </div>
      </> : null}</div>
      <TaskProgress />
      {!desk ? <><SortMenu /><DisplayMenu /></> : null}
      {!desk ? <ImportMenu /> : null}
      <label className="ml-1 flex h-7 w-[clamp(120px,17vw,220px)] shrink-0 items-center gap-1.5 rounded-lg bg-wb-fill px-2.5 text-wb-text-3" title="搜索当前列表（/）；命令面板（Ctrl K）">
        <Search size={14} aria-hidden="true" />
        <input
          data-wb-search
          type="search"
          aria-label="搜索文献"
          placeholder="搜索"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={(event) => { setComposing(false); setSearch(event.currentTarget.value); }}
          onKeyDown={(event) => { if (event.key === "Escape") { setSearch(""); wb.setQuery(""); event.currentTarget.blur(); } }}
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-[13px] text-wb-text outline-none placeholder:text-wb-text-3"
        />
      </label>
    </header><ServiceBanner /></>
  );
}
