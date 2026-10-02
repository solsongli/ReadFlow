import type { WorkbenchApi } from "@/platform/api/workbench.js";
import { pdfFiles } from "../domain/resilience.js";

export function createPdfImporter({ api, group, notify, failure, refresh }: {
  api: WorkbenchApi; group: () => string | null; refresh: () => Promise<void>;
  notify: (message: string, tone?: "info" | "success" | "error") => void;
  failure: (error: unknown, retry: () => Promise<unknown>) => void;
}) {
  return async (files: File[]) => {
    const pdfs = pdfFiles(files), ignored = files.length - pdfs.length;
    if (!pdfs.length) { notify("仅支持 PDF 文件，未导入其他文件。"); return; }
    let imported = 0;
    const pending: Array<() => Promise<void>> = [];
    const completed = () => notify(`已导入 ${imported} 个 PDF${ignored ? `，已忽略 ${ignored} 个非 PDF 文件` : ""}`, "success");
    const failedMessage = (error: unknown) => new Error(`${pending.length} 个 PDF 未能导入：${error instanceof Error ? error.message : "请重试。"}`);
    for (const file of pdfs) {
      let itemId: string | null = null;
      const groupId = group();
      pending.push(async () => {
        if (!itemId) { const result = await api.upload(file); itemId = result.item?.id ?? null; }
        if (groupId && itemId) await api.changeGroup(groupId, [itemId]);
      });
    }
    async function attempt() {
      let lastError: unknown;
      for (const submit of [...pending]) {
        try { await submit(); imported++; pending.splice(pending.indexOf(submit), 1); }
        catch (error) { lastError = error; }
      }
      await refresh();
      if (pending.length) throw failedMessage(lastError);
      completed();
    }
    // One retry action retains the entire failed batch; successful files are never resubmitted.
    try { await attempt(); } catch (error) { failure(error, attempt); }
  };
}
