import type { ResearchOcrJob, ResearchOcrModule } from "@/platform/contracts/research-library.js";
import type { WorkbenchDesk, WorkbenchRow } from "@/platform/contracts/workbench.js";

export const TRANSLATE_HINT = "选择文献后提交全文翻译；优先读取文字层，缺字页面使用本地 OCR。";
export const AI_HINT = "选择文献后，在阅读器右侧使用 AI 问答。";

export function deskSubtitle(today: WorkbenchDesk["today"] | undefined, now: Date = new Date()): string {
  const date = `${now.getMonth() + 1}月${now.getDate()}日 星期${"日一二三四五六"[now.getDay()]}`;
  return today ? `${date} · 今天打开 ${today.opened} 篇，新增批注 ${today.annotations} 条` : date;
}

export function ocrAvailability(modules: ResearchOcrModule[]) {
  const ready = modules.find((module) => module.status === "ready") ?? null;
  if (ready) return { ready, reason: "已就绪，可在本机识别所选文献。" };
  const current = modules[0];
  const reasons = { not_installed: "本地 OCR 模块尚未安装。", downloading: "本地 OCR 模块正在准备，请稍后再试。", removing: "本地 OCR 模块正在移除。", error: "本地 OCR 模块不可用。", ready: "" };
  return { ready: null, reason: current ? current.error || reasons[current.status] : "未检测到可用的本地 OCR 模块。" };
}

export function canStartOcr(row: WorkbenchRow, jobs: ResearchOcrJob[]): boolean {
  return Boolean(row.attachment_id) && ["needs_ocr", "partial_needs_ocr"].includes(row.text_status)
    && !jobs.some((job) => job.attachment_id === row.attachment_id && ["queued", "running"].includes(job.status));
}
