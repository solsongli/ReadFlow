/** Marked owns Markdown parsing; this renderer has no DOM, network or global parser mutation. */
export function escapeNoteHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
export function safeNoteLink(href: string): string | null {
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
interface MarkedParser { parse: (source: string) => string | Promise<string> }
export interface MarkedConstructor { new(options: Record<string, unknown>): MarkedParser }
export function noteMarkdownParser(Marked: MarkedConstructor): MarkedParser {
  return new Marked({ gfm: true, breaks: true, async: false, renderer: {
    html: ({ text }: { text: string }) => escapeNoteHtml(text),
    // Images remain text: previewing a note never fetches an untrusted image URL.
    image: ({ text }: { text: string }) => escapeNoteHtml(text),
    link(this: { parser: { parseInline: (tokens: unknown[]) => string } }, { href, title, tokens }: { href: string; title?: string; tokens: unknown[] }) {
      const label = this.parser.parseInline(tokens), safe = safeNoteLink(href);
      return safe ? `<a href="${escapeNoteHtml(safe)}" rel="noopener noreferrer" target="_blank"${title ? ` title="${escapeNoteHtml(title)}"` : ""}>${label}</a>` : label;
    },
  } });
}
export function renderNoteMarkdown(source: string, parser: MarkedParser): string {
  const result = parser.parse(source);
  if (typeof result !== "string") throw new Error("笔记预览需要同步 Markdown 解析器。");
  return result;
}
