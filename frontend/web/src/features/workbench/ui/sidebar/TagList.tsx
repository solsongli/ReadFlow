import { useState, type DragEvent } from "react";
import { MoreHorizontal } from "lucide-react";
import type { WorkbenchTag } from "@/platform/contracts/workbench.js";
import { cn } from "@/ui/lib/utils.js";
import { IconButton } from "@/ui/wb/Button.js";
import { MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuRoot, MenuSeparator, MenuTrigger } from "@/ui/wb/Menu.js";
import { sidebarTagOrder, TAG_COLOR_NAMES, TAG_DOT } from "../../domain/tags.js";
import { DRAG_MIME, readDraggedIds } from "../library/drag.js";
import { useWb, useWorkbench } from "../context.js";

function TagRow({ entry }: { entry: WorkbenchTag }) {
  const wb = useWorkbench();
  const active = useWb((state) => state.tag === entry.name && state.main === "library");
  const colored = useWb((state) => state.tagColors.find((tag) => tag.name === entry.name));
  const [mode, setMode] = useState<"" | "rename" | "delete">("");
  const [draft, setDraft] = useState(entry.name);
  const [over, setOver] = useState(false);
  const accept = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
    event.preventDefault();
    setOver(true);
  };
  if (mode === "rename")
    return (
      <input
        autoFocus
        aria-label={`重命名标签「${entry.name}」`}
        value={draft}
        maxLength={200}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => setMode("")}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {
            void wb.tags.rename(entry.name, draft);
            setMode("");
          }
          if (event.key === "Escape") setMode("");
          event.stopPropagation();
        }}
        className="h-7 rounded-lg border border-wb-accent bg-wb-fill px-2.5 text-[0.8125rem] text-wb-text outline-none"
      />
    );
  if (mode === "delete")
    return (
      <div role="group" aria-label={`确认删除标签「${entry.name}」`} className="flex items-center gap-1.5 rounded-lg bg-wb-danger-soft px-2.5 py-1 text-[0.75rem]">
        <span className="flex-1 wb-truncate">从 {entry.count} 篇移除「{entry.name}」？</span>
        <button type="button" onClick={() => setMode("")} className="border-0 bg-transparent text-wb-text-3 hover:text-wb-text">取消</button>
        <button type="button" onClick={() => { void wb.tags.remove(entry.name); setMode(""); }} className="border-0 bg-transparent font-medium text-wb-danger">删除</button>
      </div>
    );
  return (
    <div
      className={cn("group flex h-7 items-center rounded-lg", active ? "bg-wb-selected" : "hover:bg-wb-hover", over && "ring-1 ring-wb-accent")}
      onDragOver={accept}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        const ids = readDraggedIds(event.dataTransfer);
        if (ids.length) void wb.tags.apply(ids, [entry.name]);
      }}
    >
      <button
        type="button"
        title={colored ? `${entry.name}（按 ${colored.position} 切换）· 把文献拖到这里即可加标签` : `${entry.name} · 把文献拖到这里即可加标签`}
        onClick={() => wb.browse({ tag: active ? null : entry.name, query: "" })}
        aria-current={active ? "page" : undefined}
        className="wb-transition flex h-full min-w-0 flex-1 items-center gap-2.5 border-0 bg-transparent px-2.5 text-left"
      >
        <span aria-hidden="true" className={cn("h-2.5 w-2.5 shrink-0 rounded-full", colored ? TAG_DOT[colored.color] : "border border-wb-line-strong")} />
        <span className="flex-1 wb-truncate">{entry.name}</span>
        {colored ? <span aria-label={`快捷键 ${colored.position}`} className="wb-numeric rounded bg-wb-fill px-1 text-[0.65625rem] text-wb-text-3">{colored.position}</span> : null}
        <span className="wb-numeric text-[0.75rem] text-wb-text-3">{entry.count}</span>
      </button>
      <MenuRoot>
        <MenuTrigger asChild>
          <IconButton label={`标签「${entry.name}」选项`} size="xs" className="mr-1 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100">
            <MoreHorizontal size={13} aria-hidden="true" />
          </IconButton>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuLabel>颜色</MenuLabel>
          <MenuRadioGroup value={String(colored?.color ?? 0)} onValueChange={(value) => void (value === "0" ? wb.tags.clearColor(entry.name) : wb.tags.setColor(entry.name, Number(value), colored?.position))}>
            <MenuRadioItem value="0">无颜色</MenuRadioItem>
            {TAG_COLOR_NAMES.slice(1).map((name, index) => (
              <MenuRadioItem key={name} value={String(index + 1)}>
                <span aria-hidden="true" className={cn("mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle", TAG_DOT[index + 1])} />
                {name}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          {colored ? (
            <>
              <MenuSeparator />
              <MenuLabel>数字键位置</MenuLabel>
              <MenuRadioGroup value={String(colored.position)} onValueChange={(value) => void wb.tags.setColor(entry.name, colored.color, Number(value))}>
                {Array.from({ length: 9 }, (_, index) => (
                  <MenuRadioItem key={index} value={String(index + 1)}>{index + 1}</MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </>
          ) : null}
          <MenuSeparator />
          <MenuItem onSelect={() => { setDraft(entry.name); setMode("rename"); }}>重命名…</MenuItem>
          <MenuItem onSelect={() => setMode("delete")}>删除标签…</MenuItem>
        </MenuContent>
      </MenuRoot>
    </div>
  );
}

/** Zotero-style tag selector: colored tags first with their number key, then the rest alphabetically. */
export function TagList({ tags }: { tags: WorkbenchTag[] }) {
  const colors = useWb((state) => state.tagColors);
  const [more, setMore] = useState(false);
  const ordered = sidebarTagOrder(tags, colors);
  const pinned = Math.max(8, colors.length);
  return (
    <section aria-label="标签" className="flex flex-col gap-0.5">
      {(more ? ordered : ordered.slice(0, pinned)).map((entry) => <TagRow key={entry.name} entry={entry} />)}
      {ordered.length > pinned ? (
        <button type="button" aria-expanded={more} onClick={() => setMore(!more)} className="wb-transition h-7 rounded-lg border-0 bg-transparent px-2.5 text-left text-[0.75rem] text-wb-text-3 hover:bg-wb-hover">
          {more ? "收起" : `更多（${ordered.length - pinned}）`}
        </button>
      ) : null}
    </section>
  );
}
