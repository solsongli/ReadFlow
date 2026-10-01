export interface Collection { id: string; name: string; parent_id: string | null }
export interface Attachment {
  id: string; item_id: string; sha256: string; document_id: string; filename: string;
  mime: string; page_count: number | null; text_status: string; available: boolean;
}
export interface Note {
  id: string; item_id: string; attachment_id: string | null; page_idx: number | null;
  quote: string; translated_quote: string; body: string; created_at: string; updated_at: string;
}
export interface PaperItem {
  id: string; title: string; item_type: string; authors: string[]; date: string; doi: string;
  url: string; abstract: string; tags: string[]; collection_ids: string[];
  created_at: string; updated_at: string; attachments: Attachment[]; notes: Note[];
}
export type ItemInput = Pick<PaperItem, "title" | "item_type" | "authors" | "date" | "doi" | "url" | "abstract" | "tags" | "collection_ids">;
export type NoteInput = Pick<Note, "attachment_id" | "page_idx" | "quote" | "translated_quote" | "body">;
export interface LibraryResult { items: PaperItem[]; collections: Collection[]; tags: string[] }
export interface ImportPayload {
  format: "zotero-api" | "csl-json"; source_id: string; data: unknown; collections?: unknown[]; snapshot?: Record<string, unknown>;
}
export interface ImportWarning { code: string; message: string; source_key?: string; field?: string }
export interface ImportPlan {
  plan_hash: string; source_id: string; source_kind: string; items: Record<string, unknown>[];
  collections: Record<string, unknown>[]; warnings: ImportWarning[];
  counts: { items: number; collections: number; tags: number; attachments: number; notes: number; annotations: number };
}
export interface ImportResult {
  batch_id: string; created_items: number; updated_items: number; unchanged_items: number;
  conflicts: number | unknown[]; warnings: ImportWarning[];
}
export interface Citation {
  ref: string | number; attachment_id: string; sha256: string; revision_id: string;
  page_idx: number; page_label: string; block_id: string; quote: string; bbox?: number[] | null;
}
export interface EvidenceResult {
  kind: "source-search"; query: string; answer: string; citations: Citation[]; model_verified: false;
}
export interface AiStatus { status: string; model_verified: boolean; message: string }
