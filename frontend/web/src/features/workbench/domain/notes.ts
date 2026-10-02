import type { WorkbenchNoteKind, WorkbenchNoteRecord, WorkbenchNotesResult } from "@/platform/contracts/workbench.js";

export interface NoteDraft {
  note: WorkbenchNoteRecord;
  body: string;
  savedBody: string;
  isNew: boolean;
  status: "idle" | "dirty" | "saving" | "saved" | "error";
  error: string;
}
export interface NotesState {
  itemId: string | null;
  itemTitle: string;
  query: string;
  kind: WorkbenchNoteKind;
  result: WorkbenchNotesResult | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  draft: NoteDraft | null;
  pickerOpen: boolean;
}
export function initialNotesState(): NotesState {
  return { itemId: null, itemTitle: "", query: "", kind: "all", result: null, status: "idle", error: "", draft: null, pickerOpen: false };
}
export function editableNote(note: WorkbenchNoteRecord, isNew = false): NoteDraft {
  return { note, body: note.body, savedBody: note.body, isNew, status: "idle", error: "" };
}
export function noteNeedsSave(draft: NoteDraft | null): boolean {
  return Boolean(draft && (draft.body !== draft.savedBody || draft.status === "saving" || (draft.isNew && draft.body.trim())));
}
export function emptyNote(item: { id: string; title: string; title_translated?: string }, id: string, now: Date): WorkbenchNoteRecord {
  return { id, item_id: item.id, item_title: item.title, item_title_translated: item.title_translated ?? "", attachment_id: null,
    page_idx: null, quote: "", translated_quote: "", body: "", kind: "note", color: "", created_at: now.toISOString(), updated_at: now.toISOString() };
}
