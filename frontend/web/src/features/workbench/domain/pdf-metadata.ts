import type { PaperItem } from "@/platform/contracts/research-library.js";
import type { PdfMetadataChange } from "@/platform/contracts/workbench.js";

export function titleNeedsPdfReview(title: string, filenames: string[]) {
  const normalized = (value: string) =>
    value
      .replace(/\.pdf$/i, "")
      .replace(/[\s_.-]/g, "")
      .toLowerCase();
  if (!title.trim() || filenames.some((file) => normalized(file) === normalized(title))) return true;
  return (
    /^(?:\d{4}\.\d{4,5}(?:v\d+)?(?:\.pdf)?|(?:paper|untitled|document|main|manuscript|submission)(?:[ _-]?\d+)?(?:\.pdf)?)$/i.test(
      title,
    ) ||
    /^(?:doi:|https?:\/\/doi\.org\/)?10\.\d{4,9}\//i.test(title) ||
    /^(?:latex|pdftex|microsoft|adobe|acrobat|ghostscript|libreoffice)\b/i.test(title)
  );
}

export function metadataNeedsPdfReview(item: PaperItem, venue: string) {
  const placeholder =
    /^(?:anonymous(?:\s+(?:submission|authors?|paper))?|authors?|unknown|submission|paper\s*id|blind\s*review|double\s*blind(?:\s*submission)?)(?:\s*[:#-]?\s*\d+)?$/i;
  return Boolean(
    item.attachments.length &&
    (titleNeedsPdfReview(
      item.title,
      item.attachments.map((a) => a.filename || ""),
    ) ||
      !item.authors.length ||
      item.authors.every((a) => !a.trim() || placeholder.test(a.replace(/[_-]/g, " ").trim())) ||
      [item.doi, item.url, item.date, venue].some((value) => !value?.trim())),
  );
}

export const PDF_FIELD_LABELS: Record<PdfMetadataChange["field"], string> = {
  title: "题名",
  authors: "作者",
  doi: "DOI",
  url: "URL",
  date: "日期",
  venue: "出处",
};

export function metadataValue(value: string | string[]) {
  return (Array.isArray(value) ? value.join("、") : value).trim() || "空";
}
