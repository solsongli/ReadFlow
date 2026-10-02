import { useState, type ComponentType } from "react";
import { Armchair, Bookmark, Clock, FileQuestion, Library, NotebookPen, PanelLeftClose, PanelLeftOpen, Plus, Star, Trash2 } from "lucide-react";
import type { WorkbenchView } from "@/platform/contracts/workbench.js";
import { cn } from "@/ui/lib/utils.js";
import { IconButton } from "@/ui/wb/Button.js";
import { SectionLabel } from "@/ui/wb/EmptyState.js";
import { tagColorSlot } from "../../domain/format.js";
import { LIBRARY_TAB } from "../../domain/workbench-store.js";
import { useWb, useWorkbench } from "../context.js";
import { GroupTree } from "./GroupTree.js";
import { SettingsMenu } from "./SettingsMenu.js";

const VIEWS: ReadonlyArray<{ view: WorkbenchView; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }> }> = [
  { view: "all", label: "全部文献", icon: Library },
  { view: "unread", label: "待读", icon: Bookmark },
  { view: "starred", label: "星标", icon: Star },
  { view: "notes", label: "有笔记的文献", icon: NotebookPen },
  { view: "recent", label: "最近阅读", icon: Clock },
  { view: "unfiled", label: "未分组", icon: FileQuestion },
  { view: "trash", label: "回收站", icon: Trash2 },
];
const TAG_DOT = ["", "bg-wb-tag-1", "bg-wb-tag-2", "bg-wb-tag-3", "bg-wb-tag-4", "bg-wb-tag-5", "bg-wb-tag-6", "bg-wb-tag-7"];

function NavButton({ active, icon: Icon, label, count, onClick, collapsed, shortcut }: {
  active: boolean;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  count?: number | null;
  onClick: () => void;
  collapsed: boolean;
  shortcut?: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={shortcut ? `${label}（${shortcut}）` : label} aria-current={active ? "page" : undefined}
      className={cn("wb-transition flex h-[30px] w-full items-center gap-2.5 rounded-lg border-0 px-2.5 text-left", collapsed && "justify-center px-0", active ? "bg-wb-selected font-medium text-wb-text" : "bg-transparent text-wb-text hover:bg-wb-hover")}
    >
      <span className="inline-flex shrink-0 text-wb-link" aria-hidden="true"><Icon size={17} strokeWidth={1.7} /></span>
      {!collapsed ? <><span className="flex-1 wb-truncate">{label}</span>{count != null ? <span className="wb-numeric font-normal text-wb-text-3">{count}</span> : null}</> : null}
    </button>
  );
}

export function Sidebar() {
  const wb = useWorkbench();
  const main = useWb((state) => (state.activeTab === LIBRARY_TAB ? state.main : null));
  const view = useWb((state) => state.view);
  const groupId = useWb((state) => state.groupId);
  const tag = useWb((state) => state.tag);
  const counts = useWb((state) => state.list.result?.counts ?? null);
  const tags = useWb((state) => state.list.result?.tags ?? []);
  const hasGroups = useWb((state) => Boolean(state.list.result?.groups.length));
  const collapsed = useWb((state) => state.sidebarCollapsed);
  const noteCounts = useWb((state) => state.desk.data?.counts);
  const [moreTags, setMoreTags] = useState(false);
  const inLibrary = main === "library" && !groupId && !tag;
  return (
    <aside aria-label="导航" className={cn("flex shrink-0 flex-col border-r border-wb-line-soft bg-wb-sidebar", collapsed ? "w-[52px]" : "w-[236px]")}>
      <div className={cn("flex h-[52px] shrink-0 items-center justify-between px-[18px]", collapsed && "justify-center px-0")}>
        {!collapsed ? <span className="font-semibold tracking-[-0.01em]">ReadFlow</span> : null}
        <IconButton label={collapsed ? "展开侧栏" : "收起侧栏"} onClick={() => wb.setPrefs({ sidebarCollapsed: !collapsed })}>
          {collapsed ? <PanelLeftOpen size={16} strokeWidth={1.7} aria-hidden="true" /> : <PanelLeftClose size={16} strokeWidth={1.7} aria-hidden="true" />}
        </IconButton>
      </div>
      <div className={cn("wb-scroll flex min-h-0 flex-1 flex-col gap-[18px] px-2.5 pb-4", collapsed && "px-2")}>
        <nav aria-label="工作空间" className="flex flex-col gap-0.5"><NavButton active={main === "desk"} icon={Armchair} label="书桌" shortcut="Ctrl 1" collapsed={collapsed} onClick={() => wb.setMain("desk")} />
          <NavButton active={main === "notes"} icon={NotebookPen} label="笔记" collapsed={collapsed} count={noteCounts ? noteCounts.notes + noteCounts.annotations : null} onClick={() => void wb.notes.open()} />
        </nav>
        <nav aria-label="文献库" className="flex flex-col gap-0.5">
          {!collapsed ? <SectionLabel>文献库</SectionLabel> : null}
          {VIEWS.filter((entry) => !["unfiled", "notes"].includes(entry.view) || (counts?.[entry.view] ?? 0) > 0).map((entry) => (
            <NavButton key={entry.view} collapsed={collapsed} active={inLibrary && view === entry.view} icon={entry.icon} label={entry.label}
              shortcut={entry.view === "all" ? "Ctrl 2" : undefined}
              count={counts ? entry.view === "all" ? counts.all : counts[entry.view] || null : null}
              onClick={() => wb.browse({ view: entry.view, query: "" })} />
          ))}
        </nav>
        {!collapsed ? <>
          <section aria-label="分组" className="flex flex-col gap-0.5" title="把文献拖到分组上即可加入">
            <SectionLabel actions={<IconButton label="新建分组" size="xs" onClick={() => wb.store.actions.patch({ groupDraft: { parentId: null } })}><Plus size={13} aria-hidden="true" /></IconButton>}>分组</SectionLabel>
            <GroupTree />
            {!hasGroups ? <p className="m-0 px-2 py-1 text-[12px] text-wb-text-3">点 + 新建你的第一个分组</p> : null}
          </section>
          {tags.length ? (
            <section aria-label="标签" className="flex flex-col gap-0.5">
              <SectionLabel>标签</SectionLabel>
              {(moreTags ? tags : tags.slice(0, 8)).map((entry) => (
                <button key={entry.name} type="button" onClick={() => wb.browse({ tag: tag === entry.name ? null : entry.name, query: "" })}
                  aria-current={tag === entry.name && main === "library" ? "page" : undefined}
                  className={cn("wb-transition flex h-7 w-full items-center gap-2.5 rounded-lg border-0 px-2.5 text-left", tag === entry.name && main === "library" ? "bg-wb-selected" : "bg-transparent hover:bg-wb-hover")}>
                  <span aria-hidden="true" className={cn("h-2.5 w-2.5 shrink-0 rounded-full", TAG_DOT[tagColorSlot(entry.name)])} />
                  <span className="flex-1 wb-truncate">{entry.name}</span>
                  <span className="wb-numeric text-[12px] text-wb-text-3">{entry.count}</span>
                </button>
              ))}
              {tags.length > 8 ? <button type="button" aria-expanded={moreTags} onClick={() => setMoreTags(!moreTags)} className="wb-transition h-7 rounded-lg border-0 bg-transparent px-2.5 text-left text-[12px] text-wb-text-3 hover:bg-wb-hover">{moreTags ? "收起" : `更多（${tags.length - 8}）`}</button> : null}
            </section>
          ) : null}
        </> : null}
      </div>
      <div className={cn("flex h-12 shrink-0 items-center px-3", collapsed && "justify-center px-0")}><SettingsMenu /></div>
    </aside>
  );
}
