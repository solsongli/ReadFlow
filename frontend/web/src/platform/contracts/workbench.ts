// ReadFlow 工作台读模型（/api/research/workbench/*）。字段名与 backend/library_mvp/workbench.py 一致。

export type WorkbenchView = "all" | "unread" | "starred" | "unfiled" | "recent" | "trash";
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
export interface TranslationState {
  status: "none" | "queued" | "running" | "done" | "failed" | "unknown";
  job_id?: string | null;
  percent?: number | null;
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

export interface WorkbenchCounts {
  all: number;
  unread: number;
  starred: number;
  unfiled: number;
  recent: number;
  trash: number;
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

export interface WorkbenchDesk {
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
