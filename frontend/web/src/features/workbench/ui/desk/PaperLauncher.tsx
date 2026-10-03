import { useEffect, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import type { WorkbenchRow } from "@/platform/contracts/workbench.js";
import { Button } from "@/ui/wb/Button.js";
import { PopoverContent, PopoverRoot, PopoverTrigger } from "@/ui/wb/Menu.js";
import { AI_HINT, TRANSLATE_HINT } from "../../domain/desk.js";
import { rowMetadata } from "../../domain/presentation.js";
import { useWorkbench } from "../context.js";

export function PaperLauncher({ kind, children, open: controlledOpen, onOpenChange }: {
  kind: "translate" | "ai" | "note"; children: ReactNode; open?: boolean; onOpenChange?: (value: boolean) => void;
}) {
  const wb = useWorkbench();
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = onOpenChange ?? setLocalOpen;
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<WorkbenchRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) { setQuery(""); return; }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    wb.api.list({ view: "all", query, sort: "added", order: "desc" }, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setRows(result.items); })
      .catch(() => { if (!controller.signal.aborted) setError("文献没有加载出来，请重试。"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, query, retry, wb]);
  async function launch(row: WorkbenchRow) {
    setOpening(true);
    try {
      if (kind === "note") { await wb.notes.createFor(row); setOpen(false); }
      else if (await wb.openReader(row.id)) {
        setOpen(false);
        if (kind === "ai") wb.notify(AI_HINT);
      }
    } finally { setOpening(false); }
  }
  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" aria-label={kind === "note" ? "选择文献新建笔记" : kind === "translate" ? "选择文献翻译" : "选择文献进行 AI 伴读"} onCloseAutoFocus={(event) => { if (kind === "note") event.preventDefault(); }} className="w-[440px] max-w-[calc(100vw-24px)] p-4">
        <h2 className="m-0 text-[0.9375rem] font-semibold">{kind === "note" ? "为哪篇文献记录笔记？" : kind === "translate" ? "翻译 PDF" : "AI 伴读"}</h2>
        <p className="mb-3 mt-2 text-[0.75rem] leading-relaxed text-wb-text-3">{kind === "note" ? "笔记会与所选文献保存在一起。" : kind === "translate" ? TRANSLATE_HINT : AI_HINT}</p>
        <label className="flex h-8 items-center gap-2 rounded-lg bg-wb-fill px-2.5 text-wb-text-3">
          <Search size={14} aria-hidden="true" />
          <input aria-label="查找文献" placeholder="搜索题名或作者" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-wb-text outline-none" />
        </label>
        <div className="wb-scroll mt-2 max-h-[min(340px,45vh)]" aria-busy={loading}>
          {loading ? <p className="py-3 text-wb-text-3">正在查找文献…</p> : error ? <p role="status" className="py-2 text-wb-text-3">{error} <Button size="sm" onClick={() => setRetry(retry + 1)}>重试</Button></p> : rows.length ? rows.map((row) => (
            <button key={row.id} type="button" disabled={(kind !== "note" && !row.attachment_id) || opening} onClick={() => void launch(row)} className="wb-transition flex w-full flex-col gap-1 rounded-lg border-0 bg-transparent px-2 py-2.5 text-left hover:bg-wb-hover disabled:cursor-not-allowed disabled:opacity-50">
              <span className="line-clamp-2 text-[0.8125rem] font-medium" title={row.title}>{row.title}</span>
              {rowMetadata(row) ? <span className="wb-truncate max-w-full text-[0.75rem] text-wb-text-3">{rowMetadata(row)}</span> : null}
              {kind !== "note" && !row.attachment_id ? <span className="text-[0.75rem] text-wb-text-3">没有 PDF 附件</span> : null}
            </button>
          )) : <p className="py-3 text-wb-text-3">{query ? "没有匹配的文献。" : kind === "note" ? "先导入一篇文献，再记录笔记。" : "先导入一篇 PDF，再开始阅读。"}</p>}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
