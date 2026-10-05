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
  const qa = job?.qa || result?.qa;
  if (qa?.checked)
    messages.push({
      kind: "quality",
      text: `质检：${qa.retried || 0} 块已自动重译，${qa.needs_review || 0} 块仍需核对。`,
    });
  if ((job?.notices || result?.notices || []).includes("thinking_unsupported")) {
    messages.push({
      kind: "thinking",
      text: "服务不支持关闭思考参数，已自动兼容重试；本次运行后续请求将省略此参数。",
    });
  }
  const translation = new Set([
    ...(result?.translation_fallback || []),
    ...(job?.translation_fallback || job?.fallback_blocks || []),
  ]).size;
  if (translation)
    messages.push({ kind: "translation", text: `${translation} 个块未完成翻译，暂用原文，可补翻。` });
  if (result?.layout_overflow?.length)
    messages.push({
      kind: "layout-overflow",
      text: `原版式 ${result.layout_overflow.length} 个块压缩了行距，其中 ${result.layout_truncated?.length || 0} 个块显示省略；块卡片可看全文。`,
    });
  if (result?.layout_render_fallback?.length)
    messages.push({
      kind: "layout-preserved",
      text: `原版式 ${result.layout_render_fallback.length} 个区域保留原文，未覆盖图表或不可编辑文字。`,
    });
  if (result?.layout_label_fallback?.length)
    messages.push({
      kind: "layout-label",
      text: `原版式 ${result.layout_label_fallback.length} 个图内标签保留原文。`,
    });
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
