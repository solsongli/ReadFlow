export interface HighlightPart {
  match: number;
  span: number;
  start: number;
  end: number;
}

export function spanSeparator(
  left: string,
  right: string,
  gap: number,
  size: number,
  sameLine = true,
) {
  if (!left || !right || /\s$/u.test(left) || /^\s/u.test(right)) return "";
  return sameLine && gap <= Math.max(0.5, size * 0.12) ? "" : " ";
}

export function joinedSearchText(texts: string[], separators: string[]) {
  return texts.map((text, index) => text + (separators[index] || "")).join("");
}

export function splitSearchMatches(
  texts: string[],
  matches: Array<[number, number]>,
  separators = texts.map((_, index) => (index < texts.length - 1 ? " " : "")),
) {
  const spans = [];
  let offset = 0;
  for (const [index, text] of texts.entries()) {
    spans.push({ index, start: offset, end: offset + text.length });
    offset += text.length + (separators[index]?.length || 0);
  }
  return matches.flatMap(([from, to], match) =>
    spans.flatMap((span): HighlightPart[] => {
      const start = Math.max(from, span.start);
      const end = Math.min(to, span.end);
      return end > start
        ? [{ match, span: span.index, start: start - span.start, end: end - span.start }]
        : [];
    }),
  );
}
