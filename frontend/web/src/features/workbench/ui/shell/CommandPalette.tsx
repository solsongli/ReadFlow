import { SHORTCUTS, shortcutKeys } from "../../domain/shortcuts.js";
import { stepTextScale } from "../../domain/typography.js";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Armchair, BookOpen, Bookmark, FileQuestion, FileUp, Folder, FolderPlus, Languages, Library, Link2, ListTodo, Monitor, NotebookPen, PanelTop, ScanText, Search, Settings, Star, Trash2, Type, X } from "lucide-react";
import type { WorkbenchRow } from "@/platform/contracts/workbench.js";
import { cn } from "@/ui/lib/utils.js";
import { IconButton } from "@/ui/wb/Button.js";
import { groupLabel } from "../../domain/groups.js";
import type { Workbench } from "../../state/controller.js";
import { openPdfPicker } from "../import/pdf-picker.js";
import { requestNewTodo } from "@/features/todos/index.js";
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
    { key: "shortcuts", label: "键盘快捷键", hint: shortcutKeys("shortcuts"), words: "shortcuts kuaijiejian 键盘", run: () => wb.setShortcuts(true) },
    { key: "notes-space", label: "打开笔记", words: "notes biji 批注", run: () => void wb.notes.open() },
    { key: "new-note", label: "新建笔记", hint: shortcutKeys("new-note"), words: "new note xinjian biji", run: () => void wb.notes.create() },
    { key: "new-todo", label: "新建待办", words: "todo daiban 待办 任务 task", run: () => { wb.setMain("desk"); requestNewTodo(); } },
    { key: "translate", label: "翻译所选文献", words: "translate fanyi", run: () => void wb.translations.start(wb.store.getSnapshot().selectedIds) },
    { key: "settings", label: "打开设置…", hint: shortcutKeys("settings"), words: "settings shezhi", run: () => wb.openSettings() },
    { key: "glossaries", label: "管理术语表", words: "glossary shuyubiao", run: () => wb.openSettings("glossaries") },
    { key: "desk", label: "打开书桌", hint: shortcutKeys("desk"), words: "desk shuzhuo 书桌 首页", run: () => wb.setMain("desk") },
    { key: "library", label: "打开文献库", hint: shortcutKeys("library"), words: "library wenxian 全部", run: () => wb.browse({}) },
    { key: "unread", label: "查看待读", words: "unread daidu", run: () => wb.browse({ view: "unread" }) },
    { key: "starred", label: "查看星标", words: "star xingbiao", run: () => wb.browse({ view: "starred" }) },
    { key: "unfiled", label: "查看未分组的文献", words: "unfiled weifenzu", run: () => wb.browse({ view: "unfiled" }) },
    { key: "trash", label: "查看回收站", words: "trash huishouzhan", run: () => wb.browse({ view: "trash" }) },
    { key: "notes", label: "查看有笔记的文献", words: "notes biji 批注", run: () => wb.browse({ view: "notes", query: "" }) },
    { key: "needs_ocr", label: "查看需要 OCR 的文献", words: "ocr 扫描", run: () => wb.browse({ view: "needs_ocr", query: "" }) },
    { key: "missing_doi", label: "查看缺少 DOI 的文献", words: "doi 缺少", run: () => wb.browse({ view: "missing_doi", query: "" }) },
    { key: "no_zh_title", label: "查看没有中文题名的文献", words: "中文 题名 翻译", run: () => wb.browse({ view: "no_zh_title", query: "" }) },
    { key: "import", label: "导入 PDF…", words: "import pdf daoru", run: () => openPdfPicker() },
    { key: "group", label: "新建分组…", words: "new group xinjian fenzu", run: () => { wb.browse({}); wb.store.actions.patch({ groupDraft: { parentId: null }, sidebarCollapsed: false }); } },
    { key: "theme", label: "切换浅色 / 深色", words: "theme dark light zhuti", run: () => wb.setPrefs({ theme: wb.store.getSnapshot().theme === "dark" ? "light" : "dark" }) },
    ...([['text-larger', 1], ['text-smaller', -1], ['text-reset', 0]] as const).map(([key, direction]) => ({ key,
      label: SHORTCUTS.find((entry) => entry.id === key)!.label, hint: shortcutKeys(key), words: "字体 文字 大小 字号 font size",
      run: () => wb.setPrefs({ textScale: stepTextScale(wb.store.getSnapshot().textScale, direction) }) })),
  ];
}

export function CommandPalette() {
  const wb = useWorkbench();
  const open = useWb((state) => state.paletteOpen);
  const groups = useWb((state) => state.list.result?.groups ?? []);
  const [query, setQuery] = useState("");
  const [papers, setPapers] = useState<WorkbenchRow[]>([]);
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => previous?.focus();
  }, [open]);

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
        .then((result) => { if (!controller.signal.aborted) setPapers(result.items.slice(0, 8)); })
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

  const COMMAND_ICON = { translate: Languages, shortcuts: PanelTop, settings: Settings, glossaries: BookOpen, desk: Armchair, library: Library, unread: Bookmark, starred: Star, unfiled: FileQuestion,
    "text-larger": Type, "text-smaller": Type, "text-reset": Type,
    trash: Trash2, import: FileUp, group: FolderPlus, theme: Monitor,
    notes: NotebookPen, "notes-space": NotebookPen, "new-note": NotebookPen, "new-todo": ListTodo, needs_ocr: ScanText, missing_doi: Link2, no_zh_title: Languages };


  return (
    <div className="fixed inset-0 z-50 bg-wb-overlay" onMouseDown={(event) => event.target === event.currentTarget && wb.setPalette(false)}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="命令与搜索"
        onKeyDown={(event) => {
          if (event.key === "Escape") wb.setPalette(false);
          if (event.key !== "Tab") return;
          const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("input,button"));
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}
        className="mx-auto mt-[12vh] w-[620px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border-0 bg-wb-panel shadow-wb-pop">
        <label className="flex h-14 items-center gap-3 border-b border-wb-line-soft px-4 text-wb-text-3">
          <Search size={16} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索题名（中英）、作者、DOI、引用键，或输入命令"
            role="combobox"
            aria-expanded="true"
            aria-controls="wb-command-results"
            aria-activedescendant={entries[index] ? `wb-command-${index}` : undefined}
            aria-autocomplete="list"
            aria-label="搜索或输入命令"
            className="h-full flex-1 border-0 bg-transparent text-[0.84375rem] text-wb-text outline-none"
          />
          <IconButton label="关闭命令面板" title="关闭（Esc）" onClick={() => wb.setPalette(false)}><X size={15} aria-hidden="true" /></IconButton>
        </label>
        <ul id="wb-command-results" ref={listRef} role="listbox" aria-label="结果" className="wb-scroll m-0 max-h-[min(380px,60vh)] list-none p-2">
          {entries.length === 0 ? <li className="px-3 py-6 text-center text-wb-text-3">没有匹配的文献或命令</li> : null}
          {entries.map((entry, position) => {
            const Icon = entry.kind === "paper" ? BookOpen : entry.kind === "group" ? Folder : COMMAND_ICON[entry.key as keyof typeof COMMAND_ICON];
            return (
              <li id={`wb-command-${position}`} key={entry.key} role="option" aria-selected={position === index} data-index={position}>
                <button
                  type="button"
                  title={entry.kind === "paper" ? "Enter 定位到文献库；Shift Enter 直接阅读" : entry.hint}
                  onMouseEnter={() => setIndex(position)}
                  onClick={(event) => entry.run(event.shiftKey)}
                  className={cn(
                    "wb-transition flex w-full items-center gap-3 rounded-lg border-0 px-3 py-2.5 text-left",
                    position === index ? "bg-wb-accent-soft" : "bg-transparent",
                  )}
                >
                  <Icon size={14} aria-hidden="true" className="shrink-0 text-wb-text-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block wb-truncate text-wb-text">{entry.label}</span>
                    {entry.hint && entry.kind === "paper" ? <span className="block wb-truncate text-[0.75rem] text-wb-text-3">{entry.hint}</span> : null}
                  </span>
                  {entry.hint && entry.kind !== "paper" ? <span className="shrink-0 text-[0.71875rem] text-wb-text-3">{entry.hint}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>

      </div>
    </div>
  );
}
