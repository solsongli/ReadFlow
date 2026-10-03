import { cloneElement, isValidElement, useRef, useState, type ReactNode, type ChangeEvent, type ButtonHTMLAttributes } from "react";
import { Plus } from "lucide-react";
import type { ImportPayload, ImportPlan } from "@/platform/contracts/research-library.js";
import { Button, IconButton } from "@/ui/wb/Button.js";
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger, PopoverAnchor, PopoverContent, PopoverRoot } from "@/ui/wb/Menu.js";
import { payloadOf } from "../../domain/import.js";
import { useWorkbench } from "../context.js";
import { openPdfPicker } from "./pdf-picker.js";

export function ImportMenu({ children, onImported, directJson = false }: { children?: ReactNode; onImported?: () => void; directJson?: boolean }) {
  const wb = useWorkbench();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ payload: ImportPayload; plan: ImportPlan; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
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
      onImported?.();
    } catch (error) {
      wb.failure(error, commit);
    } finally {
      setBusy(false);
    }
  }

  const counts = pending?.plan.counts;
  return (
    <PopoverRoot open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
      <PopoverAnchor asChild>
        <span className={children ? "block h-full min-w-0" : "inline-flex h-7 min-w-0 items-center justify-center"}>
          <input ref={input} type="file" hidden accept=".json,application/json" onChange={onFile} />
          {directJson && isValidElement<ButtonHTMLAttributes<HTMLButtonElement>>(children) ? cloneElement(children, { onClick: () => input.current?.click() }) : <MenuRoot>
            <MenuTrigger asChild>
              {children ?? <IconButton label="导入" title="导入 PDF、Zotero / CSL JSON">
                <Plus size={18} strokeWidth={1.7} aria-hidden="true" />
              </IconButton>}
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem onSelect={openPdfPicker}>PDF 文件…</MenuItem>
              <MenuItem onSelect={() => { if (input.current) { input.current.value = ""; input.current.click(); } }}>Zotero / CSL JSON…</MenuItem>
              <MenuSeparator />
              <MenuItem disabled>浏览器 Zotero Connector 保存会自动出现在这里</MenuItem>
            </MenuContent>
          </MenuRoot>}
        </span>
      </PopoverAnchor>
      <PopoverContent align="end" className="w-[340px] p-3.5 text-[0.78125rem]">
        <p className="m-0 font-semibold">导入预览 · {pending?.name}</p>
        {counts ? (
          <p className="m-0 mt-1.5 text-wb-text-2">
            {counts.items} 篇文献 · {counts.collections} 个分组 · {counts.tags} 个标签 · {counts.notes + counts.annotations} 条笔记
          </p>
        ) : null}
        {pending?.plan.warnings.length ? (
          <ul className="m-0 mt-2 max-h-28 list-disc overflow-auto pl-4 text-[0.75rem] text-wb-warn">
            {pending.plan.warnings.slice(0, 8).map((warning, index) => <li key={index}>{warning.message}</li>)}
          </ul>
        ) : null}
        <p className="m-0 mt-2 text-[0.75rem] text-wb-text-3">重复导入同一来源不会产生重复条目；导入后可在批次记录里回滚。</p>
        <div className="mt-3 flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setPending(null)}>取消</Button>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void commit()}>{busy ? "导入中…" : "确认导入"}</Button>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
