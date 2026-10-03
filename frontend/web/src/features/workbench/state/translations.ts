import { createHeadlessTranslationSettings } from "@/features/credentials/domain.js";
import { loadDeveloperStoredConfig } from "@/platform/config/persisted-config.js";
import type { WorkbenchApi } from "@/platform/api/workbench.js";
import type { TranslationState, WorkbenchRow, TranslationResult, TranslationError } from "@/platform/contracts/workbench.js";
import type { WorkbenchStore } from "../domain/workbench-store.js";
import { mergeReaderRow } from "../domain/reader-state.js";
import { activeTranslation, translationPayload, translationReady } from "../domain/translation.js";

export function createTranslations({ api, store, notify, openReader, refreshDesk, loadConfig = async () => ({ draft: await createHeadlessTranslationSettings().load(), saved: loadDeveloperStoredConfig() }) }: {
  api: WorkbenchApi; store: WorkbenchStore; openReader: (id: string) => Promise<unknown>; refreshDesk: () => Promise<void>;
  notify: (text: string, tone?: "success" | "info" | "error", action?: () => void, label?: string) => void;
  loadConfig?: () => Promise<{ draft: import("@/features/credentials/domain.js").TranslationDraft; saved: Record<string, unknown> }>;
}) {
  const tracked = new Map<string, WorkbenchRow>();
  const busy = new Set<string>();
  let polling = false;
  function rows() {
    const state = store.getSnapshot(), desk = state.desk.data;
    return [...(state.list.result?.items ?? []), ...(desk?.continue_reading ?? []), ...(desk?.to_read ?? []), ...(desk?.recent_items ?? []), ...state.tabs.flatMap((tab) => tab.row ? [tab.row] : []), ...tracked.values()];
  }
  function issue(itemId: string, error: TranslationError) { store.actions.patch({ translationIssue: { itemId, error } }); }
  async function apply(id: string, result: TranslationResult, submitted = false) {
    if (result.error) { issue(id, result.error); return false; }
    if (!result.translation) { issue(id, { code: "protocol", message: "翻译服务没有返回有效任务，请重试。" }); return false; }
    const old = tracked.get(id) ?? rows().find((row) => row.id === id) ?? await api.row(id);
    const latest = rows().find((row) => row.id === id) ?? old;
    const row = { ...latest, translation: result.translation };
    tracked.set(id, row);
    store.actions.patch(mergeReaderRow(store.getSnapshot(), row));
    const desk = store.getSnapshot().desk;
    if (desk.data?.translation) {
      const summary = desk.data.translation;
      const running = summary.running.filter((entry) => entry.item_id !== id);
      if (row.translation.status === "running") running.push({ item_id: id, title: row.title, title_translated: row.title_translated, percent: row.translation.percent ?? null, stage: row.translation.stage });
      store.actions.patch({ desk: { ...desk, data: { ...desk.data, translation: { ...summary, running,
        queued: Math.max(0, summary.queued + Number(row.translation.status === "queued") - Number(old.translation.status === "queued")) } } } });
    }
    if (!submitted && activeTranslation(old.translation) && row.translation.status === "done") {
      notify(`《${row.title}》翻译完成`, "success", () => void openReader(id), "对照阅读");
      await refreshDesk();
    }
    if (!submitted && activeTranslation(old.translation) && row.translation.status === "failed" && row.translation.error?.code !== "cancelled") {
      issue(id, row.translation.error ?? { code: "other", message: "翻译失败或已取消，请重试。" });
      await refreshDesk();
    }
    return true;
  }
  async function start(ids: string[]) {
    if (!ids.length) { notify("请先在文献库选择要翻译的文献。", "info"); return false; }
    let count = 0;
    for (const id of new Set(ids)) {
      if (busy.has(id)) continue;
      busy.add(id); store.actions.patch({ translatingIds: [...busy], translationIssue: undefined });
      try {
        const { draft, saved } = await loadConfig();
        if (!translationReady(draft)) { issue(id, { code: "unconfigured", message: "还没有配置翻译服务", settings: "translation" }); break; }
        const row = rows().find((entry) => entry.id === id) ?? await api.row(id);
        if (!row.attachment_id) { issue(id, { code: "no_pdf", message: "这篇文献没有 PDF 附件。" }); continue; }
        tracked.set(id, row);
        const result = await api.translate(id, translationPayload(draft, saved));
        if (await apply(id, result, true)) { count++; notify(result.reused ? "这篇文献已有翻译任务，正在跟踪进度。" : result.needs_ocr ? "已提交翻译；将先在本机识别缺字页面。" : "已提交全文翻译。", "info"); }
        else break;
        await refreshDesk();
      } catch { issue(id, { code: "network", message: "无法连接本地翻译服务，请重试。", settings: "translation" }); }
      finally { busy.delete(id); store.actions.patch({ translatingIds: [...busy] }); }
    }
    return count > 0;
  }
  async function poll() {
    if (polling || !api.translationStatus) return;
    polling = true;
    try {
      const candidates = new Map(rows().filter((row) => activeTranslation(row.translation)).map((row) => [row.id, row]));
      await Promise.all([...candidates].map(async ([id, row]) => {
        if (busy.has(id)) return;
        if (!tracked.has(id)) tracked.set(id, row);
        try { await apply(id, await api.translationStatus(id)); } catch { /* Keep the last state and retry on next tick. */ }
      }));
    } finally { polling = false; }
  }
  async function cancel(id: string) {
    try {
      const result = await api.cancelTranslation(id);
      if (result.error) { issue(id, { ...result.error, code: "cancel_failed", message: "取消未能完成，请重试。" }); return; }
      if (await apply(id, result)) notify("已请求取消翻译。", "info");
    }
    catch { issue(id, { code: "cancel_failed", message: "取消失败，请重试。" }); }
  }
  async function details(id: string) {
    try { const result = await api.translationStatus(id); issue(id, result.error ?? result.translation?.error ?? { code: "other", message: "任务未完成，请重试。" }); }
    catch { issue(id, { code: "network", message: "暂时无法读取错误详情，请重试。" }); }
  }
  return { start, poll, cancel, details, active: () => rows().some((row) => activeTranslation(row.translation)), clearIssue: () => store.actions.patch({ translationIssue: undefined }) };
}
