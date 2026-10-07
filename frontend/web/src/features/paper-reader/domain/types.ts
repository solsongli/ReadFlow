import type { AssistancePorts } from "./assistance.js";
import type { Semantics, Tool, AnnotationColor } from "./annotations/types.js";
export interface Position {
  page: number;
  offset: number;
  x?: number;
  mode?: Mode;
  other?: { page: number; offset: number; x?: number };
}
export interface TextLine {
  text: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
}
export interface OutlineEntry {
  translation?: string;
  id: string;
  title: string;
  page: number;
  y: number;
  level: number;
}
export interface Reference {
  id: string;
  number?: number;
  text: string;
  title: string;
  author: string;
  year: string;
  page: number;
  y: number;
}
export interface FigureTarget {
  id: string;
  kind: "figure" | "table" | "equation";
  number: string;
  caption: string;
  page: number;
  top: number;
  bottom: number;
}
export interface SearchHit {
  page: number;
  text: string;
  y: number;
}
export interface Bookmark {
  id: string;
  page: number;
  name: string;
  offset: number;
  mode?: "source" | "translated";
}
export type Mode = "source" | "compare" | "translated" | "inline";
export type PaperTone = "auto" | "white" | "sepia" | "night";
export interface PaperMetadata {
  id: string;
  title: string;
  authors: string[];
  year: string;
  venue: string;
  doi: string;
  citekey: string;
}
export interface ReaderPorts {
  marginPreferences?: { notes: boolean; side: "auto" | "right"; translations: boolean };
  setMarginPreferences?: (value: { notes: boolean; side: "auto" | "right"; translations: boolean }) => void;
  blockHeadings?: OutlineEntry[];
  bilingualOutline?: boolean;
  inlineAvailable?: boolean;
  layoutAligned?: boolean;
  registerBlockNavigation?: (jump: (page: number, offset: number) => void) => (() => void);
  assistance?: AssistancePorts;
  canvasLinks?: Array<{ canvas_id: string; node_id: string; annotation_id: string; name: string }>;
  openCanvasLink?: (canvas: string, name: string, node: string) => void;
  addAnnotationToCanvas?: (id: string) => void;
  addSelectionToCanvas?: () => void;
  registerCanvasSelection?: (provider: () => Promise<string[]>) => () => void;
  flashAnnotationId?: string;
  attachmentId?: string;
  annotationSemantics?: Semantics;
  annotationsChanged?: () => void;
  annotationKeys?: (event: KeyboardEvent) => boolean;
  source: { url: string; headers: Record<string, string> };
  translated?: { url: string; headers: Record<string, string> };
  metadata: PaperMetadata;
  lastReadPage?: number | null;
  resumePage?: number | null;
  navigationKey?: number;
  onFocusChange?: (focus: boolean) => void;
  active: boolean;
  tone: PaperTone;
  setTone: (tone: PaperTone) => void;
  progress: (page: number, pages: number) => void;
  onPageChange?: (page: number) => void;
  quote: (text: string, page: number, format: "author" | "gbt") => string;
  lookup: (query: string) => Promise<Array<{ id: string; title: string }>>;
  reveal: (id: string) => void;
  translation: {
    label: string;
    running: boolean;
    percent?: number | null;
    start: () => void;
    cancel: () => void;
  };
}
