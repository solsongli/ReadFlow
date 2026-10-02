import type { WorkbenchNote, WorkbenchNoteRecord } from "@/platform/contracts/workbench.js";

export function noteKind(note: Pick<WorkbenchNote, "quote" | "translated_quote" | "page_idx">): "note" | "annotation" {
  return note.quote || note.translated_quote || note.page_idx != null ? "annotation" : "note";
}
export function noteSummary(note: Pick<WorkbenchNote, "body" | "quote" | "translated_quote">) {
  const lines = (note.body.trim() || note.quote.trim() || note.translated_quote.trim()).split(/\r?\n/);
  return { title: lines[0]?.trim() || "新笔记", excerpt: lines.slice(1).join(" ").trim().slice(0, 160) };
}
export const NOTE_DATE_GROUPS = ["今天", "昨天", "过去 7 天", "更早"] as const;
export function noteDateGroup(iso: string, now: Date = new Date()): typeof NOTE_DATE_GROUPS[number] {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "更早";
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
  const distance = day(now) - day(date);
  return distance <= 0 ? "今天" : distance === 1 ? "昨天" : distance < 7 ? "过去 7 天" : "更早";
}
export function fullNoteDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
/** Stored colours select theme tokens, never untrusted inline CSS. Also supports Zotero hex colours. */
export function noteColor(value: string): string {
  const names = ["yellow", "orange", "red", "pink", "purple", "blue", "green", "teal", "gray"];
  const color = value.toLowerCase().trim();
  if (names.includes(color)) return color;
  if (/^#[\da-f]{6}$/.test(color)) {
    const [r, g, b] = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16) / 255);
    const max = Math.max(r, g, b), delta = max - Math.min(r, g, b);
    if (delta < 0.06) return "gray";
    const hue = ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 + 360) % 360;
    return hue < 20 ? "red" : hue < 45 ? "orange" : hue < 75 ? "yellow" : hue < 165 ? "green" : hue < 195 ? "teal" : hue < 255 ? "blue" : hue < 290 ? "purple" : "pink";
  }
  return "yellow";
}
function markdownLabel(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\\`*_[\]#]/g, "\\$&");
}
export function exportNotesMarkdown(notes: WorkbenchNoteRecord[]): string {
  const grouped = new Map<string, WorkbenchNoteRecord[]>();
  for (const note of notes) grouped.set(note.item_id, [...(grouped.get(note.item_id) ?? []), note]);
  const output = ["# ReadFlow 笔记", ""];
  for (const rows of grouped.values()) {
    output.push(`## ${markdownLabel(rows[0].item_title)}`, "");
    if (rows[0].item_title_translated) output.push(markdownLabel(rows[0].item_title_translated), "");
    for (const note of rows) {
      const page = note.page_idx == null ? "" : ` · 第 ${note.page_idx + 1} 页`;
      output.push(`### ${note.kind === "annotation" ? "批注" : "笔记"}${page} · ${fullNoteDate(note.updated_at)}`, "");
      for (const quote of [note.quote, note.translated_quote]) if (quote) output.push(quote.split(/\r?\n/).map((line) => `> ${markdownLabel(line)}`).join("\n"), "");
      if (note.body) output.push(note.body, "");
    }
  }
  return output.join("\n");
}
