import { Marked } from "marked";
function escape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
export function canvasMarkdown(source: string): string {
  const parser = new Marked({
    gfm: true,
    breaks: true,
    async: false,
    renderer: {
      html: ({ text }) => escape(text),
      image: ({ text }) => escape(text),
      link({ href, tokens }) {
        const label = this.parser.parseInline(tokens);
        try {
          const url = new URL(href);
          if (["http:", "https:", "mailto:"].includes(url.protocol)) {
            return `<a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
          }
        } catch {
          /* Invalid destinations remain text. */
        }
        return label;
      },
    },
  });
  return parser.parse(source) as string;
}
