import { useMemo } from "react";
import { Marked } from "marked";
import { noteMarkdownParser, renderNoteMarkdown } from "@/platform/markdown/notes.js";
import { pageCitations } from "../../domain/assistance.js";
export function Answer({ text, pages, jump }: { text: string; pages: number; jump: (page: number) => void }) {
  const html = useMemo(() => {
    const pieces: string[] = [];
    let offset = 0;
    for (const citation of pageCitations(text, pages).slice(0, 200)) {
      pieces.push(
        text.slice(offset, citation.index),
        `[${citation.text}](https://readflow.invalid/page/${citation.page})`,
      );
      offset = citation.index + citation.text.length;
    }
    pieces.push(text.slice(offset));
    const source = pieces.join("");
    return renderNoteMarkdown(
      source,
      noteMarkdownParser(Marked as unknown as Parameters<typeof noteMarkdownParser>[0]),
    ).replace(
      /href="https:\/\/readflow\.invalid\/page\/(\d+)"/g,
      'href="#readflow-page-$1" data-paper-cite="$1"',
    );
  }, [text, pages]);
  function navigate(event: React.MouseEvent) {
    const anchor = (event.target as Element).closest<HTMLElement>("[data-paper-cite]");
    if (!anchor) {
      return;
    }
    event.preventDefault();
    const page = Number(anchor.dataset.paperCite);
    if (page >= 1 && page <= pages) {
      jump(page);
    }
  }
  return (
    <div
      className="break-words text-[0.8125rem] leading-relaxed [&_p]:my-2 [&_a]:text-wb-link [&_a]:underline [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_pre]:overflow-auto"
      onClick={navigate}
      onAuxClick={navigate}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
