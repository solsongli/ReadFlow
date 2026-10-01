import type { Attachment, Citation, PaperItem } from "@/platform/contracts/research-library.js";
export function researchCitationTarget(items: PaperItem[], citation: Citation): { item: PaperItem; attachment: Attachment; pageIdx: number } | null {
  const digest = citation.source_sha256 || citation.sha256;
  if (!/^[a-f0-9]{64}$/i.test(digest || "") || (citation.sha256 && citation.source_sha256 && citation.sha256 !== citation.source_sha256)) return null;
  if (!Number.isInteger(citation.page_idx) || citation.page_idx < 0) return null;
  for (const item of items) {
    if (citation.item_id && citation.item_id !== item.id) continue;
    const attachment = item.attachments.find((entry) => entry.id === citation.attachment_id && entry.item_id === item.id && entry.available && entry.sha256 === digest);
    if (attachment && (attachment.page_count == null || citation.page_idx < attachment.page_count)) return { item, attachment, pageIdx: citation.page_idx };
  }
  return null;
}
