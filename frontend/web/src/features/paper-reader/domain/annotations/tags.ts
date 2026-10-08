import type { Annotation } from "./types.js";

export function normalizeAnnotationTag(value: string) {
  const tag = value.trim().replace(/\s+/gu, " ");
  return tag && tag.length <= 60 && !/[\u0000-\u001f]/u.test(tag) ? tag : "";
}

export function tagSuggestions(
  catalog: string[],
  paper: Annotation[],
  query: string,
  selected: string[] = [],
) {
  const needle = normalizeAnnotationTag(query).toLocaleLowerCase();
  const seen = new Set(selected.map((tag) => tag.toLocaleLowerCase()));
  return [...catalog, ...paper.flatMap((row) => row.tags || [])]
    .filter(
      (tag, index, values) =>
        values.findIndex((value) => value.toLocaleLowerCase() === tag.toLocaleLowerCase()) === index,
    )
    .filter((tag) => !seen.has(tag.toLocaleLowerCase()))
    .filter((tag) => !needle || tag.toLocaleLowerCase().includes(needle))
    .sort((left, right) => left.localeCompare(right, "zh-CN"))
    .slice(0, 12);
}

export function annotationMatches(
  row: Annotation,
  filters: {
    query: string;
    tags: string[];
    color: string;
    type: string;
    onlyPage: boolean;
    page: number;
    notes: string;
    hasCard: boolean;
  },
) {
  const tags = row.tags || [];
  return (
    (!filters.color || row.color === filters.color) &&
    (!filters.type || row.type === filters.type) &&
    (!filters.onlyPage || row.page_index === filters.page - 1) &&
    (!filters.notes || Boolean(row.note.trim()) === (filters.notes === "yes")) &&
    (!filters.tags.length || filters.tags.some((tag) => tags.includes(tag))) &&
    `${row.quote} ${row.note}`.toLocaleLowerCase().includes(filters.query.trim().toLocaleLowerCase())
  );
}
