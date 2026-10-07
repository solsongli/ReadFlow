import { useEffect, useState } from "react";
import type { TodoPaper } from "../domain/model.js";

/** Inline library search used to link one paper to a to-do. */
export function PaperPicker({
  search,
  linked,
  choose,
  close,
}: {
  search: (query: string, signal: AbortSignal) => Promise<TodoPaper[]>;
  linked: boolean;
  choose: (paper: TodoPaper | null) => void;
  close: () => void;
}) {
  const [query, setQuery] = useState("");
  const [papers, setPapers] = useState<TodoPaper[]>([]);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setPapers([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      search(text, controller.signal)
        .then((rows) => {
          if (!controller.signal.aborted) {
            setPapers(rows.slice(0, 6));
            setIndex(0);
          }
        })
        .catch(() => undefined);
    }, 140);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, search]);
  return (
    <div className="mb-2 ml-[3.25rem] flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          role="combobox"
          aria-expanded={papers.length > 0}
          aria-controls="todo-paper-results"
          aria-label="搜索要关联的文献"
          placeholder="搜索题名、作者…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
            if (event.key === "ArrowDown") setIndex((i) => Math.min(papers.length - 1, i + 1));
            if (event.key === "ArrowUp") setIndex((i) => Math.max(0, i - 1));
            if (event.key === "Enter" && papers[index]) choose(papers[index]);
          }}
          className="h-7 min-w-0 flex-1 rounded-md border border-wb-line bg-wb-desk-inset px-2 text-[0.75rem] text-wb-text outline-none focus:border-wb-accent"
        />
        {linked ? (
          <button type="button" onClick={() => choose(null)} className="shrink-0 border-0 bg-transparent text-[0.75rem] text-wb-text-3 hover:text-wb-text">
            取消关联
          </button>
        ) : null}
      </div>
      {papers.length ? (
        <ul id="todo-paper-results" role="listbox" aria-label="文献搜索结果" className="m-0 flex list-none flex-col rounded-md bg-wb-desk-inset p-1">
          {papers.map((paper, position) => (
            <li key={paper.id} role="option" aria-selected={position === index}>
              <button
                type="button"
                onMouseEnter={() => setIndex(position)}
                onClick={() => choose(paper)}
                className={`w-full truncate rounded border-0 px-2 py-1 text-left text-[0.75rem] ${position === index ? "bg-wb-hover text-wb-text" : "bg-transparent text-wb-text-2"}`}
              >
                {paper.title}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
