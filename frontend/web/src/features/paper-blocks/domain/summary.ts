import type { BlockStatus } from "./model.js";
import { fallbackMessages, usageText } from "./status.js";
import { busy, jobViews } from "./model.js";
export function translationSummary(status: BlockStatus | null) {
  if (!status) return { actionable: false, title: "翻译详情", details: [] };
  const job = jobViews(status).full;
  const qa = status.qa || job?.qa || status.result?.qa;
  const details = fallbackMessages(status.result, job ? { ...job, qa } : null);
  if (!job && qa?.checked) {
    const quality = fallbackMessages({ ...status.result, qa } as BlockStatus["result"], null)[0];
    const previous = details.findIndex((d) => d.kind === "quality");
    if (previous >= 0) details.splice(previous, 1);
    if (quality) details.unshift(quality);
  }
  for (const [i, text] of (status.document?.warnings || []).entries())
    details.push({ kind: `warning-${i}`, text });
  const usage = usageText(job?.usage || status.result?.usage);
  if (usage) details.push({ kind: "usage", text: usage });
  if (status.result?.marker_cleanup?.tokens)
    details.push({
      kind: "markers",
      text: `已在本地清理 ${status.result.marker_cleanup.tokens} 个内部标记；无需重新翻译。`,
    });
  const review = qa?.needs_review || 0;
  const failures = new Set([
    ...(status.result?.translation_fallback || []),
    ...(job?.translation_fallback || []),
  ]).size;
  const layout =
    (status.result?.layout_truncated?.length || 0) +
    (status.result?.render_fallback?.length || 0) +
    (status.result?.layout_render_fallback?.length || 0);
  const actionable = Boolean(
    review || failures || layout || status.document?.warnings?.length || status.result?.repair_pending,
  );
  const phase = status.result?.repair_pending
    ? (busy(job?.status) ? "正在修复已有译文" : "旧译文待本地修复")
    : busy(job?.status)
      ? "翻译进行中"
      : "翻译完成";
  const suffix = review
    ? `${review} 块需核对`
    : failures
      ? `${failures} 块未完成`
      : layout
        ? "排版需核对"
        : "翻译详情";
  return { actionable, title: `${phase} · ${suffix}`, details };
}
export function summaryStorageKey(item: string) {
  return `readflow.translation-summary.dismissed.v1:${encodeURIComponent(item)}`;
}
