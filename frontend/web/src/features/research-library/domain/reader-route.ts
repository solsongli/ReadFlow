import { buildFrontendPageUrl } from "@/platform/config/runtime.js";
import type { Attachment } from "@/platform/contracts/research-library.js";

/** Keep paper ownership in Reader routes even when two papers share one PDF hash. */
export function buildResearchReaderUrl(itemId: string, attachment: Pick<Attachment, "id" | "item_id" | "sha256">, pageIdx?: number): string {
  if (!itemId || !attachment.id || attachment.item_id !== itemId) throw new Error("文献与附件身份不匹配，无法打开原阅读器。");
  if (!/^[a-f0-9]{64}$/i.test(attachment.sha256)) throw new Error("附件缺少有效 PDF 哈希，无法打开原阅读器。");
  const params: Record<string, string> = { document_id: attachment.sha256, research_item_id: itemId, attachment_id: attachment.id };
  if (pageIdx !== undefined) {
    if (!Number.isInteger(pageIdx) || pageIdx < 0) throw new Error("引用页码无效。");
    params.page_idx = String(pageIdx);
  }
  return buildFrontendPageUrl("./reader.html", params);
}
