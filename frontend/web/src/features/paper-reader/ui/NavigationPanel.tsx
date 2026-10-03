import { Bookmark, ListTree, Search, Grid2X2, Trash2 } from "lucide-react";
import { IconButton, Button } from "@/ui/wb/Button.js";
import type { Bookmark as SavedBookmark, OutlineEntry, SearchHit } from "../domain/types.js";
import type { PDFDocumentProxy, renderQueue } from "../state/document.js";
import { Thumbnail } from "./Thumbnail.js";
export type NavigationTab = "outline" | "thumbnails" | "bookmarks" | "search";
export function NavigationPanel({
  tab,
  setTab,
  outline,
  current,
  pdf,
  queue,
  bookmarks,
  remove,
  jump,
  query,
  setQuery,
  hits,
  resultIndex,
  selectResult,
  indexed,
}: {
  tab: NavigationTab;
  setTab: (value: NavigationTab) => void;
  outline: OutlineEntry[];
  current: string;
  pdf: PDFDocumentProxy;
  queue: ReturnType<typeof renderQueue>;
  bookmarks: SavedBookmark[];
  remove: (id: string) => void;
  jump: (page: number, y?: number, offset?: number, mode?: "source" | "translated") => void;
  query: string;
  setQuery: (value: string) => void;
  hits: SearchHit[];
  resultIndex: number;
  selectResult: (index: number) => void;
  indexed: boolean;
}) {
  const tabs = [
    { id: "outline", label: "目录", icon: ListTree },
    { id: "thumbnails", label: "缩略图", icon: Grid2X2 },
    { id: "bookmarks", label: "书签", icon: Bookmark },
    { id: "search", label: "搜索", icon: Search },
  ] as const;
  return (
    <aside
      aria-label="阅读导航"
      className="flex w-52 min-w-0 shrink-0 flex-col border-r border-wb-line-soft bg-wb-panel"
    >
      <div
        role="tablist"
        aria-label="阅读导航类别"
        className="flex justify-around border-b border-wb-line-soft p-2"
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <IconButton
            role="tab"
            aria-selected={tab === id}
            key={id}
            label={label}
            active={tab === id}
            onClick={() => setTab(id)}
          >
            <Icon size={16} />
          </IconButton>
        ))}
      </div>
      <div className="wb-scroll min-h-0 flex-1 p-2">
        {tab === "outline" ? (
          <>
            {outline.length ? (
              outline.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  title={entry.title}
                  aria-current={current === entry.id ? "location" : undefined}
                  className={`mb-0.5 block w-full truncate rounded-lg border-0 py-2 pr-2 text-left text-[0.75rem] ${current === entry.id ? "bg-wb-selected font-semibold text-wb-link" : "bg-transparent text-wb-text-2 hover:bg-wb-hover"}`}
                  style={{ paddingLeft: entry.level * 10 }}
                  onClick={() => jump(entry.page, entry.y)}
                >
                  {entry.title}
                </button>
              ))
            ) : (
              <p className="p-2 text-[0.75rem] text-wb-text-3">
                {indexed ? "未识别到目录。" : "正在识别章节…"}
              </p>
            )}
          </>
        ) : null}
        {tab === "thumbnails"
          ? Array.from({ length: pdf.numPages }, (_, index) => (
              <button
                key={index}
                type="button"
                className="mb-3 block w-full rounded-lg border-0 bg-transparent p-2 hover:bg-wb-hover"
                onClick={() => jump(index + 1)}
              >
                <Thumbnail pdf={pdf} page={index + 1} queue={queue} />
                <span className="text-[0.75rem] text-wb-text-3">{index + 1}</span>
              </button>
            ))
          : null}
        {tab === "bookmarks" ? (
          bookmarks.length ? (
            bookmarks.map((mark) => (
              <div key={mark.id} className="mb-2 flex items-center gap-1">
                <button
                  type="button"
                  title={mark.name}
                  className="min-w-0 flex-1 truncate rounded-lg bg-wb-fill p-2 text-left text-[0.75rem]"
                  onClick={() => jump(mark.page, undefined, mark.offset, mark.mode ?? "source")}
                >
                  {mark.name} · {mark.page}
                  {mark.mode === "translated" ? "（译文）" : ""}
                </button>
                <IconButton label={`删除书签 ${mark.name}`} onClick={() => remove(mark.id)}>
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))
          ) : (
            <p className="p-2 text-[0.75rem] text-wb-text-3">在工具栏为当前页添加书签。</p>
          )
        ) : null}
        {tab === "search" ? (
          <>
            <input
              autoFocus
              data-paper-search
              aria-label="搜索论文"
              placeholder="查找文字…"
              className="mb-2 w-full rounded-lg border-0 bg-wb-fill p-2 text-[0.8125rem]"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <p className="text-[0.75rem] text-wb-text-3">
              {hits.length} 处{indexed ? "" : " · 索引中"}
            </p>
            {hits.map((hit, index) => (
              <Button
                key={index}
                className={`mb-1 h-auto w-full flex-col items-start whitespace-normal text-left ${index === resultIndex ? "bg-wb-selected" : ""}`}
                variant="ghost"
                onClick={() => selectResult(index)}
              >
                <span className="text-[0.6875rem] text-wb-text-3">第 {hit.page} 页</span>
                <span className="line-clamp-3 text-[0.75rem]">{hit.text}</span>
              </Button>
            ))}
          </>
        ) : null}
      </div>
    </aside>
  );
}
