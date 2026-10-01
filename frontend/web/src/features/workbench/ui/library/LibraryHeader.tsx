import { useRef, useState, type ChangeEvent } from "react";
import { ChevronDown, ChevronRight, Download, X } from "lucide-react";
import type { ImportPayload, ImportPlan } from "@/platform/contracts/research-library.js";
import { Button } from "@/ui/wb/Button.js";
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger, PopoverAnchor, PopoverContent, PopoverRoot } from "@/ui/wb/Menu.js";
import { Segmented } from "@/ui/wb/Segmented.js";
import { groupLabel } from "../../domain/groups.js";
import type { Density, ListLayout } from "../../domain/workbench-store.js";
import { openPdfPicker } from "../import/pdf-picker.js";
import { useWb, useWorkbench } from "../context.js";

const VIEW_TITLE = { all: "全部文献", unread: "待读", starred: "星标", recent: "最近阅读", unfiled: "未分组", trash: "回收站" } as const;

/** CSL JSON array, or Zotero Web API items (array of {key, data}). */
function payloadOf(text: string, fileName: string): ImportPayload {
  const data = JSON.parse(text);
  const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : null;
  if (!items) throw new Error("文件里没有文献条目：需要 CSL JSON 数组或 Zotero 导出的条目列表。");
  const zotero = items.some((entry: Record<string, unknown>) => entry && typeof entry === "object" && "data" in entry && "key" in entry);
  return { format: zotero ? "zotero-api" : "csl-json", source_id: "file:" + fileName, data: items, collections: zotero ? data?.collections ?? [] : undefined };
}

function JsonImport() {
  const wb = useWorkbench();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ payload: ImportPayload; plan: ImportPlan; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const payload = payloadOf(await file.text(), file.name);
      setPending({ payload, plan: await wb.api.previewImport(payload), name: file.name });
    } catch (error) {
      wb.notify(error instanceof Error ? error.message : "无法读取这个文件。", "error");
    }
  }

  async function commit() {
    if (!pending) return;
    setBusy(true);
    try {
      const result = await wb.api.commitImport(pending.payload, pending.plan.plan_hash);
      wb.notify(`导入完成：新增 ${result.created_items} 篇，更新 ${result.updated_items} 篇`, "success");
      setPending(null);
      await wb.refreshAll();
    } catch (error) {
      wb.notify(error instanceof Error ? error.message : "导入失败。", "error");
    } finally {
      setBusy(false);
    }
  }

  const counts = pending?.plan.counts;
  return (
    <PopoverRoot open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
      <PopoverAnchor asChild>
        <span>
          <input ref={input} type="file" hidden accept=".json,application/json" onChange={onFile} />
          <MenuRoot>
            <MenuTrigger asChild>
              <Button variant="primary" icon={<Download size={13} aria-hidden="true" />}>
                导入
                <ChevronDown size={12} strokeWidth={2.4} aria-hidden="true" />
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem onSelect={openPdfPicker}>PDF 文件…</MenuItem>
              <MenuItem onSelect={() => { if (input.current) { input.current.value = ""; input.current.click(); } }}>Zotero / CSL JSON…</MenuItem>
              <MenuSeparator />
              <MenuItem disabled>浏览器 Zotero Connector 保存会自动出现在这里</MenuItem>
            </MenuContent>
          </MenuRoot>
        </span>
      </PopoverAnchor>
      <PopoverContent align="end" className="w-[340px] p-3.5 text-[12.5px]">
        <p className="m-0 font-semibold">导入预览 · {pending?.name}</p>
        {counts ? (
          <p className="m-0 mt-1.5 text-wb-text-2">
            {counts.items} 篇文献 · {counts.collections} 个分组 · {counts.tags} 个标签 · {counts.notes + counts.annotations} 条笔记
          </p>
        ) : null}
        {pending?.plan.warnings.length ? (
          <ul className="m-0 mt-2 max-h-28 list-disc overflow-auto pl-4 text-[12px] text-wb-warn">
            {pending.plan.warnings.slice(0, 8).map((warning, index) => <li key={index}>{warning.message}</li>)}
          </ul>
        ) : null}
        <p className="m-0 mt-2 text-[12px] text-wb-text-3">重复导入同一来源不会产生重复条目；导入后可在批次记录里回滚。</p>
        <div className="mt-3 flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setPending(null)}>取消</Button>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void commit()}>{busy ? "导入中…" : "确认导入"}</Button>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}

export function LibraryHeader() {
  const wb = useWorkbench();
  const view = useWb((state) => state.view);
  const groupId = useWb((state) => state.groupId);
  const tag = useWb((state) => state.tag);
  const query = useWb((state) => state.query);
  const groups = useWb((state) => state.list.result?.groups ?? []);
  const total = useWb((state) => state.list.result?.total ?? null);
  const layout = useWb((state) => state.layout);
  const density = useWb((state) => state.density);

  const title = groupId ? groupLabel(groups, groupId) : tag ? `#${tag}` : VIEW_TITLE[view];
  const crumb = groupId ? "分组" : tag ? "标签" : "文献库";
  return (
    <>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-wb-line px-3.5">
        <span className="text-wb-text-3">{crumb}</span>
        <ChevronRight size={12} strokeWidth={2.2} aria-hidden="true" className="text-wb-text-3" />
        <h1 className="m-0 min-w-0 wb-truncate text-[13.5px] font-semibold">{title}</h1>
        <span className="wb-numeric rounded bg-wb-chip px-1.5 text-[11.5px] leading-[18px] text-wb-text-2">{total ?? "…"}</span>
        <span className="flex-1" />
        <Segmented<ListLayout>
          label="排列方式"
          value={layout}
          onChange={(value) => wb.setPrefs({ layout: value })}
          options={[{ value: "list", label: "列表" }, { value: "grouped", label: "按分组", title: "按分组分段显示；一篇文献会出现在它所属的每个分组下" }]}
        />
        <Segmented<Density>
          label="行密度"
          value={density}
          onChange={(value) => wb.setPrefs({ density: value })}
          options={[{ value: "bilingual", label: "双语", title: "第二行显示中文题名" }, { value: "compact", label: "紧凑" }]}
        />
        <JsonImport />
      </div>
      {groupId || tag || query ? (
        <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-wb-line bg-wb-panel-2 px-3.5">
          {[groupId && ["分组", "包含", groupLabel(groups, groupId), () => wb.browse({ view, tag, query })],
            tag && ["标签", "是", tag, () => wb.browse({ view, groupId, query })],
            query && ["搜索", "", `“${query}”`, () => wb.browse({ view, groupId, tag })]]
            .filter(Boolean)
            .map((entry) => {
              const [key, op, value, clear] = entry as [string, string, string, () => void];
              return (
                <span key={key} className="inline-flex h-6 items-center gap-1.5 rounded-[5px] border border-wb-line-strong bg-wb-panel pl-2 pr-0.5 text-[12px]">
                  <span className="text-wb-text-3">{key}</span>
                  {op ? <span className="text-wb-text-3">{op}</span> : null}
                  <span className="max-w-[260px] wb-truncate">{value}</span>
                  <button type="button" aria-label={`移除${key}条件`} onClick={clear} className="inline-flex h-4 w-4 items-center justify-center rounded-sm border-0 bg-transparent text-wb-text-3 hover:bg-wb-hover">
                    <X size={10} strokeWidth={2.6} aria-hidden="true" />
                  </button>
                </span>
              );
            })}
          <span className="flex-1" />
          <span className="wb-numeric text-[11.5px] text-wb-text-3">{total ?? "…"} 篇</span>
        </div>
      ) : null}
    </>
  );
}
