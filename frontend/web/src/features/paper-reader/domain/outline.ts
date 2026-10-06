import type { OutlineEntry } from "./types.js";
export type BlockHeading = OutlineEntry & { translation?: string };
function normalized(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^[\d.]+\s*/, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}
export function bilingualHeadings(outline: OutlineEntry[], blocks: BlockHeading[], enabled: boolean) {
  if (!outline.length) return blocks.map((b) => ({ ...b, translation: enabled ? b.translation : undefined }));
  return outline.map((entry) => {
    const title = normalized(entry.title);
    const match = blocks
      .filter((b) => b.page === entry.page)
      .find((b) => {
        const candidate = normalized(b.title);
        return (
          title === candidate ||
          (Math.min(title.length, candidate.length) > 6 &&
            (title.includes(candidate) || candidate.includes(title)))
        );
      });
    return { ...entry, translation: enabled ? match?.translation : undefined };
  });
}
