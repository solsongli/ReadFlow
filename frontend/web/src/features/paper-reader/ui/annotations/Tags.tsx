import { useId, useMemo, useState } from "react";
import type { Annotation } from "../../domain/annotations/types.js";
import { normalizeAnnotationTag, tagSuggestions } from "../../domain/annotations/tags.js";
import type { AnnotationController } from "../../state/annotations/useAnnotations.js";

export function AnnotationTags({ row, controller: c }: { row: Annotation; controller: AnnotationController }) {
  const [value, setValue] = useState("");
  const list = useId();
  const tags = row.tags || [];
  const suggestions = useMemo(
    () => tagSuggestions(c.tagCatalog, c.rows, value, tags),
    [c.tagCatalog, c.rows, value, tags],
  );
  const add = () => {
    const tag = normalizeAnnotationTag(value);
    if (!tag || tags.some((entry) => entry.toLocaleLowerCase() === tag.toLocaleLowerCase())) return;
    setValue("");
    void c.update([row.id], { tags: [...tags, tag] });
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1" aria-label="批注标签">
      {tags.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-wb-fill px-2 py-0.5 text-wb-text-2">
          {tag}
          <button
            type="button"
            aria-label={`删除标签 ${tag}`}
            className="border-0 bg-transparent p-0 text-wb-text-3"
            onClick={() => void c.update([row.id], { tags: tags.filter((entry) => entry !== tag) })}
          >
            ×
          </button>
        </span>
      ))}
      {tags.length < 50 ? (
        <>
          <input
            list={list}
            aria-label="添加批注标签"
            placeholder="+标签"
            value={value}
            maxLength={60}
            className="min-w-16 flex-1 rounded-full border-0 bg-wb-fill px-2 py-0.5 text-[0.6875rem]"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
          />
          <datalist id={list}>{suggestions.map((tag) => <option key={tag} value={tag} />)}</datalist>
        </>
      ) : null}
    </div>
  );
}
