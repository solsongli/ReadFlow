import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Plus, Search } from "lucide-react";
import { Checkbox } from "radix-ui";
import { cn } from "@/ui/lib/utils.js";
import { PopoverContent, PopoverRoot, PopoverTrigger } from "@/ui/wb/Menu.js";
import { buildGroupTree, flattenGroupTree } from "../../domain/groups.js";
import { useWb, useWorkbench } from "../context.js";

/** Multi-select "加入分组": checking adds, unchecking removes; one paper can be in any number of groups. */
export function GroupPicker({ itemIds, children }: { itemIds: string[]; children: ReactNode }) {
  const wb = useWorkbench();
  const open = useWb((state) => state.pickerOpen);
  const groups = useWb((state) => state.list.result?.groups ?? []);
  const rows = useWb((state) => state.list.result?.items ?? []);
  const [query, setQuery] = useState("");

  const members = useMemo(() => {
    const selected = rows.filter((row) => itemIds.includes(row.id));
    const counts = new Map<string, number>();
    for (const row of selected) for (const id of row.group_ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    return { counts, total: selected.length || itemIds.length };
  }, [rows, itemIds]);

  const text = query.trim();
  const nodes = useMemo(() => {
    const flat = flattenGroupTree(buildGroupTree(groups));
    return text ? flat.filter((node) => node.name.toLowerCase().includes(text.toLowerCase())) : flat;
  }, [groups, text]);
  const exact = groups.some((group) => group.name === text);

  function setOpen(next: boolean) {
    wb.store.actions.patch({ pickerOpen: next });
    if (!next) setQuery("");
  }

  function toggle(groupId: string, checked: boolean) {
    void wb.setMembership(groupId, checked ? itemIds : [], checked ? [] : itemIds);
  }

  async function create() {
    if (!text || exact) return;
    await wb.createGroup(text, null, itemIds);
    setQuery("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (nodes.length === 1) toggle(nodes[0].id, (members.counts.get(nodes[0].id) ?? 0) < members.total);
      else void create();
    }
  }

  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="flex w-[300px] flex-col text-[12.5px]">
        <label className="flex h-9 items-center gap-2 border-b border-wb-line px-2.5 text-wb-text-3">
          <Search size={14} aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="查找或新建分组"
            aria-label="查找或新建分组"
            className="h-full flex-1 border-0 bg-transparent text-wb-text outline-none"
          />
        </label>
        <div className="wb-scroll max-h-[300px] p-1">
          {nodes.length === 0 && !text ? <p className="m-0 px-2 py-3 text-wb-text-3">还没有分组，输入名称新建一个。</p> : null}
          {nodes.map((node) => {
            const count = members.counts.get(node.id) ?? 0;
            const state = count === 0 ? false : count >= members.total ? true : "indeterminate";
            const id = "wb-pick-" + node.id;
            return (
              <div key={node.id} className="flex h-7 items-center gap-2 rounded-[5px] pr-2 hover:bg-wb-hover" style={{ paddingLeft: 8 + (text ? 0 : node.depth * 18) }}>
                <Checkbox.Root
                  id={id}
                  checked={state}
                  onCheckedChange={(value) => toggle(node.id, value === true)}
                  className={cn(
                    "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                    state ? "border-wb-accent bg-wb-accent text-wb-on-accent" : "border-wb-line-strong bg-wb-panel",
                  )}
                >
                  <Checkbox.Indicator className="text-[10px] leading-none">{state === "indeterminate" ? "–" : "✓"}</Checkbox.Indicator>
                </Checkbox.Root>
                <label htmlFor={id} className="min-w-0 flex-1 wb-truncate">{node.name}</label>
                <span className="wb-numeric text-[11.5px] text-wb-text-3">{node.count}</span>
              </div>
            );
          })}
        </div>
        <div className="flex h-9 items-center justify-between gap-2 border-t border-wb-line px-2">
          {text && !exact ? (
            <button type="button" onClick={() => void create()} className="inline-flex min-w-0 items-center gap-1.5 rounded border-0 bg-transparent px-1.5 py-1 font-medium text-wb-accent hover:bg-wb-accent-soft">
              <Plus size={13} aria-hidden="true" />
              <span className="wb-truncate">新建分组「{text}」并加入</span>
            </button>
          ) : (
            <span className="px-1.5 text-[11.5px] text-wb-text-3">可多选 · 勾选即加入，取消即移出</span>
          )}
          {members.total > 1 ? <span className="shrink-0 text-[11.5px] text-wb-text-3">{members.total} 篇</span> : null}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
