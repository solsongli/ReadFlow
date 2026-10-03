import { useState } from "react";
import { Plus, MoreHorizontal, PanelsTopLeft } from "lucide-react";
import { Button, IconButton } from "@/ui/wb/Button.js";
import { MenuRoot, MenuTrigger, MenuContent, MenuItem } from "@/ui/wb/Menu.js";
import { useCanvases } from "./context.js";
export function CanvasList() {
  const workspace = useCanvases();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  return (
    <section aria-label="画布" className="mt-3 space-y-1">
      <div className="flex items-center justify-between px-2 text-[0.75rem] text-wb-text-3">
        <span>画布</span>
        <IconButton
          label="新建画布"
          title="新建画布"
          size="xs"
          onClick={() => {
            setEditing("");
            setName("");
            setGroup("");
          }}
        >
          <Plus size={13} />
        </IconButton>
      </div>
      {workspace.list.map((canvas) => (
        <div key={canvas.id} className="flex items-center rounded-lg hover:bg-wb-hover">
          <button
            className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent px-2 py-1 text-left text-[0.8125rem]"
            title={canvas.name}
            onClick={() => workspace.open(canvas.id, canvas.name)}
          >
            <PanelsTopLeft size={15} className="shrink-0 text-wb-link" />
            <span className="truncate">{canvas.name}</span>
          </button>
          <MenuRoot>
            <MenuTrigger asChild>
              <IconButton label={`画布「${canvas.name}」操作`} title="画布操作" size="xs">
                <MoreHorizontal size={14} />
              </IconButton>
            </MenuTrigger>
            <MenuContent>
              <MenuItem
                onSelect={() => {
                  setEditing(canvas.id);
                  setName(canvas.name);
                  setGroup(canvas.group_id || "");
                }}
              >
                重命名与分组
              </MenuItem>
              <MenuItem onSelect={() => setDeleting(canvas.id)}>删除画布…</MenuItem>
            </MenuContent>
          </MenuRoot>
        </div>
      ))}
      {editing != null ? (
        <form
          className="space-y-2 rounded-lg bg-wb-fill p-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (editing) {
              await workspace.rename(editing, name, group || null);
            } else {
              await workspace.create(name, group || null);
            }
            setEditing(null);
          }}
        >
          <input
            autoFocus
            required
            maxLength={200}
            aria-label="画布名称"
            placeholder="例如：第二章 · 相关工作"
            className="w-full rounded border-0 bg-wb-panel p-1 text-[0.75rem]"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            aria-label="画布关联分组"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="w-full text-[0.75rem]"
          >
            <option value="">不关联分组</option>
            {workspace.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <Button size="sm" type="submit">
            保存画布
          </Button>
          <Button size="sm" onClick={() => setEditing(null)}>
            取消
          </Button>
        </form>
      ) : null}
      {deleting ? (
        <div className="rounded-lg bg-wb-fill p-2 text-[0.75rem]">
          删除只影响这张画布，不删除文献与批注。
          <Button size="sm" onClick={() => setDeleting(null)}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={() => {
              void workspace.remove(deleting);
              setDeleting(null);
            }}
          >
            确认删除画布
          </Button>
        </div>
      ) : null}
      {workspace.error ? (
        <p role="status" className="px-2 text-[0.75rem] text-wb-text-3">
          {workspace.error}
          <Button size="sm" onClick={workspace.retry}>
            重试
          </Button>
        </p>
      ) : null}
    </section>
  );
}
