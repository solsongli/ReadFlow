import { useEffect, useState } from "react";
import { resolveMarkedVendorUrl } from "@/platform/runtime/vendor-url.js";
import { noteMarkdownParser, renderNoteMarkdown } from "../../domain/notes-markdown.js";

export function NotePreview({ body }: { body: string }) {
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    import(/* @vite-ignore */ resolveMarkedVendorUrl()).then(({ Marked }) => {
      if (live) { setHtml(renderNoteMarkdown(body, noteMarkdownParser(Marked))); setError(""); }
    }).catch(() => { if (live) setError("预览暂不可用，正文已保留。"); });
    return () => { live = false; };
  }, [body]);
  if (error) return <p role="status" className="text-[0.8125rem] text-wb-text-3">{error}</p>;
  // All raw HTML is escaped and all links are allowlisted by the domain renderer.
  return <div aria-label="Markdown 预览" className="font-wb-note min-h-64 break-words text-[1.0625rem] leading-[1.75] [&_a]:text-wb-link [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-wb-line-strong [&_blockquote]:pl-4 [&_h1]:text-[1.625rem] [&_h2]:text-[1.375rem] [&_h3]:text-[1.1875rem] [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_p]:my-3 [&_pre]:overflow-auto [&_pre]:rounded-xl [&_pre]:bg-wb-fill [&_pre]:p-4 [&_code]:font-wb-sans [&_table]:w-full [&_td]:border-b [&_td]:border-wb-line-soft [&_th]:text-left [&_td]:p-2 [&_th]:p-2" dangerouslySetInnerHTML={{ __html: html }} />;
}
