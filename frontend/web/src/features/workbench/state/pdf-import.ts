import type { WorkbenchApi } from "@/platform/api/workbench.js";
import { pdfFiles } from "../domain/resilience.js";

export function createPdfImporter({ api, group, notify, failure, refresh, select, imported: onImported }: {
  imported?: (id: string) => void;
  select?: (id: string) => Promise<unknown> | void;
  api: WorkbenchApi; group: () => string | null; refresh: () => Promise<void>;
  notify: (message: string, tone?: "info" | "success" | "error") => void;
  failure: (error: unknown, retry: () => Promise<unknown>) => void;
}) {
  return async (files: File[]) => {
    const pdfs = pdfFiles(files), ignored = files.length - pdfs.length;
    if (!pdfs.length) { notify("仅支持 PDF 文件，未导入其他文件。"); return; }
    let imported = 0, duplicates = 0;
    let duplicateItem: { id: string; title: string } | null = null;
    const pending: Array<() => Promise<void>> = [];
    const completed = () => {
      const text = pdfs.length === 1 && duplicateItem ? `《${duplicateItem.title}》已在文献库中`
        : [imported ? `已导入 ${imported} 个 PDF` : "", duplicates ? `${duplicates} 篇已存在` : ""].filter(Boolean).join("，");
      notify(text + (ignored ? `，已忽略 ${ignored} 个非 PDF 文件` : ""), duplicates && !imported ? "info" : "success");
    };
    const failedMessage = (error: unknown) => new Error(`${pending.length} 个 PDF 未能导入：${error instanceof Error ? error.message : "请重试。"}`);
    for (const file of pdfs) {
      let itemId: string | null = null;
      let duplicate = false, title = file.name;
      const groupId = group();
      pending.push(async () => {
        if (!itemId) { const result = await api.upload(file); itemId = result.item?.id ?? null; duplicate = result.duplicate === true; title = result.item?.title || file.name; }
        if (groupId && itemId) await api.changeGroup(groupId, [itemId]);
        if (duplicate && itemId) { duplicates++; duplicateItem = { id: itemId, title }; }
        else { imported++; if (itemId) onImported?.(itemId); }
      });
    }
    async function attempt() {
      let lastError: unknown;
      for (const submit of [...pending]) {
        try { await submit(); pending.splice(pending.indexOf(submit), 1); }
        catch (error) { lastError = error; }
      }
      await refresh();
      if (duplicateItem) await select?.(duplicateItem.id);
      if (pending.length) throw failedMessage(lastError);
      completed();
    }
    // One retry action retains the entire failed batch; successful files are never resubmitted.
    try { await attempt(); } catch (error) { failure(error, attempt); }
  };
}
