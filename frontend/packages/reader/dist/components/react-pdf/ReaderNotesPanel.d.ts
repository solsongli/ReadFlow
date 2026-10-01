import type { ReaderNote } from "../../annotations/types.js";
export type ReaderNotesPanelProps = {
    open: boolean;
    groups: Array<{
        page: number;
        items: ReaderNote[];
    }>;
    count: number;
    onClose: () => void;
    onJump: (note: ReaderNote) => void;
    onUpdateNote: (id: string, note: string) => void | Promise<boolean>;
    onRemove: (id: string) => void;
    onExport: () => Promise<boolean>;
    loading?: boolean;
    saving?: boolean;
    error?: string | null;
    storageMode?: "local" | "server";
    onRetry?: () => void;
};
export declare function ReaderNotesPanel({ open, groups, count, onClose, onJump, onUpdateNote, onRemove, onExport, loading, saving, error, storageMode, onRetry, }: ReaderNotesPanelProps): import("react").JSX.Element;
//# sourceMappingURL=ReaderNotesPanel.d.ts.map