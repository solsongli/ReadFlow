import { createRoot } from "react-dom/client";
import { workbenchApi, type WorkbenchApi } from "@/platform/api/workbench.js";
import type { WorkbenchNoteRecord, WorkbenchRow } from "@/platform/contracts/workbench.js";
import { createWorkbench } from "@/features/workbench/state/controller.js";
import { WorkbenchProvider } from "@/features/workbench/ui/context.js";
import { WorkbenchShell } from "@/features/workbench/ui/shell/WorkbenchShell.js";

const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const stamp = (days: number) => { const date = new Date(); date.setDate(date.getDate() - days); date.setHours(9, 0, 0, 0); return date.toISOString(); };
const base: WorkbenchRow = { id: ids[0], title: "Research on Memory and Learning", title_translated: "记忆与学习研究", item_type: "journalArticle", authors: ["Ada Researcher"], date: "2026", year: "2026", venue: "Research Journal", venue_short: "Res. J.", doi: "", url: "", tags: [], group_ids: [], citekey: "research2026", citekey_pinned: false, attachment_count: 1, attachment_id: "pdf-a", document_id: "synthetic", page_count: 8, text_status: "native_text", notes_count: 2, annotations_count: 1, starred: false, read_status: "reading", read_page: 1, read_pages: 8, last_opened_at: stamp(0), deleted_at: null, source: "pdf", translation: { status: "none" }, created_at: stamp(7), updated_at: stamp(0) };
const rows = [base, { ...base, id: ids[1], title: "Research without a PDF", title_translated: "尚未附 PDF 的文献", attachment_id: null, attachment_count: 0, document_id: null }];
const note = (id: string, paper: number, days: number, body: string, annotation = false): WorkbenchNoteRecord => ({ id, item_id: rows[paper].id, item_title: rows[paper].title, item_title_translated: rows[paper].title_translated, body, quote: annotation ? "Learning connects a new idea to what we already understand." : "", translated_quote: annotation ? "学习将新想法与已有的理解联系起来。" : "", page_idx: annotation ? 3 : null, attachment_id: annotation ? "pdf-a" : null, kind: annotation ? "annotation" : "note", color: "purple", created_at: stamp(days), updated_at: stamp(days) });
const data = { notes: [note("n1", 0, 0, "阅读的三个问题\n方法解决了什么问题？证据是否充分？"), note("n2", 0, 1, "可与认知负荷理论比较。", true), note("n3", 1, 4, "下次组会\n整理相关研究的局限"), note("n4", 1, 14, "早期批注", true)], failSave: false, saveDelay: 0 };
const calls = { updates: 0, creates: 0, deletes: 0, noteQueries: [] as Record<string, string>[], payloads: [] as Record<string, unknown>[] };
function recount() { for (const row of rows) { const notes = data.notes.filter((note) => note.item_id === row.id); row.notes_count = notes.length; row.annotations_count = notes.filter((note) => note.kind === "annotation").length; } }
function counts() { recount(); return { all: rows.length, notes: rows.filter((r) => r.notes_count > 0).length, unread: 0, starred: 0, unfiled: 2, recent: 2, trash: 0, needs_ocr: 0, missing_doi: 2, no_zh_title: 0 }; }
function listNotes(query: Record<string, string>) {
  calls.noteQueries.push(query);
  const q = (query.q || "").toLowerCase();
  const filtered = data.notes.filter((n) => (!query.item_id || n.item_id === query.item_id) && [n.body, n.quote, n.translated_quote, n.item_title, n.item_title_translated].some((v) => v.toLowerCase().includes(q)));
  const items = filtered.filter((n) => !query.kind || query.kind === "all" || n.kind === (query.kind === "notes" ? "note" : "annotation")).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id));
  const start = Number(query.offset || 0), end = start + Number(query.limit || 200);
  return structuredClone({ items: items.slice(start, end), total: items.length, counts: { total: filtered.length, notes: filtered.filter((n) => n.kind === "note").length, annotations: filtered.filter((n) => n.kind === "annotation").length } });
}
function mutate(method: string, id: string, payload: { body?: string }) {
  calls.payloads.push(payload);
  if (data.failSave) throw new Error("Synthetic save failure");
  if (method === "POST") { calls.creates++; const created = note(`created-${calls.creates}`, rows.findIndex((r) => r.id === id), 0, payload.body!); created.updated_at = new Date().toISOString(); data.notes.unshift(created); return structuredClone(created); }
  if (method === "DELETE") { calls.deletes++; data.notes = data.notes.filter((n) => n.id !== id); return null; }
  calls.updates++; const existing = data.notes.find((n) => n.id === id)!;
  existing.body = payload.body!; existing.updated_at = new Date().toISOString(); return structuredClone(existing);
}
const api = { ...workbenchApi,
  async list(query) { recount(); return { items: structuredClone(rows.filter((r) => (!query.query || [r.title, r.title_translated].some((v) => v.toLowerCase().includes(query.query.toLowerCase()))) && (query.view !== "notes" || r.notes_count > 0))), counts: counts(), groups: [], tags: [], total: rows.length }; },
  async row(id) { recount(); return structuredClone(rows.find((r) => r.id === id)); },
  async item(id) { const row = rows.find((r) => r.id === id)!; return { ...row, abstract: "Synthetic abstract", attachments: row.attachment_id ? [{ id: row.attachment_id }] : [], notes: structuredClone(data.notes.filter((n) => n.item_id === id)) }; },
  async desk() { recount(); return { total: rows.length, counts: { total: rows.length, notes: data.notes.filter((n) => n.kind === "note").length, annotations: data.notes.filter((n) => n.kind === "annotation").length, translated: 0, groups: 0 }, continue_reading: structuredClone(rows.slice(0, 1)), to_read: [], recent_items: structuredClone(rows), recent_notes: structuredClone(data.notes.filter((n) => n.kind === "note")), recent_annotations: structuredClone(data.notes.filter((n) => n.kind === "annotation")), today: { opened: 1, notes: 1, annotations: 0 }, attention: { missing_doi: ids, needs_ocr: [], untranslated_titles: [] } }; },
  async ocrJobs() { return { jobs: [] }; },
  async nativeReader(id) { return { attachment: { reader_url: `./reader.html?source_pdf=${id}` } }; },
  async markOpened(id) { return structuredClone(rows.find((r) => r.id === id)); },
} as WorkbenchApi;
const wb = createWorkbench({ api, storage: localStorage });
wb.store.actions.patch({ main: "library", theme: "light" });
Object.assign(window, { fixture: { wb, data, calls, rows, ids, listNotes, mutate,
  bulk(size: number) { data.notes = Array.from({ length: size }, (_, i) => note(`bulk-${i}`, i % 2, 0, `Bulk note ${i}`)); } } });
createRoot(document.getElementById("workbench-root")!).render(<WorkbenchProvider workbench={wb}><WorkbenchShell /></WorkbenchProvider>);
