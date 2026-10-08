import { useId, useState } from "react";
import { cn } from "@/ui/lib/utils.js";
import { Chip } from "@/ui/wb/Chip.js";
import { normalizeTag, rowColoredTags, suggestTags, TAG_DOT } from "../../domain/tags.js";
import { useWb, useWorkbench } from "../context.js";

/** Zotero-style tag editing for one or several papers: chips with remove, autocomplete input, Enter to add. */
export function TagEditor({ ids, tags, align = "end" }: { ids: string[]; tags: string[]; align?: "start" | "end" }) {
  const wb = useWorkbench();
  const library = useWb((state) => state.list.result?.tags ?? []);
  const colors = useWb((state) => state.tagColors);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(-1);
  const listId = useId();
  const suggestions = open ? suggestTags(library.map((entry) => entry.name), draft, tags) : [];
  const colored = new Map(rowColoredTags(tags, colors).map((entry) => [entry.name, entry.color]));
  function add(value: string) {
    const tag = normalizeTag(value);
    setDraft("");
    setIndex(-1);
    if (tag && !tags.includes(tag)) void wb.tags.apply(ids, [tag]);
  }
  return (
    <span className={cn("flex min-w-0 flex-col gap-1.5", align === "end" ? "items-end" : "items-start")}>
      {tags.length ? (
        <span className={cn("flex flex-wrap gap-1", align === "end" && "justify-end")}>
          {tags.map((tag) => (
            <Chip key={tag} removeLabel={`移除标签「${tag}」`} onRemove={() => void wb.tags.apply(ids, [], [tag])}>
              {colored.has(tag) ? (
                <span aria-hidden="true" className={cn("mr-1 inline-block h-2 w-2 rounded-full align-middle", TAG_DOT[colored.get(tag)!])} />
              ) : null}
              {tag}
            </Chip>
          ))}
        </span>
      ) : null}
      <span className="relative w-full max-w-[14rem]">
        <input
          role="combobox"
          aria-label={ids.length > 1 ? `为所选 ${ids.length} 篇添加标签` : "添加标签"}
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
          aria-activedescendant={index >= 0 ? `${listId}-${index}` : undefined}
          placeholder="添加标签，回车确认"
          value={draft}
          maxLength={200}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setDraft(event.target.value);
            setIndex(-1);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown") setIndex((value) => Math.min(suggestions.length - 1, value + 1));
            else if (event.key === "ArrowUp") setIndex((value) => Math.max(-1, value - 1));
            else if (event.key === "Enter") {
              event.preventDefault();
              add(index >= 0 && suggestions[index] ? suggestions[index] : draft);
            } else if (event.key === "Escape") {
              setDraft("");
              setOpen(false);
            } else return;
            event.stopPropagation();
          }}
          className="h-7 w-full rounded-md border border-wb-line bg-wb-fill px-2 text-[0.75rem] text-wb-text outline-none placeholder:text-wb-text-3 focus:border-wb-accent"
        />
        {suggestions.length ? (
          <ul id={listId} role="listbox" aria-label="已有标签" className="absolute right-0 top-8 z-20 m-0 flex max-h-48 w-full list-none flex-col overflow-auto rounded-md border border-wb-line bg-wb-panel p-1 shadow-wb-card">
            {suggestions.map((name, position) => (
              <li key={name} id={`${listId}-${position}`} role="option" aria-selected={position === index}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => add(name)}
                  className={cn("w-full truncate rounded border-0 px-2 py-1 text-left text-[0.75rem]", position === index ? "bg-wb-hover text-wb-text" : "bg-transparent text-wb-text-2 hover:bg-wb-hover")}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </span>
    </span>
  );
}
