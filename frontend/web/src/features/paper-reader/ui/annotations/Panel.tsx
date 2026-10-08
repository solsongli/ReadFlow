import { useFlashcards } from "@/features/flashcards/index.js";
import { AnnotationFilters } from "./Filters.js";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import { COLORS, type Annotation, type Semantics } from "../../domain/annotations/types.js";
import type { AnnotationController } from "../../state/annotations/useAnnotations.js";
import { Colors } from "./Colors.js";
import { AnnotationCard } from "./Card.js";
import { annotationMatches } from "../../domain/annotations/tags.js";
export function AnnotationsPanel({
  controller: c,
  page,
  labels,
  jump,
  canvasLinks,
  addToCanvas,
  openCanvas,
}: {
  controller: AnnotationController;
  page: number;
  labels: Semantics;
  jump: (row: Annotation) => void;
  canvasLinks?: Array<{ annotation_id: string; canvas_id: string; node_id: string; name: string }>;
  addToCanvas?: (id: string) => void;
  openCanvas?: (id: string, name: string, node: string) => void;
}) {
  const cards = useFlashcards();
  const [hasCards, setHasCards] = useState(false);
  const [query, setQuery] = useState("");
  const [color, setColor] = useState("");
  const [type, setType] = useState("");
  const [onlyPage, setOnlyPage] = useState(false);
  const [notes, setNotes] = useState("");
  const [sort, setSort] = useState("page");
  const [tags, setTags] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [limit, setLimit] = useState(60);
  useEffect(() => {
    setQuery("");
    setColor("");
    setType("");
    setOnlyPage(false);
    setNotes("");
    setSort("page");
    setTags([]);
    setHasCards(false);
    setConfirm(false);
    setLimit(60);
    c.setMarginFollowFilters(false);
    c.setFilteredIds(null);
  }, [c.item]);
  const rows = useMemo(
    () =>
      c.rows
        .filter(
          (row) =>
            (!hasCards || cards?.cards.some((card) => card.annotation_id === row.id)) &&
            annotationMatches(row, { query, tags, color, type, onlyPage, page, notes, hasCard: hasCards }),
        )
        .sort((a, b) =>
          sort === "page"
            ? a.page_index - b.page_index || a.created_at.localeCompare(b.created_at)
            : b.updated_at.localeCompare(a.updated_at),
        ),
    [c.rows, color, type, onlyPage, page, notes, query, tags, sort, hasCards, cards?.cards],
  );
  const availableTags = useMemo(
    () => [...new Set([...c.tagCatalog, ...c.rows.flatMap((row) => row.tags || [])])].sort(),
    [c.tagCatalog, c.rows],
  );
  useEffect(() => c.setFilteredIds(rows.map((row) => row.id)), [rows]);
  const selected = c.rows.filter((row) => c.selected.includes(row.id));
  const exportIds = (selected.length ? selected : rows).map((row) => row.id);
  return (
    <div className="space-y-3 p-3 text-[0.75rem]" aria-label="批注列表">
      <div className="text-wb-text-3">
        共 {c.rows.length} 条 · 本页 {c.rows.filter((r) => r.page_index === page - 1).length} 条
      </div>
      <input
        aria-label="搜索批注"
        placeholder="搜索引文或说明…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-lg border-0 bg-wb-fill p-2"
      />
      {availableTags.length ? (
        <div aria-label="标签筛选" className="flex gap-1 overflow-x-auto pb-1">
          {availableTags.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={tags.includes(tag)}
              className="shrink-0 rounded-full border-0 bg-wb-fill px-2.5 py-1 aria-pressed:bg-wb-selected aria-pressed:text-wb-link"
              onClick={() => setTags((value) => value.includes(tag) ? value.filter((item) => item !== tag) : [...value, tag])}
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-wb-text-3">
        <input
          type="checkbox"
          aria-label="页边批注跟随筛选"
          checked={c.marginFollowFilters}
          onChange={(event) => c.setMarginFollowFilters(event.target.checked)}
        />
        页边批注跟随筛选
      </label>
      {cards ? (
        <Button size="sm" aria-pressed={hasCards} onClick={() => setHasCards(!hasCards)}>
          有闪卡
        </Button>
      ) : null}
      <AnnotationFilters
        labels={labels}
        color={color}
        type={type}
        notes={notes}
        onlyPage={onlyPage}
        sort={sort}
        setColor={setColor}
        setType={setType}
        setNotes={setNotes}
        setOnlyPage={setOnlyPage}
        setSort={setSort}
      />
      {selected.length >= 2 ? (
        <div className="space-y-2 rounded-lg bg-wb-selected p-2">
          <div>
            已选 {selected.length} 条{" "}
            <Button size="sm" onClick={() => c.setSelected([])}>
              取消选择
            </Button>
          </div>
          <Colors labels={labels} change={(value) => void c.update(c.selected, { color: value })} />
          <Button size="sm" disabled={c.busy} onClick={() => setConfirm(true)}>
            删除所选
          </Button>
          {confirm ? (
            <div>
              删除这 {selected.length} 条批注？
              <Button size="sm" onClick={() => setConfirm(false)}>
                取消
              </Button>
              <Button
                size="sm"
                disabled={c.busy}
                onClick={async () => {
                  if (await c.remove(c.selected)) {
                    c.setSelected([]);
                    setConfirm(false);
                  }
                }}
              >
                确认删除
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1">
        <Button size="sm" disabled={!exportIds.length} onClick={() => void c.exportRows(exportIds)}>
          导出 Markdown
        </Button>
        <Button size="sm" disabled={!exportIds.length} onClick={() => void c.exportRows(exportIds, true)}>
          整理成笔记
        </Button>
      </div>
      {rows.slice(0, limit).map((row, index) => (
        <div key={row.id}>
          {sort === "page" && (index === 0 || rows[index - 1].page_index !== row.page_index) ? (
            <h3 className="sticky top-0 bg-wb-panel py-1 text-[0.75rem]">第 {row.page_index + 1} 页</h3>
          ) : null}
          <AnnotationCard
            row={row}
            links={canvasLinks?.filter((link) => link.annotation_id === row.id)}
            addToCanvas={addToCanvas}
            openCanvas={openCanvas}
            controller={c}
            jump={() => {
              jump(row);
              c.setFlash(row.id);
            }}
          />
        </div>
      ))}
      {rows.length > limit ? <Button onClick={() => setLimit(limit + 60)}>显示更多批注</Button> : null}
      {!rows.length ? <p className="text-wb-text-3">还没有匹配的批注。选中原文即可开始。</p> : null}
    </div>
  );
}
