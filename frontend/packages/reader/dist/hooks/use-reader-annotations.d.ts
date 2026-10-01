import { type ReaderNote, type ReaderNotePane, type ReaderNotesDocKey } from "../annotations/types.js";
export type ReaderAnnotationsApi = {
    notes: ReaderNote[];
    groups: Array<{
        page: number;
        items: ReaderNote[];
    }>;
    addFromQuote: (input: {
        page: number;
        pane: ReaderNotePane;
        quote: string;
        note?: string;
    }) => ReaderNote | null | Promise<ReaderNote | null>;
    updateNote: (id: string, note: string) => void | Promise<boolean>;
    remove: (id: string) => void | Promise<boolean>;
    exportMarkdown: (title?: string) => Promise<boolean>;
    count: number;
    loading: boolean;
    saving: boolean;
    error: string | null;
    storageMode: "local" | "server";
    reload: () => void;
};
export declare function useReaderAnnotations(doc: ReaderNotesDocKey, options?: {
    onAfterAdd?: () => void;
}): ReaderAnnotationsApi;
//# sourceMappingURL=use-reader-annotations.d.ts.map