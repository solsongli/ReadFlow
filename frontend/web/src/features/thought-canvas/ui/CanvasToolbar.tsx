import { useState, type ReactNode } from "react";
import {
  Plus,
  Maximize,
  Undo2,
  Redo2,
  AlignLeft,
  AlignStartVertical,
  AlignCenter,
  AlignHorizontalDistributeCenter,
} from "lucide-react";
import { Button, IconButton } from "@/ui/wb/Button.js";
import { MenuRoot, MenuTrigger, MenuContent, MenuItem } from "@/ui/wb/Menu.js";
import type { CanvasGestures } from "../state/useCanvasGestures.js";
import type { NodeType } from "../domain/types.js";
export function CanvasToolbar({
  title,
  titleControl,
  endControl,
  gesture: g,
  add,
  fit,
  undo,
  find,
  exportFile,
}: {
  title: string;
  titleControl?: ReactNode;
  endControl?: ReactNode;
  gesture: CanvasGestures;
  add: (type: NodeType) => void;
  fit: () => void;
  undo: (redo: boolean) => void;
  find: (query: string, direction: number) => void;
  exportFile: () => void;
}) {
  const [query, setQuery] = useState("");
  return (
    <div className="flex shrink-0 items-center overflow-x-auto gap-1 border-b border-wb-line-soft bg-wb-panel p-2 text-[0.75rem]">
      {titleControl ?? (
        <span className="mr-auto max-w-48 shrink-0 truncate font-medium" title={title}>
          {title}
        </span>
      )}
      <MenuRoot>
        <MenuTrigger asChild>
          <IconButton label="添加画布元素" title="添加画布元素">
            <Plus size={15} />
          </IconButton>
        </MenuTrigger>
        <MenuContent>
          {(
            [
              ["sticky", "便签"],
              ["todo", "待解决卡"],
              ["text", "文字标签"],
              ["group", "分组框"],
            ] as const
          ).map(([type, label]) => (
            <MenuItem key={type} onSelect={() => add(type)}>
              {label}
            </MenuItem>
          ))}
        </MenuContent>
      </MenuRoot>
      <IconButton label="适应全部" title="适应全部" onClick={fit}>
        <Maximize size={14} />
      </IconButton>
      <span title="Ctrl + 滚轮缩放">{Math.round(g.view.zoom * 100)}%</span>
      <IconButton label="撤销画布操作" title="撤销（Ctrl Z）" onClick={() => undo(false)}>
        <Undo2 size={14} />
      </IconButton>
      <IconButton label="重做画布操作" title="重做（Ctrl Shift Z）" onClick={() => undo(true)}>
        <Redo2 size={14} />
      </IconButton>
      <label className="mx-1 whitespace-nowrap">
        <input type="checkbox" checked={g.grid} onChange={(e) => g.setGrid(e.target.checked)} /> 吸附
      </label>
      {g.selected.length > 1 ? (
        <>
          <IconButton label="左对齐" title="左对齐" onClick={() => g.align("left")}>
            <AlignLeft size={14} />
          </IconButton>
          <IconButton label="顶对齐" title="顶对齐" onClick={() => g.align("top")}>
            <AlignStartVertical size={14} />
          </IconButton>
          <IconButton label="水平居中" title="水平居中" onClick={() => g.align("center")}>
            <AlignCenter size={14} />
          </IconButton>
          <IconButton label="等距分布" title="等距分布" onClick={() => g.align("distribute")}>
            <AlignHorizontalDistributeCenter size={14} />
          </IconButton>
        </>
      ) : null}
      <input
        aria-label="搜索画布"
        placeholder="搜索卡片…"
        className="w-24 rounded-lg border-0 bg-wb-fill px-2 py-1"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          find(e.target.value, 0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            find(query, e.shiftKey ? -1 : 1);
          }
        }}
      />
      <Button size="sm" onClick={exportFile}>
        导出提纲
      </Button>
      {endControl ? (
        <span className="sticky right-0 ml-auto shrink-0 bg-wb-panel pl-2">{endControl}</span>
      ) : null}
    </div>
  );
}
