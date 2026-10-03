import { SOFT_READER_CLOSE_MESSAGE } from "../shared/navigation/soft-reader.js";
import { type WorkbenchAppearance } from "./workbench-typography.js";
export { SOFT_READER_CLOSE_MESSAGE };
export type WorkbenchScheme = "light" | "dark";
export type ReaderProgressMessage = {
    type: "readflow:reader-progress";
    itemId: string;
    page: number;
    pages: number;
};
export type ReaderHostMessage = ReaderProgressMessage | {
    type: "readflow:notes-changed" | "readflow:reader-ready";
    itemId: string;
} | {
    type: typeof SOFT_READER_CLOSE_MESSAGE;
};
export declare function isWorkbenchItemId(value: unknown): value is string;
export declare function isWorkbenchScheme(value: unknown): value is WorkbenchScheme;
export declare function parseWorkbenchEmbed(search: string): {
    scheme: WorkbenchScheme;
    itemId: string | null;
} | null;
export declare function validReaderProgress(page: unknown, pages: unknown): page is number;
export declare function parseWorkbenchSchemeMessage(value: unknown): {
    type: "readflow:scheme";
    scheme: WorkbenchScheme;
    appearance?: WorkbenchAppearance;
} | null;
export declare function trustedWorkbenchMessage(event: {
    origin: string;
    source: unknown;
}, origin: string, source: unknown): boolean;
export declare function parseWorkbenchReaderMessage(value: unknown, itemId: string): ReaderHostMessage | null;
//# sourceMappingURL=workbench-embed.d.ts.map