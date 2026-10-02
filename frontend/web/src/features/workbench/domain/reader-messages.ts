import { isWorkbenchScheme, type WorkbenchScheme } from "@retainpdf/reader/contracts";
export { parseWorkbenchReaderMessage, trustedWorkbenchMessage, SOFT_READER_CLOSE_MESSAGE } from "@retainpdf/reader/contracts";

export function resolveWorkbenchScheme(preference: string, systemDark: boolean): WorkbenchScheme {
  return isWorkbenchScheme(preference) ? preference : systemDark ? "dark" : "light";
}

/** Restrict iframe navigation to this origin's reader and bind it to the tab's paper. */
export function workbenchReaderUrl(raw: string, base: string, itemId: string, scheme: WorkbenchScheme, page?: number | null): string | null {
  try {
    const url = new URL(raw, base);
    if (url.origin !== new URL(base).origin || !url.pathname.endsWith("/reader.html")) return null;
    url.searchParams.set("embed", "workbench");
    url.searchParams.set("scheme", scheme);
    url.searchParams.set("research_item_id", itemId);
    if (Number.isInteger(page) && Number(page) >= 1 && Number(page) <= 100000) {
      url.searchParams.set("page_idx", String(Number(page) - 1));
      for (const key of ["page", "block_id", "blockId"]) url.searchParams.delete(key);
    }
    return url.href;
  } catch { return null; }
}
