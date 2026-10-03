import { createRoot } from "react-dom/client";
import { createWorkbench, WorkbenchProvider, WorkbenchShell } from "@/features/workbench/index.js";
const rows = ["a", "b"].map((id) => ({ id, title: `Paper ${id}`, title_translated: "", authors: ["Alice Zhang"], year: "2025", date: "2025", venue: "Test Journal", venue_short: "Test", item_type: "journalArticle", doi: "", url: "", tags: [], group_ids: [], citekey: `zhang${id}`, citekey_pinned: false, attachment_id: id, attachment_count: 1, document_id: "a".repeat(64), page_count: 12, text_status: "native_text", translation: { status: "none" }, read_status: "unread", read_page: 3, read_pages: 12, last_opened_at: null, deleted_at: null, notes_count: 0, annotations_count: 0, source: "pdf", created_at: "2026-10-01", updated_at: "2026-10-01" }));
const calls = [];
const notes = [];
const api = {
  async createNote(id, value) {
    const paper=rows.find(row=>row.id===id);
    const note={id:`note-${notes.length}`,item_id:id,item_title:paper.title,item_title_translated:"",attachment_id:null,
      page_idx:null,quote:"",translated_quote:"",body:value.body,color:"",kind:"note",created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    notes.push(note);return note;
  },
  async notes() {return {items:notes,total:notes.length,counts:{total:notes.length,notes:notes.length,annotations:0}};},
  async list() { return { items: structuredClone(rows), total: 2, groups: [], tags: [], counts: { all: 2, unread: 2, starred: 0, recent: 0, trash: 0, unfiled: 2, notes: 0 } }; },
  async row(id) { return structuredClone(rows.find((row) => row.id === id)); },
  async item(id) { return { ...rows.find((row) => row.id === id), notes: [], attachments: [{ id }], abstract: "" }; },
  async desk() { return { total: 2, continue_reading: [], to_read: rows, recent_items: rows, recent_notes: [], recent_annotations: [], attention: { missing_doi: [], needs_ocr: [], untranslated_titles: [] }, today: { opened: 0, notes: 0, annotations: 0 } }; },
  async ocrJobs() { return { jobs: [] }; },
  async markOpened(id, progress = {}) { calls.push(["progress", id, progress]); const row = rows.find((row) => row.id === id); Object.assign(row, { read_status: "reading", ...(progress.page ? { read_page: progress.page, read_pages: progress.pages } : {}) }); return structuredClone(row); },
};
const wb = createWorkbench({ api: api as never, storage: localStorage });
wb.store.actions.patch({ main: "library", theme: "light" });
Object.assign(window, { fixture: { wb, rows, calls } });
createRoot(document.getElementById("root")!).render(<WorkbenchProvider workbench={wb}><WorkbenchShell /></WorkbenchProvider>);
