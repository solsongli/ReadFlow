import type { ComponentType } from "react";
import { Armchair, Bookmark, Clock, FileQuestion, Library, Plus, Star, Trash2 } from "lucide-react";
import type { WorkbenchCounts, WorkbenchView } from "@/platform/contracts/workbench.js";
import { cn } from "@/ui/lib/utils.js";
import { IconButton } from "@/ui/wb/Button.js";
import { SectionLabel } from "@/ui/wb/EmptyState.js";
import { tagColorSlot } from "../../domain/format.js";
import { LIBRARY_TAB } from "../../domain/workbench-store.js";
import { useWb, useWorkbench } from "../context.js";
import { GroupTree } from "./GroupTree.js";

const VIEWS: Array<{ view: WorkbenchView; label: string; icon: ComponentType<{ size?: number }> }> = [
  { view: "all", label: "全部文献", icon: Library },
  { view: "unread", label: "待读", icon: Bookmark },
  { view: "starred", label: "星标", icon: Star },
  { view: "recent", label: "最近阅读", icon: Clock },
  { view: "unfiled", label: "未分组", icon: FileQuestion },
  { view: "trash", label: "回收站", icon: Trash2 },
];

const TAG_DOT = ["", "bg-wb-tag-1", "bg-wb-tag-2", "bg-wb-tag-3", "bg-wb-tag-4", "bg-wb-tag-5", "bg-wb-tag-6", "bg-wb-tag-7"];

function NavButton({ active, icon: Icon, label, count, onClick }: {
  active: boolean;
  icon: ComponentType<{ size?: number }>;
  label: string;
  count?: number | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-[26px] w-full items-center gap-2 rounded-[5px] border-0 px-2 text-left",
        active ? "bg-wb-accent-tint font-medium text-wb-accent" : "bg-transparent text-wb-text hover:bg-wb-hover",
      )}
    >
      <span className={cn("inline-flex shrink-0", active ? "text-wb-accent" : "text-wb-text-3")}>
        <Icon size={14} />
      </span>
      <span className="flex-1 wb-truncate">{label}</span>
      {count != null ? <span className={cn("wb-numeric text-[11.5px] font-normal", active ? "text-wb-accent" : "text-wb-text-3")}>{count}</span> : null}
    </button>
  );
}

export function Sidebar() {
  const wb = useWorkbench();
  const main = useWb((state) => (state.activeTab === LIBRARY_TAB ? state.main : null));
  const view = useWb((state) => state.view);
  const groupId = useWb((state) => state.groupId);
  const tag = useWb((state) => state.tag);
  const counts = useWb((state) => state.list.result?.counts ?? null) as WorkbenchCounts | null;
  const tags = useWb((state) => state.list.result?.tags ?? []);
  const hasGroups = useWb((state) => Boolean(state.list.result?.groups.length));
  const inLibrary = main === "library" && !groupId && !tag;

  return (
    <aside aria-label="导航" className="wb-scroll flex flex-col gap-3.5 border-r border-wb-line bg-wb-sidebar px-2 py-2.5">
      <nav className="flex flex-col gap-px">
        <NavButton active={main === "desk"} icon={Armchair} label="书桌" onClick={() => wb.setMain("desk")} />
        <SectionLabel className="mt-1.5">文献库</SectionLabel>
        {VIEWS.map((entry) => (
          <NavButton
            key={entry.view}
            active={inLibrary && view === entry.view}
            icon={entry.icon}
            label={entry.label}
            count={counts ? (entry.view === "all" ? counts.all : counts[entry.view] || null) : null}
            onClick={() => wb.browse({ view: entry.view })}
          />
        ))}
      </nav>

      <section aria-label="分组" className="flex flex-col gap-px">
        <SectionLabel
          actions={
            <IconButton label="新建分组" size="xs" onClick={() => { wb.browse({ view, groupId, tag }); wb.store.actions.patch({ groupDraft: { parentId: null } }); }}>
              <Plus size={13} strokeWidth={2.2} aria-hidden="true" />
            </IconButton>
          }
        >
          分组
        </SectionLabel>
        <GroupTree />
        <p className="m-0 px-2 pt-1 text-[11.5px] leading-normal text-wb-text-3">
          {hasGroups ? "把文献拖到分组上即可加入，一篇文献可同时在多个分组中。" : "还没有分组。点 + 新建，或在右侧详情里「加入分组」。"}
        </p>
      </section>

      {tags.length ? (
        <section aria-label="标签" className="flex flex-col gap-px">
          <SectionLabel>标签</SectionLabel>
          {tags.slice(0, 30).map((entry) => (
            <button
              key={entry.name}
              type="button"
              onClick={() => wb.browse({ tag: tag === entry.name ? null : entry.name })}
              className={cn(
                "flex h-6 w-full items-center gap-2 rounded-[5px] border-0 px-2 text-left",
                tag === entry.name && main === "library" ? "bg-wb-accent-tint text-wb-accent" : "bg-transparent text-wb-text hover:bg-wb-hover",
              )}
            >
              <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", TAG_DOT[tagColorSlot(entry.name)])} />
              <span className="flex-1 wb-truncate">{entry.name}</span>
              <span className="wb-numeric text-[11.5px] text-wb-text-3">{entry.count}</span>
            </button>
          ))}
        </section>
      ) : null}
    </aside>
  );
}
