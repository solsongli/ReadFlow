import { createRoot } from "react-dom/client";
import { createWorkbench, WorkbenchProvider, WorkbenchShell } from "@/features/workbench/index.js";

function fixture() {
  const hash = new URL(location.href).searchParams.get("hash")!;
  const rows = [1, 2].map((n) => ({
    id: `${n}1111111-1111-4111-8111-111111111111`, attachment_id: `${n}2222222-2222-4222-8222-222222222222`, document_id: hash,
    title: `ReadFlow Reader ${n}`, title_translated: `阅读器测试 ${n}`, authors: ["Test Author"], year: "2026", date: "2026-10-02", item_type: "document",
    venue: "", venue_short: "", doi: "", url: "", tags: [], group_ids: [], citekey: `test${n}`, citekey_pinned: false,
    attachment_count: 1, page_count: 8, text_status: "native_text", notes_count: 0, annotations_count: 0, starred: false,
    read_status: "unread", read_page: n === 1 ? 3 : null, read_pages: 8, last_opened_at: null, deleted_at: null, source: "pdf",
    translation: { status: "none" }, created_at: "2026-10-02T10:00:00Z", updated_at: "2026-10-02T10:00:00Z",
  }));
  const calls = [];
  const notes = [];
  const item = (id) => {
    const row = rows.find((r) => r.id === id)!;
    return { ...row, abstract: "", collection_ids: [], attachments: [{ id: row.attachment_id, item_id: id, sha256: hash, page_count: 8 }], notes: notes.filter((note) => note.item_id === id) };
  };
  const api = {
    async list() { calls.push(["list"]); return structuredClone({ items: rows, total: 2, groups: [], tags: [], counts: { all: 2, unread: rows.filter((r) => r.read_status === "unread").length, recent: 0, starred: 0, trash: 0, unfiled: 2, notes: 0, needs_ocr: 0, missing_doi: 2, no_zh_title: 0 } }); },
    async row(id) { calls.push(["row", id]); return structuredClone(rows.find((r) => r.id === id)); },
    async item(id) { calls.push(["item", id]); return structuredClone(item(id)); },
    async desk() { return structuredClone({ total: 2, continue_reading: rows.filter((r) => r.last_opened_at), to_read: rows.filter((r) => r.read_status === "unread"), recent_items: rows, recent_annotations: notes, recent_notes: [], attention: { missing_doi: [], needs_ocr: [], untranslated_titles: [] }, today: { opened: rows.filter((r) => r.last_opened_at).length, notes: 0, annotations: notes.length }, counts: { total: 2, translated: 0, notes: 0, annotations: notes.length, groups: 0 }, translation: { running: [], queued: 0, done: 0, recent_done: null } }); },
    async ocrJobs() { return { jobs: [] }; },
    async markOpened(id, progress = {}) {
      calls.push(["opened", id, progress]);
      const row = rows.find((r) => r.id === id)!;
      if (progress.page != null) row.read_page = progress.page;
      if (progress.pages != null) row.read_pages = progress.pages;
      if (row.read_status === "unread") row.read_status = "reading";
      row.last_opened_at = new Date().toISOString();
      return structuredClone(row);
    },
    async nativeReader(attachment) { const row = rows.find((r) => r.attachment_id === attachment)!; return { attachment: { reader_url: `./reader.html?document_id=${hash}&research_item_id=${row.id}&attachment_id=${attachment}` } }; },
  };
  const wb = createWorkbench({ api: api as never, storage: localStorage });
  wb.store.actions.patch({ main: "library", theme: "light" });
  Object.assign(window, { fixture: { wb, rows, calls, notes, item } });
  createRoot(document.getElementById("workbench-root")!).render(<WorkbenchProvider workbench={wb}><WorkbenchShell /></WorkbenchProvider>);
}
fixture();
