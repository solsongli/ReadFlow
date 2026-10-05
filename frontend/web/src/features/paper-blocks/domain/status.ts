import type { BlockJob, BlockStatus, BlockUsage } from "./model.js";

export function usageText(usage?: BlockUsage) {
  if (!usage) return "";
  const total = Math.max(0, Math.floor(usage.total_tokens || 0));
  const reasoning = Math.max(0, Math.floor(usage.reasoning_tokens || 0));
  if (!total) return reasoning ? `推理约 ${reasoning.toLocaleString()} tokens（服务未提供总用量）` : "";
  return `本次约 ${total.toLocaleString()} tokens${reasoning ? `，其中推理约 ${reasoning.toLocaleString()}` : ""}`;
}

export function fallbackMessages(result: BlockStatus["result"], job: BlockJob | null) {
  const messages: Array<{ kind: string; text: string }> = [];
  const translation = new Set([
    ...(result?.translation_fallback || []),
    ...(job?.translation_fallback || job?.fallback_blocks || []),
  ]).size;
  if (translation)
    messages.push({ kind: "translation", text: `${translation} 个块未完成翻译，暂用原文，可补翻。` });
  const render = result?.render_fallback?.length || 0;
  if (render) messages.push({ kind: "render", text: `${render} 个块排版失败，已退回原文。` });
  const labels = result?.label_fallback?.length || 0;
  if (labels) messages.push({ kind: "label", text: `${labels} 个图表的部分标签保留原文，图表已正常渲染。` });
  if (
    result?.fallback_blocks?.length &&
    result.render_fallback === undefined &&
    result.label_fallback === undefined
  ) {
    messages.push({
      kind: "legacy",
      text: `旧版记录有 ${result.fallback_blocks.length} 个保留原文项，重新排版后可查看具体原因。`,
    });
  }
  return messages;
}
