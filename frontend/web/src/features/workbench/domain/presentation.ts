// Workbench presentation rules, shared by the toolbar, rows and inspector.
import type { ResearchOcrJob } from "@/platform/contracts/research-library.js";
import type { DeskTranslation, TranslationState, WorkbenchGroup, WorkbenchRow, WorkbenchSort } from "@/platform/contracts/workbench.js";
import { shortAuthors } from "./format.js";
import { buildGroupTree, descendantIds, flattenGroupTree, groupLabel } from "./groups.js";

export const SORT_OPTIONS: ReadonlyArray<{ value: WorkbenchSort; label: string }> = [
  { value: "added", label: "添加时间" },
  { value: "title", label: "标题" },
  { value: "year", label: "年份" },
  { value: "author", label: "作者" },
  { value: "venue", label: "出处" },
];

export function sortLabel(sort: WorkbenchSort): string {
  return SORT_OPTIONS.find((entry) => entry.value === sort)?.label ?? "最近阅读";
}

export function rowMetadata(row: Pick<WorkbenchRow, "authors" | "venue_short" | "year">, compact = false): string {
  return [shortAuthors(row.authors), !compact && row.venue_short, row.year]
    .filter((part) => part && part !== "—").join(" · ");
}

export function inspectorAuthors(authors: string[]): string {
  if (!authors.length) return "作者未知";
  return authors.slice(0, 3).join(", ") + (authors.length > 3 ? ` 等 ${authors.length} 人` : "");
}

export function progressPercent(percent: number | null | undefined): number | null {
  return percent == null || !Number.isFinite(percent) ? null : Math.max(0, Math.min(100, Math.round(percent)));
}

export function translationLabel(translation: TranslationState, detail = false): string {
  const percent = progressPercent(translation.percent);
  switch (translation.status) {
    case "done": return detail ? "已有中文译文" : "已译";
    case "running": return percent == null ? "翻译中" : `翻译中 ${percent}%`;
    case "queued": return detail ? "翻译排队中" : "排队";
    case "failed": return detail ? "翻译失败" : "失败";
    case "unknown": return detail ? "译文状态未知" : "";
    default: return detail ? "未翻译" : "";
  }
}

export function inspectorStatus(row: WorkbenchRow): string {
  const pdf = row.attachment_count ? (row.page_count == null ? "PDF 页数未知" : `PDF ${row.page_count} 页`) : "无 PDF 附件";
  return `${pdf} · ${translationLabel(row.translation, true)} · ${row.notes_count} 条笔记`;
}

/** Direct memberships repeat in every section; filtering a parent keeps that parent's section. */
export function sectionsOf(rows: WorkbenchRow[], groups: WorkbenchGroup[], browsing: string | null) {
  const scope = browsing ? descendantIds(groups, browsing) : null;
  const ordered = flattenGroupTree(buildGroupTree(groups)).filter((node) => !scope || scope.has(node.id));
  const sections = ordered
    .map((node) => ({ id: node.id, label: groupLabel(groups, node.id), rows: rows.filter((row) => row.group_ids.includes(node.id)) }))
    .filter((section) => section.rows.length);
  const covered = new Set(ordered.map((node) => node.id));
  const rest = rows.filter((row) => !row.group_ids.some((id) => covered.has(id)));
  if (rest.length) sections.push({ id: "__ungrouped", label: "未分组", rows: rest });
  return sections;
}

/** Combine active OCR and known translation jobs; repeated desk rows count only once. */
export function backgroundProgress(jobs: ResearchOcrJob[], papers: WorkbenchRow[], translation?: DeskTranslation) {
  const active = jobs.filter((job) => job.status === "running" || job.status === "queued");
  const descriptions = active.map((job) => job.status === "queued" ? "OCR 排队中"
    : `OCR ${job.completed_pages}/${job.total_pages || "?"} 页`);
  const percents = active.map((job) => job.total_pages > 0 ? progressPercent(job.completed_pages / job.total_pages * 100) : null);
  const seen = new Set<string>();
  if (translation) {
    for (const row of translation.running) {
      descriptions.push(`${row.title} · ${translationLabel({ status: "running", percent: row.percent })}`);
      percents.push(progressPercent(row.percent));
    }
    if (translation.queued) {
      descriptions.push(`翻译排队 ${translation.queued} 篇`);
      percents.push(...Array<number>(translation.queued).fill(0));
    }
  }
  for (const row of translation ? [] : papers) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (!["running", "queued"].includes(row.translation.status)) continue;
    descriptions.push(`${row.title} · ${translationLabel(row.translation)}`);
    percents.push(row.translation.status === "queued" ? 0 : progressPercent(row.translation.percent));
  }
  if (!descriptions.length) return null;
  const known = percents.filter((value): value is number => value != null);
  return {
    title: descriptions.join("\n"),
    count: percents.length,
    percent: known.length === percents.length ? Math.round(known.reduce((sum, value) => sum + value, 0) / known.length) : null,
  };
}
