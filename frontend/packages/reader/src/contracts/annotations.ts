/** Optional host persistence for Reader annotations; source identity is host owned. */
import type { ReaderNote, ReaderNotesDocKey } from "../annotations/types.js";
export type { ReaderNote, ReaderNotesDocKey } from "../annotations/types.js";

export type ReaderAnnotationScope = {
  /** Includes the bibliographic item and attachment identity, not only PDF hash. */
  key: string;
  documentId: string;
};
export type ReaderAnnotationRequest = { signal?: AbortSignal };
export type ReaderAnnotationsDataPort = {
  resolveScope: (document: ReaderNotesDocKey) => ReaderAnnotationScope | null;
  load: (scope: ReaderAnnotationScope, request?: ReaderAnnotationRequest) => Promise<ReaderNote[]>;
  create: (scope: ReaderAnnotationScope, note: ReaderNote, request?: ReaderAnnotationRequest) => Promise<ReaderNote>;
  update: (scope: ReaderAnnotationScope, note: ReaderNote, request?: ReaderAnnotationRequest) => Promise<ReaderNote>;
  remove: (scope: ReaderAnnotationScope, id: string, request?: ReaderAnnotationRequest) => Promise<void>;
};
