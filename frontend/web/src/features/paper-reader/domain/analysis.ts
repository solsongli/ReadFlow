import type { FigureTarget, OutlineEntry, Reference, TextLine } from "./types.js";
export function citationMarkers(text: string): { numbers: number[]; author?: string; year?: string } | null {
  const bracket = text.match(/\[([\d\s,，;；–—-]+)\]/);
  if (bracket) {
    const numbers: number[] = [];
    for (const part of bracket[1].split(/[,，;；]/)) {
      const range = part.trim().match(/^(\d+)\s*[–—-]\s*(\d+)$/);
      if (range) {
        const start = +range[1],
          end = +range[2];
        if (end >= start && end - start <= 50) {
          for (let n = start; n <= end; n++) {
            numbers.push(n);
          }
        }
      } else if (/^\s*\d+\s*$/.test(part)) {
        numbers.push(+part);
      }
    }
    return numbers.length ? { numbers: [...new Set(numbers)] } : null;
  }
  const author = text.match(
    /[（(]?([A-Z][\p{L}'-]+)(?:\s+(?:et\s+al\.?|and\s+[A-Z][\p{L}'-]+))?\s*[,，]\s*((?:19|20)\d{2})[a-z]?[)）]?/u,
  );
  return author ? { numbers: [], author: author[1].toLowerCase(), year: author[2] } : null;
}
export function parseReferences(lines: TextLine[]): Reference[] {
  const heading = /^(?:\d+(?:\.\d+)*\.?\s+)?(?:references|bibliography|参考文献)\s*$/i;
  const candidates = lines
    .map((line, index) => (heading.test(line.text.trim()) ? index : -1))
    .filter((index) => index >= 0);
  const start =
    candidates.find((index) => lines[index].page >= (lines.at(-1)?.page ?? 1) / 2) ?? candidates[0] ?? -1;
  if (start < 0) {
    return [];
  }
  const refs: Reference[] = [];
  for (const line of lines.slice(start + 1)) {
    if (heading.test(line.text.trim())) {
      continue;
    }
    if (
      /^(?:appendix|appendices|acknowledg(?:e)?ments|supplementary|附录)/i.test(line.text.trim()) &&
      line.size > 12
    ) {
      break;
    }
    if (/^\d+(?:\.\d+)*\s+[A-Z]/.test(line.text.trim()) && line.size >= 16) {
      break;
    }
    if (line.y < 60 && lines.some((other) => other.page !== line.page && other.text === line.text)) {
      continue;
    }
    const numbered = line.text.match(/^\s*(?:\[(\d+)\]|(\d+)[.)])\s*(.+)/);
    const authorStart =
      /^[A-Z][\p{L}'-]+,\s+[A-Z]\./u.test(line.text) ||
      (/^(?:[A-Z][\p{L}'-]+,?\s+[A-Z]|[A-Z][\p{L}'-]+\s+et al)/u.test(line.text) &&
        /(?:19|20)\d{2}/.test(line.text));
    if (numbered || authorStart || !refs.length) {
      const text = numbered ? numbered[3] : line.text;
      if (!text.trim() || /^\d+$/.test(text.trim())) {
        continue;
      }
      refs.push({
        id: `ref-${refs.length}`,
        number: numbered ? +(numbered[1] || numbered[2]) : undefined,
        text,
        title: "",
        author: "",
        year: "",
        page: line.page,
        y: line.y,
      });
    } else if (!/^\d+$/.test(line.text.trim())) {
      refs[refs.length - 1].text += " " + line.text;
    }
  }
  return refs.map((ref) => {
    const year = ref.text.match(/\b((?:19|20)\d{2})\b/)?.[1] ?? "";
    const author = ref.text.match(/^[\p{L}'-]+/u)?.[0]?.toLowerCase() ?? "";
    const tail = year ? ref.text.slice(ref.text.indexOf(year) + 4).replace(/^[\s).,;:]+/, "") : ref.text;
    const quoted = ref.text.match(/[“"]([^”"]{10,})[”"]/)?.[1];
    const beforeYear = year ? ref.text.slice(0, ref.text.indexOf(year)) : ref.text;
    const priorTitle = beforeYear
      .split(/\.\s+/)
      .slice(1)
      .find(
        (part) => part.trim().length > 14 && !/^(?:et al|in |proceedings|journal|vol\b)/i.test(part.trim()),
      );
    const title = (quoted || priorTitle || tail.split(/\.\s+/)[0].trim() || ref.text).replace(
      /[.;。\s]+$/,
      "",
    );
    return { ...ref, year, author, title };
  });
}
export function findReferences(
  text: string,
  refs: Reference[],
  destination?: { page: number; y: number },
): Reference[] {
  if (destination) {
    const onPage = refs.filter((ref) => ref.page === destination.page);
    if (onPage.length) {
      return [
        onPage.reduce((a, b) => (Math.abs(a.y - destination.y) <= Math.abs(b.y - destination.y) ? a : b)),
      ];
    }
  }
  const marker = citationMarkers(text);
  return marker
    ? refs.filter(
        (ref) =>
          marker.numbers.includes(ref.number!) || (marker.author === ref.author && marker.year === ref.year),
      )
    : [];
}
export function figureReference(text: string): { kind: FigureTarget["kind"]; number: string } | null {
  const m = text.match(/\b(Figure|Fig\.?|Table|Eq\.?|Equation)\s*\(?([\d]+[a-z]?)\)?|([图表])\s*(\d+)/i);
  if (!m) {
    return null;
  }
  const word = (m[1] || m[3]).toLowerCase();
  return {
    kind: /table|表/.test(word) ? "table" : /eq/.test(word) ? "equation" : "figure",
    number: m[2] || m[4],
  };
}
export function figureTargets(lines: TextLine[], heights: number[]): FigureTarget[] {
  return lines.flatMap((line) => {
    const equation = line.text.match(/\((\d+)\)\s*$/);
    if (equation && ((line.x > 300 && /^\(\d+\)$/.test(line.text.trim())) || /[=∑∫]/.test(line.text))) {
      return [
        {
          id: `equation-${equation[1]}`,
          kind: "equation" as const,
          number: equation[1],
          caption: line.text,
          page: line.page,
          top: Math.max(0, line.y - 55),
          bottom: Math.min(heights[line.page - 1] ?? 842, line.y + 65),
        },
      ];
    }
    const target = figureReference(line.text);
    if (
      !target ||
      !/^(?:Figure|Fig\.?|Table|Eq\.?|Equation|[图表])\s*\(?\d+[a-z]?\)?\s*[:：.]/i.test(line.text.trim())
    ) {
      return [];
    }
    const height = heights[line.page - 1] ?? 842;
    return [
      {
        ...target,
        id: `${target.kind}-${target.number}`,
        caption: line.text,
        page: line.page,
        top: target.kind === "table" ? line.y : Math.max(0, line.y - height * 0.42),
        bottom: Math.min(height, target.kind === "table" ? line.y + height * 0.4 : line.y + line.height * 2),
      },
    ];
  });
}
export function heuristicOutline(lines: TextLine[]): OutlineEntry[] {
  const sizes = lines.map((line) => line.size).sort((a, b) => a - b),
    body = sizes[Math.floor(sizes.length / 4)] ?? 10;
  return lines
    .filter((line) => {
      const title = line.text.trim();
      return (
        title.length < 130 &&
        (/^(Abstract|References|Bibliography|Conclusion|摘要|参考文献)$/i.test(title) ||
          (/^\d+(?:\.\d+){0,3}\.?\s+\D/.test(title) && line.size >= body * 1.08))
      );
    })
    .map((line, index) => ({
      id: `heading-${index}`,
      title: line.text,
      page: line.page,
      y: line.y,
      level: Math.min(4, (line.text.match(/^\d+(\.\d+)*/)?.[0].match(/\./g)?.length ?? 0) + 1),
    }));
}
export function searchLines(lines: TextLine[], query: string) {
  const needle = query.trim().toLocaleLowerCase();
  return needle
    ? lines
        .filter((line) => line.text.toLocaleLowerCase().includes(needle))
        .map(({ page, text, y }) => ({ page, text, y }))
    : [];
}
export function quoteReference(
  text: string,
  authors: string[],
  year: string,
  page: number,
  gbt?: string,
): string {
  if (gbt) {
    return `“${text.trim()}”\n${gbt} 第 ${page} 页。`;
  }
  const first = authors[0]?.trim() || "佚名",
    name = first.includes(",") ? first.split(",")[0] : first.split(/\s+/).at(-1);
  return `“${text.trim()}” (${name}${authors.length > 1 ? " et al." : ""}, ${year || "n.d."}, p. ${page})`;
}
