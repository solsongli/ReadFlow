import { blocksApi } from "@/features/paper-blocks/index.js";
import { createHeadlessTranslationSettings } from "@/features/credentials/domain.js";
import { loadDeveloperStoredConfig } from "@/platform/config/persisted-config.js";
import type { WorkbenchApi } from "@/platform/api/workbench.js";
import type { WorkbenchStore } from "../domain/workbench-store.js";
import { translationPayload, translationReady } from "../domain/translation.js";
import type { createTranslations } from "./translations.js";

export function createAutoTranslation({
  store,
  api,
  notify,
  now = Date.now,
  client = blocksApi,
  config = async () => ({
    draft: await createHeadlessTranslationSettings().load(),
    saved: loadDeveloperStoredConfig(),
  }),
}: {
  store: WorkbenchStore;
  api: WorkbenchApi;
  now?: () => number;
  client?: typeof blocksApi;
  notify: (text: string, tone?: "info" | "success" | "error", action?: () => void, label?: string) => void;
  config?: NonNullable<Parameters<typeof createTranslations>[0]["loadConfig"]>;
}) {
  const queue = new Set<string>(),
    seen = new Set<string>();
  let since = now(),
    scanned = 0,
    enabled = store.getSnapshot().autoTranslateImports,
    busy = false,
    disposed = false;
  let current: { item: string; title: string; id: string; client: ReturnType<typeof blocksApi> } | undefined;
  let epoch = 0;
  const display = (message = "") =>
    store.actions.patch({
      autoTranslation: {
        queued: queue.size,
        running: Boolean(current),
        message,
        itemId: current?.item,
      },
    });
  function enqueue(id: string) {
    if (!store.getSnapshot().autoTranslateImports || seen.has(id)) return;
    seen.add(id);
    queue.add(id);
    display(current ? `正在翻译《${current.title}》` : "等待空闲时自动翻译");
  }
  async function cancel() {
    epoch++;
    since = now();
    scanned = 0;
    queue.clear();
    if (current) {
      try {
        await current.client.cancel(current.id);
      } catch {
        notify("取消自动翻译失败，请重试。", "error", () => void cancel(), "重试");
        return;
      }
    }
    current = undefined;
    display("自动翻译队列已取消");
  }
  async function tick(idle = true) {
    if (busy || disposed) return;
    const state = store.getSnapshot();
    if (state.autoTranslateImports !== enabled) {
      enabled = state.autoTranslateImports;
      since = now();
      scanned = 0;
      if (!enabled) {
        queue.clear();
        display("已关闭后续自动翻译");
      }
    }
    if (!enabled && !current) return;
    busy = true;
    const generation = epoch;
    try {
      if (current) {
        const running = current;
        const status = await running.client.status();
        if (current !== running || generation !== epoch) return;
        const job = (status.jobs || [status.job]).find((j: { id: string } | null) => j?.id === running.id);
        if (!job) {
          current = undefined;
          display("任务已中断，可在阅读器中重试");
          return;
        }
        if (job && ["done", "failed", "cancelled"].includes(job.status)) {
          notify(
            job.status === "done"
              ? `《${current.title}》自动翻译完成`
              : job.error?.message || "自动翻译已取消",
            "info",
          );
          current = undefined;
          display();
        } else {
          display(`《${current.title}》${job?.phase || "翻译中"} ${job?.percent || 0}%`);
          return;
        }
      }
      if (!enabled || !idle) return;
      if (now() - scanned > 15000) {
        scanned = now();
        const result = await api.list({ view: "all", sort: "added", order: "desc", query: "" });
        for (const row of result.items) {
          if (row.attachment_id && Date.parse(row.created_at) >= since && !row.deleted_at) enqueue(row.id);
        }
      }
      const id = queue.values().next().value;
      if (!id) return;
      queue.delete(id);
      const row = await api.row(id);
      if (!row.attachment_id || row.deleted_at) {
        display();
        return;
      }
      const blocks = client(id, row.attachment_id, state.blockLanguage);
      const existing = await blocks.status();
      if (existing.has_translation) {
        display();
        return;
      }
      if (
        (existing.jobs || []).some((j: { status: string }) =>
          ["queued", "running", "cancelling"].includes(j.status),
        )
      ) {
        queue.add(id);
        display("等待当前翻译任务完成");
        return;
      }
      const { draft, saved } = await config();
      if (!translationReady(draft)) throw new Error("自动翻译未开始：请先配置翻译服务。");
      if (disposed || !store.getSnapshot().autoTranslateImports) return;
      const job = await blocks.start({
        attachment_id: row.attachment_id,
        language: state.blockLanguage,
        image_text: state.blockImageText,
        density: state.layoutDensity,
        translation: {
          ...translationPayload(draft, saved).translation,
          disable_thinking: state.translationDisableThinking,
        },
      });
      if (generation !== epoch || disposed || !store.getSnapshot().autoTranslateImports) {
        await blocks.cancel(job.id);
        return;
      }
      current = { item: id, title: row.title, id: job.id, client: blocks };
      display(`正在翻译《${row.title}》`);
      notify(`已开始自动翻译《${row.title}》`, "info", () => void cancel(), "取消自动翻译");
    } catch (error) {
      queue.clear();
      const message = error instanceof Error ? error.message : "自动翻译暂不可用，请检查设置。";
      display(message);
      notify(message, "info");
    } finally {
      busy = false;
    }
  }
  return {
    enqueue,
    tick,
    cancel,
    dispose: () => {
      disposed = true;
      queue.clear();
    },
  };
}
