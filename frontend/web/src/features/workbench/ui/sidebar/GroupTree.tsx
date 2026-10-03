import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { ChevronDown, ChevronRight, Ellipsis, Folder } from "lucide-react";
import { cn } from "@/ui/lib/utils.js";
import { Button, IconButton } from "@/ui/wb/Button.js";
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from "@/ui/wb/Menu.js";
import { buildGroupTree, flattenGroupTree, type GroupNode } from "../../domain/groups.js";
import { useWb, useWorkbench } from "../context.js";
import { DRAG_MIME, readDraggedIds } from "../library/drag.js";

function NameInput({ initial, placeholder, onSubmit, onCancel, indent }: {
  initial: string;
  placeholder: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  indent: number;
}) {
  const [value, setValue] = useState(initial);
  const finished = useRef(false);
  function finish(save: boolean) {
    if (finished.current) return;
    finished.current = true;
    if (save && value.trim() && value.trim() !== initial) onSubmit(value.trim());
    else onCancel();
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && value.trim()) finish(true);
    if (event.key === "Escape") finish(false);
  }
  return (
    <div className="py-0.5 pr-1" style={{ paddingLeft: 6 + indent * 15 }}>
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => finish(true)}
        className="h-8 w-full rounded-lg border-0 bg-wb-fill px-1.5 text-[0.78125rem] outline-none"
      />
    </div>
  );
}

export function GroupTree() {
  const wb = useWorkbench();
  const groups = useWb((state) => state.list.result?.groups ?? []);
  const expanded = useWb((state) => state.expandedGroups);
  const current = useWb((state) => (state.main === "library" && state.activeTab === "library" ? state.groupId : null));
  const draft = useWb((state) => state.groupDraft);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const tree = useMemo(() => buildGroupTree(groups), [groups]);
  const rows = useMemo(() => flattenGroupTree(tree, new Set(expanded)), [tree, expanded]);

  function drop(event: DragEvent, node: GroupNode) {
    event.preventDefault();
    setDropTarget(null);
    const ids = readDraggedIds(event.dataTransfer);
    if (!ids.length) return;
    void wb.setMembership(node.id, ids).then((done) => {
      if (done) wb.notify(`已加入「${node.name}」（${ids.length} 篇），原有分组不变`, "success");
    });
  }

  const draftRow = (parentId: string | null, indent: number) =>
    draft && draft.parentId === parentId ? (
      <NameInput
        key={"draft:" + parentId}
        initial=""
        placeholder={parentId ? "子分组名称" : "新分组名称"}
        indent={indent}
        onCancel={() => wb.store.actions.patch({ groupDraft: null })}
        onSubmit={(name) => {
          wb.store.actions.patch({ groupDraft: null });
          void wb.createGroup(name, parentId);
        }}
      />
    ) : null;

  return (
    <div className="flex flex-col gap-px">
      {draftRow(null, 0)}
      {rows.map((node) => {
        const open = expanded.includes(node.id);
        if (editing === node.id) {
          return (
            <NameInput
              key={node.id}
              initial={node.name}
              placeholder="分组名称"
              indent={node.depth}
              onCancel={() => setEditing(null)}
              onSubmit={(name) => {
                setEditing(null);
                void wb.renameGroup(node.id, name);
              }}
            />
          );
        }
        return (
          <div key={node.id}>
            <div
              onContextMenu={(event) => { event.preventDefault(); setMenuId(node.id); }}
              onKeyDown={(event) => { if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); setMenuId(node.id); } }}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setDropTarget(node.id);
              }}
              onDragLeave={() => setDropTarget((value) => (value === node.id ? null : value))}
              onDrop={(event) => drop(event, node)}
              className={cn(
                "group wb-transition flex h-[1.875rem] items-center gap-1.5 rounded-lg pr-1",
                current === node.id ? "bg-wb-selected text-wb-text" : "text-wb-text hover:bg-wb-hover",
                dropTarget === node.id && "outline outline-2 -outline-offset-2 outline-wb-accent",
              )}
              style={{ paddingLeft: 2 + node.depth * 15 }}
            >
              <button
                type="button"
                aria-label={`${open ? "收起" : "展开"}「${node.name}」`} title={`${open ? "收起" : "展开"}「${node.name}」`}
                aria-expanded={node.children.length ? open : undefined}
                onClick={() => wb.toggleGroupExpanded(node.id)}
                className={cn("inline-flex h-5 w-4 items-center justify-center border-0 bg-transparent p-0 text-wb-text-3", !node.children.length && "invisible")}
              >
                {open ? <ChevronDown size={11} strokeWidth={2.4} aria-hidden="true" /> : <ChevronRight size={11} strokeWidth={2.4} aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={() => wb.browse({ groupId: node.id, query: "" })}
                onDoubleClick={() => setEditing(node.id)}
                aria-current={current === node.id ? "page" : undefined}
                className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent p-0 text-left"
                title={node.name}
              >
                <Folder size={17} strokeWidth={1.7} aria-hidden="true" className="shrink-0 text-wb-link" />
                <span className="wb-truncate">{node.name}</span>
              </button>
              <span className="wb-numeric text-[0.75rem] font-normal text-wb-text-3">{node.count}</span>
              <MenuRoot open={menuId === node.id} onOpenChange={(value) => setMenuId(value ? node.id : null)}>
                <MenuTrigger asChild>
                  <IconButton label={`分组「${node.name}」的操作`} size="xs" className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100">
                    <Ellipsis size={13} aria-hidden="true" />
                  </IconButton>
                </MenuTrigger>
                <MenuContent align="start">
                  <MenuItem onSelect={() => { if (!open) wb.toggleGroupExpanded(node.id); wb.store.actions.patch({ groupDraft: { parentId: node.id } }); }}>新建子分组</MenuItem>
                  <MenuItem onSelect={() => setEditing(node.id)}>重命名</MenuItem>
                  <MenuSeparator />
                  <MenuItem danger onSelect={() => setConfirming(node.id)}>删除分组…</MenuItem>
                </MenuContent>
              </MenuRoot>
            </div>
            {confirming === node.id ? (
              <div className="mx-1 my-1 rounded-xl bg-wb-panel p-3 shadow-wb-pop text-[0.75rem]" role="alertdialog" aria-label="确认删除分组" onKeyDown={(event) => { if (event.key === "Escape") setConfirming(null); }}>
                <p className="m-0 mb-2 leading-relaxed text-wb-text-2">
                  删除「{node.name}」{node.children.length ? "及其子分组" : ""}？文献本身不会被删除，仍在文献库和其他分组中。
                </p>
                <div className="flex justify-end gap-1.5">
                  <Button autoFocus size="sm" variant="ghost" onClick={() => setConfirming(null)}>取消</Button>
                  <Button size="sm" variant="danger" onClick={() => { setConfirming(null); void wb.deleteGroup(node.id); }}>删除分组</Button>
                </div>
              </div>
            ) : null}
            {open ? draftRow(node.id, node.depth + 1) : null}
          </div>
        );
      })}
    </div>
  );
}
