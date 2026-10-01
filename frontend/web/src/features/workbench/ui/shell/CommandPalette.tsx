import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { BookOpen, Command, Folder, Search } from "lucide-react";
import type { WorkbenchRow } from "@/platform/contracts/workbench.js";
import { cn } from "@/ui/lib/utils.js";
import { Kbd } from "@/ui/wb/Kbd.js";
import { groupLabel } from "../../domain/groups.js";
import type { Workbench } from "../../state/controller.js";
import { openPdfPicker } from "../import/pdf-picker.js";
import { useWb, useWorkbench } from "../context.js";

interface Entry {
  key: string;
  kind: "paper" | "group" | "command";
  label: string;
  hint?: string;
  run: (alternate: boolean) => void;
}

function commands(wb: Workbench): Array<Omit<Entry, "kind"> & { words: string }> {
  return [
    { key: "desk", label: "打开书桌", hint: "Ctrl 1", words: "desk shuzhuo 书桌 首页", run: () => wb.setMain("desk") },
    { key: "library", label: "打开文献库", hint: "Ctrl 2", words: "library wenxian 全部", run: () => wb.browse({}) },
    { key: "unread", label: "查看待读", words: "unread daidu", run: () => wb.browse({ view: "unread" }) },
    { key: "starred", label: "查看星标", words: "star xingbiao", run: () => wb.browse({ view: "starred" }) },
    { key: "unfiled", label: "查看未分组的文献", words: "unfiled weifenzu", run: () => wb.browse({ view: "unfiled" }) },
    { key: "trash", label: "查看回收站", words: "trash huishouzhan", run: () => wb.browse({ view: "trash" }) },
    { key: "import", label: "导入 PDF…", words: "import pdf daoru", run: () => openPdfPicker() },
    { key: "group", label: "新建分组…", words: "new group xinjian fenzu", run: () => { wb.browse({}); wb.store.actions.patch({ groupDraft: { parentId: null } }); } },
    { key: "theme", label: "切换浅色 / 深色", words: "theme dark light zhuti", run: () => wb.setPrefs({ theme: wb.store.getSnapshot().theme === "dark" ? "light" : "dark" }) },
    { key: "legacy", label: "打开旧版界面", words: "legacy old jiuban", run: () => window.location.assign("./index.html") },
  ];
}

export function CommandPalette() {
  const wb = useWorkbench();
  const open = useWb((state) => state.paletteOpen);
  const groups = useWb((state) => state.list.result?.groups ?? []);
  const [query, setQuery] = useState("");
  const [papers, setPapers] = useState<WorkbenchRow[]>([]);
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setPapers([]);
      setIndex(0);
    }
  }, [open]);

  useEffect(() => {
    const text = query.trim();
    if (!open || !text) {
      setPapers([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      wb.api
        .list({ view: "all", query: text, sort: "added", order: "desc" }, controller.signal)
        .then((result) => setPapers(result.items.slice(0, 8)))
        .catch(() => undefined);
    }, 140);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, wb]);

  const entries = useMemo<Entry[]>(() => {
    const text = query.trim().toLowerCase();
    const close = () => wb.setPalette(false);
    const paperEntries: Entry[] = papers.map((row) => ({
      key: "paper:" + row.id,
      kind: "paper",
      label: row.title,
      hint: row.title_translated || [row.year, row.venue_short].filter(Boolean).join(" · "),
      run: (alternate) => {
        close();
        if (alternate) void wb.openReader(row.id);
        else {
          wb.browse({ query: query.trim() });
          wb.select(row.id);
        }
      },
    }));
    const groupEntries: Entry[] = text
      ? groups
          .filter((group) => group.name.toLowerCase().includes(text))
          .slice(0, 5)
          .map((group) => ({
            key: "group:" + group.id,
            kind: "group",
            label: groupLabel(groups, group.id),
            hint: `${group.count} 篇`,
            run: () => {
              close();
              wb.browse({ groupId: group.id });
            },
          }))
      : [];
    const commandEntries: Entry[] = commands(wb)
      .filter((entry) => !text || entry.label.toLowerCase().includes(text) || entry.words.includes(text))
      .map(({ words: _words, run, ...entry }) => ({ ...entry, kind: "command", run: () => { close(); run(false); } }));
    return [...paperEntries, ...groupEntries, ...commandEntries];
  }, [papers, groups, query, wb]);

  useEffect(() => setIndex(0), [entries.length]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!open) return null;

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      wb.setPalette(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((value) => Math.min(entries.length - 1, value + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((value) => Math.max(0, value - 1));
    } else if (event.key === "Enter" && entries[index]) {
      event.preventDefault();
      entries[index].run(event.shiftKey);
    }
  }

  const ICON = { paper: BookOpen, group: Folder, command: Command } as const;

  return (
    <div className="fixed inset-0 z-50 bg-wb-overlay" onMouseDown={(event) => event.target === event.currentTarget && wb.setPalette(false)}>
      <div role="dialog" aria-modal="true" aria-label="命令与搜索" className="mx-auto mt-16 w-[620px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-wb-line-strong bg-wb-panel shadow-wb-pop">
        <label className="flex h-11 items-center gap-2.5 border-b border-wb-line px-3.5 text-wb-text-3">
          <Search size={16} aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索题名（中英）、作者、DOI、引用键，或输入命令"
            aria-label="搜索或输入命令"
            className="h-full flex-1 border-0 bg-transparent text-[13.5px] text-wb-text outline-none"
          />
          <Kbd>Esc</Kbd>
        </label>
        <ul ref={listRef} role="listbox" aria-label="结果" className="wb-scroll m-0 max-h-[380px] list-none p-1.5">
          {entries.length === 0 ? <li className="px-3 py-6 text-center text-wb-text-3">没有匹配的文献或命令</li> : null}
          {entries.map((entry, position) => {
            const Icon = ICON[entry.kind];
            return (
              <li key={entry.key} role="option" aria-selected={position === index} data-index={position}>
                <button
                  type="button"
                  onMouseEnter={() => setIndex(position)}
                  onClick={(event) => entry.run(event.shiftKey)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md border-0 px-2.5 py-1.5 text-left",
                    position === index ? "bg-wb-accent-soft" : "bg-transparent",
                  )}
                >
                  <Icon size={14} aria-hidden="true" className="shrink-0 text-wb-text-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block wb-truncate text-wb-text">{entry.label}</span>
                    {entry.hint && entry.kind === "paper" ? <span className="block wb-truncate text-[12px] text-wb-text-3">{entry.hint}</span> : null}
                  </span>
                  {entry.hint && entry.kind !== "paper" ? <span className="shrink-0 text-[11.5px] text-wb-text-3">{entry.hint}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex h-8 items-center gap-3 border-t border-wb-line bg-wb-panel-2 px-3.5 text-[11.5px] text-wb-text-3">
          <span className="inline-flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd>选择</span>
          <span className="inline-flex items-center gap-1"><Kbd>Enter</Kbd>定位到文献库</span>
          <span className="inline-flex items-center gap-1"><Kbd>Shift Enter</Kbd>直接阅读</span>
        </div>
      </div>
    </div>
  );
}
