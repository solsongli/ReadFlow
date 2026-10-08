// ReadFlow 工作台读模型（/api/research/workbench/*）。字段名与 backend/library_mvp/workbench.py 一致。

export type WorkbenchView = "all" | "unread" | "starred" | "unfiled" | "recent" | "trash" | "notes" | "needs_ocr" | "missing_doi" | "no_zh_title";
export type WorkbenchSort = "added" | "title" | "year" | "author" | "venue" | "opened";
export type SortOrder = "asc" | "desc";
export type ReadStatus = "unread" | "reading" | "read";
export type WorkbenchSource = "pdf" | "connector" | "csl-json" | "zotero" | "import";
export type TextStatus =
  | "none"
  | "not_parsed"
  | "native_text"
  | "needs_ocr"
  | "partial_needs_ocr"
  | "truncated"
  | "ocr_complete";

/** Read-only full-text translation status from the original job service. */
export interface TranslationError { code: string; message: string; details?: string; settings?: "translation" | "ocr" | null }
export interface TranslationResult { item_id?: string; translation?: TranslationState; error?: TranslationError; reused?: boolean; needs_ocr?: boolean }

export interface TranslationState {
  stage?: "ocr" | "translation" | "render";
  error?: TranslationError;
  status: "none" | "queued" | "running" | "done" | "failed" | "unknown";
  job_id?: string | null;
  percent?: number | null;
  updated_at?: string | null;
}

export interface WorkbenchRow {
  id: string;
  title: string;
  title_translated: string;
  item_type: string;
  authors: string[];
  date: string;
  year: string;
  venue: string;
  venue_short: string;
  doi: string;
  url: string;
  tags: string[];
  group_ids: string[];
  citekey: string;
  citekey_pinned: boolean;
  attachment_count: number;
  attachment_id: string | null;
  /** Source PDF SHA-256 = the original job service's document id. */
  document_id: string | null;
  page_count: number | null;
  text_status: TextStatus | string;
  notes_count: number;
  annotations_count: number;
  starred: boolean;
  read_status: ReadStatus;
  read_page: number | null;
  read_pages: number | null;
  last_opened_at: string | null;
  deleted_at: string | null;
  source: WorkbenchSource;
  translation: TranslationState;
  created_at: string;
  updated_at: string;
}

export interface WorkbenchGroup {
  id: string;
  name: string;
  parent_id: string | null;
  count: number;
  direct_count: number;
}

export interface WorkbenchTag {
  name: string;
  count: number;
}

/** A Zotero-style colored tag: palette slot 1–7 and keyboard position 1–9. */
export interface TagColor {
  name: string;
  color: number;
  position: number;
}

export interface WorkbenchCounts {
  all: number;
  unread: number;
  starred: number;
  unfiled: number;
  recent: number;
  trash: number;
  notes: number;
  needs_ocr: number;
  missing_doi: number;
  no_zh_title: number;
}

export interface WorkbenchListResult {
  items: WorkbenchRow[];
  total: number;
  counts: WorkbenchCounts;
  groups: WorkbenchGroup[];
  tags: WorkbenchTag[];
}

export interface WorkbenchListQuery {
  view: WorkbenchView;
  groupId?: string | null;
  tag?: string | null;
  query?: string;
  sort: WorkbenchSort;
  order: SortOrder;
  includeChildren?: boolean;
}

export interface WorkbenchNote {
  id: string;
  item_id: string;
  attachment_id: string | null;
  page_idx: number | null;
  quote: string;
  translated_quote: string;
  body: string;
  created_at: string;
  updated_at: string;
  item_title: string;
  color: string;
}

export type WorkbenchNoteKind = "all" | "notes" | "annotations";
export interface WorkbenchNoteRecord extends WorkbenchNote {
  item_title_translated: string;
  kind: "note" | "annotation";
}
export interface WorkbenchNotesQuery {
  itemId?: string | null;
  query?: string;
  kind?: WorkbenchNoteKind;
  limit?: number;
  offset?: number;
}
export interface WorkbenchNotesResult {
  items: WorkbenchNoteRecord[];
  total: number;
  /** Counts for the paper/search filter, before the kind filter; all units are records. */
  counts: { total: number; notes: number; annotations: number };
}

export interface DeskCounts {
  total: number;
  translated: number;
  notes: number;
  annotations: number;
  groups: number;
}

export interface DeskTranslation {
  running: Array<{ item_id: string; title: string; title_translated: string; percent: number | null; stage?: TranslationState["stage"] }>;
  queued: number;
  done: number;
  recent_done: { item_id: string; title: string; finished_at: string } | null;
}

export interface WorkbenchDesk {
  counts?: DeskCounts;
  translation?: DeskTranslation;
  continue_reading: WorkbenchRow[];
  to_read: WorkbenchRow[];
  recent_items: WorkbenchRow[];
  recent_annotations: WorkbenchNote[];
  recent_notes: WorkbenchNote[];
  attention: { missing_doi: string[]; needs_ocr: string[]; untranslated_titles: string[] };
  today: { opened: number; annotations: number; notes: number };
  total: number;
}

export interface WorkbenchStatePatch {
  title_translated?: string;
  venue?: string;
  citekey?: string;
  starred?: boolean;
  read_status?: ReadStatus;
}
export interface PdfMetadataChange {
  field: "title" | "authors" | "doi" | "url" | "date" | "venue";
  before: string | string[];
  after: string | string[];
}

export interface PdfTitleSuggestion {
  eligible: boolean;
  current_title?: string;
  changes: PdfMetadataChange[];
  token: string | null;
  title: { value: string; confidence: number; source: string } | null;
}
