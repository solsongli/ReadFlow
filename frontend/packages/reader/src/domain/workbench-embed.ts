// Shared, pure protocol for the Reader package and its workbench host.
import { SOFT_READER_CLOSE_MESSAGE } from "../shared/navigation/soft-reader.js";
export { SOFT_READER_CLOSE_MESSAGE };
export type WorkbenchScheme = "light" | "dark";
export type ReaderProgressMessage = { type: "readflow:reader-progress"; itemId: string; page: number; pages: number };
export type ReaderHostMessage = ReaderProgressMessage
  | { type: "readflow:notes-changed" | "readflow:reader-ready"; itemId: string }
  | { type: typeof SOFT_READER_CLOSE_MESSAGE };

export function isWorkbenchItemId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}
export function isWorkbenchScheme(value: unknown): value is WorkbenchScheme {
  return value === "light" || value === "dark";
}
export function parseWorkbenchEmbed(search: string): { scheme: WorkbenchScheme; itemId: string | null } | null {
  const params = new URLSearchParams(search);
  if (params.get("embed") !== "workbench") return null;
  const itemId = params.get("research_item_id");
  return { scheme: params.get("scheme") === "dark" ? "dark" : "light", itemId: isWorkbenchItemId(itemId) ? itemId : null };
}
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function fields(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
export function validReaderProgress(page: unknown, pages: unknown): page is number {
  return Number.isInteger(page) && Number.isInteger(pages) && Number(page) >= 1
    && Number(pages) >= Number(page) && Number(pages) <= 100000;
}
export function parseWorkbenchSchemeMessage(value: unknown): { type: "readflow:scheme"; scheme: WorkbenchScheme } | null {
  return record(value) && value.type === "readflow:scheme" && isWorkbenchScheme(value.scheme) && fields(value, ["type", "scheme"])
    ? { type: "readflow:scheme", scheme: value.scheme } : null;
}
export function trustedWorkbenchMessage(event: { origin: string; source: unknown }, origin: string, source: unknown): boolean {
  return source != null && event.origin === origin && event.source === source;
}
export function parseWorkbenchReaderMessage(value: unknown, itemId: string): ReaderHostMessage | null {
  if (!record(value)) return null;
  if (value.type === SOFT_READER_CLOSE_MESSAGE && fields(value, ["type"])) return { type: SOFT_READER_CLOSE_MESSAGE };
  if (!isWorkbenchItemId(value.itemId) || value.itemId !== itemId) return null;
  if ((value.type === "readflow:notes-changed" || value.type === "readflow:reader-ready") && fields(value, ["type", "itemId"])) {
    return { type: value.type, itemId };
  }
  if (value.type === "readflow:reader-progress" && fields(value, ["type", "itemId", "page", "pages"]) && validReaderProgress(value.page, value.pages)) {
    return { type: value.type, itemId, page: value.page, pages: Number(value.pages) };
  }
  return null;
}
