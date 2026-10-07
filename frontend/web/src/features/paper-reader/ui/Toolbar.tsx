import { ReaderActions } from "./ReaderActions.js";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  Maximize,
  Minus,
  PanelLeft,
  PanelRight,
  Plus,
  Search,
} from "lucide-react";
import { IconButton, Button } from "@/ui/wb/Button.js";
import type { Mode, PaperTone, ReaderPorts } from "../domain/types.js";
import type { Zoom } from "./PdfPane.js";
export function Toolbar({
  page,
  pages,
  jump,
  back,
  forward,
  canBack,
  canForward,
  zoom,
  setZoom,
  scale,
  mode,
  setMode,
  translated,
  translatedReady,
  focus,
  toggleFocus,
  toggleLeft,
  toggleRight,
  search,
  bookmark,
  tools,
  ports,
}: {
  page: number;
  pages: number;
  jump: (page: number) => void;
  back: () => void;
  forward: () => void;
  canBack: boolean;
  canForward: boolean;
  zoom: Zoom;
  scale: () => number;
  setZoom: (value: Zoom) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  translated: boolean;
  translatedReady: boolean;
  focus: boolean;
  tools?: ReactNode;
  toggleFocus: () => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  search: () => void;
  bookmark: () => void;
  ports: ReaderPorts;
}) {
  return (
    <div
      role="toolbar"
      aria-label="论文阅读工具栏"
      className="pr-toolbar flex h-12 min-h-12 shrink-0 flex-nowrap items-center gap-1 border-b border-wb-line-soft bg-wb-panel px-3 py-1.5"
    >
      <IconButton label="切换目录侧栏" onClick={toggleLeft}>
        <PanelLeft size={17} />
      </IconButton>
      <IconButton label="后退" title="后退（Alt ←）" disabled={!canBack} onClick={back}>
        <ArrowLeft size={16} />
      </IconButton>
      <IconButton label="前进" title="前进（Alt →）" disabled={!canForward} onClick={forward}>
        <ArrowRight size={16} />
      </IconButton>
      <form
        className="mx-1 flex items-center gap-1 rounded-lg bg-wb-fill px-2 py-1 text-[0.75rem]"
        onSubmit={(event) => {
          event.preventDefault();
          const value = Number(new FormData(event.currentTarget).get("page"));
          if (Number.isInteger(value) && value >= 1 && value <= pages) {
            jump(value);
          }
        }}
      >
        <input
          key={page}
          aria-label="页码"
          name="page"
          type="number"
          min={1}
          max={pages}
          defaultValue={page}
          className="w-12 border-0 bg-transparent text-right outline-none"
        />
        <span className="text-wb-text-3">/ {pages}</span>
      </form>
      <IconButton label="缩小 PDF" onClick={() => setZoom(Math.max(0.2, scale() / 1.15))}>
        <Minus size={15} />
      </IconButton>
      <select
        aria-label="PDF 缩放"
        className="max-w-28 rounded-lg border-0 bg-wb-fill px-2 py-1 text-[0.75rem]"
        value={String(zoom)}
        onChange={(event) =>
          setZoom(
            event.target.value === "width" || event.target.value === "page"
              ? event.target.value
              : Number(event.target.value),
          )
        }
      >
        <option value="width">适合宽度</option>
        <option value="page">适合页面</option>
        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => (
          <option key={value} value={value}>
            {Math.round(value * 100)}%
          </option>
        ))}
        {typeof zoom === "number" && ![0.5, 0.75, 1, 1.25, 1.5, 2].includes(zoom) ? (
          <option value={zoom}>{Math.round(zoom * 100)}%</option>
        ) : null}
      </select>
      <IconButton label="放大 PDF" onClick={() => setZoom(Math.min(4, scale() * 1.15))}>
        <Plus size={15} />
      </IconButton>
      {translated || ports.inlineAvailable ? (
        <div role="group" aria-label="阅读模式" className="ml-2 flex rounded-lg bg-wb-fill p-0.5">
          {(
            [
              ["source", "原文"],
              ["compare", "对照"],
              ["translated", "译文"],
              ["inline", "原位"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={mode === value ? "secondary" : "ghost"}
              aria-pressed={mode === value}
              disabled={value === "inline" ? !ports.inlineAvailable : value !== "source" && !translatedReady}
              onClick={() => setMode(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      ) : (
        <Button size="sm" disabled={ports.translation.running} onClick={ports.translation.start}>
          {ports.translation.running ? "翻译中" : "翻译全文"}
        </Button>
      )}
      {!translated && ports.inlineAvailable ? (
        <Button size="sm" disabled={ports.translation.running} onClick={ports.translation.start}>
          {ports.translation.running ? "翻译中" : "翻译全文"}
        </Button>
      ) : null}
      {tools}
      <span className="flex-1" />
      <IconButton label="搜索全文" title="搜索全文（Ctrl F）" onClick={search}>
        <Search size={16} />
      </IconButton>
      <ReaderActions
        tone={ports.tone}
        setTone={ports.setTone}
        bookmark={bookmark}
        focus={focus}
        toggleFocus={toggleFocus}
        margins={ports.marginPreferences}
        setMargins={ports.setMarginPreferences}
      />
      <IconButton label="切换信息面板" onClick={toggleRight}>
        <PanelRight size={17} />
      </IconButton>
    </div>
  );
}
