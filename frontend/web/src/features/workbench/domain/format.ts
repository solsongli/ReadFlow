// 展示用格式化（纯函数）：时间、作者、状态文案。

import type { WorkbenchRow } from "@/platform/contracts/workbench.js";

const CJK = /[㐀-鿿]/;

export function familyName(author: string): string {
  const value = author.trim();
  if (value.includes(",")) return value.split(",")[0].trim();
  if (CJK.test(value)) return value;
  const parts = value.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

export function shortAuthors(authors: string[]): string {
  if (!authors.length) return "—";
  const first = familyName(authors[0]) || authors[0];
  return authors.length > 1 ? `${first} 等` : first;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDay(iso: string | null | undefined, now: Date = new Date()): string {
  const date = parse(iso);
  if (!date) return "—";
  const day = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return date.getFullYear() === now.getFullYear() ? day : `${date.getFullYear()}-${day}`;
}

export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  const date = parse(iso);
  if (!date) return "—";
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (date.getTime() >= startOfToday) return `今天 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const days = Math.ceil((startOfToday - date.getTime()) / 86400000);
  if (days <= 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return formatDay(iso, now);
}

export function localMidnightIso(now: Date = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

export function longDate(now: Date = new Date()): string {
  const week = "日一二三四五六"[now.getDay()];
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} 周${week}`;
}

export function readingPercent(row: Pick<WorkbenchRow, "read_page" | "read_pages" | "read_status">): number | null {
  if (row.read_status === "read") return 100;
  if (!row.read_pages || row.read_page == null) return null;
  return Math.max(0, Math.min(100, Math.round((row.read_page / row.read_pages) * 100)));
}

export const TEXT_STATUS_LABEL: Record<string, string> = {
  none: "没有附件",
  not_parsed: "尚未检查",
  native_text: "PDF 原生文字",
  needs_ocr: "扫描版，需要 OCR",
  partial_needs_ocr: "部分页面需要 OCR",
  ocr_complete: "本地 OCR 已完成",
  truncated: "文字过多，已截断",
};

export const SOURCE_LABEL: Record<string, string> = {
  pdf: "PDF 导入",
  connector: "Zotero Connector",
  "csl-json": "CSL JSON",
  zotero: "Zotero",
  import: "导入",
};

export const ITEM_TYPE_LABEL: Record<string, string> = {
  journalArticle: "期刊论文",
  conferencePaper: "会议论文",
  preprint: "预印本",
  book: "图书",
  bookSection: "图书章节",
  thesis: "学位论文",
  report: "报告",
  webpage: "网页",
  dataset: "数据集",
  patent: "专利",
  document: "文档",
};

export const READ_STATUS_LABEL: Record<string, string> = { unread: "未读", reading: "在读", read: "已读" };

/** Stable 1–7 palette slot for a tag name (same tag → same colour everywhere). */
export function tagColorSlot(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return (hash % 7) + 1;
}
