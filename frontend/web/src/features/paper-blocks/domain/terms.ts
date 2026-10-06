import type { Block, PaperTerm } from "./model.js";
export interface LocatedTerm extends PaperTerm {
  page: number;
  y: number;
  sentence: string;
}
export function termKey(source: string) {
  return source
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[‐‑–—-]/g, " ")
    .replace(/\s+/g, " ");
}
function expression(source: string) {
  const parts = termKey(source).split(" ").filter(Boolean);
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (/[\u3400-\u9fff]/.test(source)) return new RegExp(escape(source), "gu");
  const last = parts.pop() || "";
  const plural = /[^aeiou]y$/.test(last)
    ? `${escape(last.slice(0, -1))}(?:y|ies)`
    : /(?:s|x|z|ch|sh)$/.test(last)
      ? `${escape(last)}(?:es)?`
      : `${escape(last)}s?`;
  return new RegExp(
    `(?<![\\p{L}\\p{N}_])${parts.map(escape).concat(plural).join("[\\s‐‑–—-]+")}(?![\\p{L}\\p{N}_])`,
    "giu",
  );
}
export function compileTerms(terms: PaperTerm[]) {
  return terms
    .filter((t) => t.source.trim() && t.target.trim())
    .slice(0, 200)
    .map((term) => ({ term, re: expression(term.source) }));
}
export function termMatches(text: string, compiled: ReturnType<typeof compileTerms>) {
  const candidates = compiled
    .flatMap(({ term, re }) => {
      re.lastIndex = 0;
      return [...text.matchAll(re)].map((m) => ({ term, start: m.index!, end: m.index! + m[0].length }));
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const result: typeof candidates = [];
  let end = -1;
  for (const match of candidates) {
    if (match.start < end) continue;
    result.push(match);
    end = match.end;
  }
  return result;
}
export function locateTerms(blocks: Block[], paper: PaperTerm[], user: PaperTerm[] = []): LocatedTerm[] {
  const unique = new Map<string, PaperTerm>();
  for (const term of [...paper, ...user])
    if (term.source.trim() && term.target.trim()) unique.set(termKey(term.source), term);
  const unresolved = compileTerms([...unique.values()]);
  const found = new Map<string, LocatedTerm>();
  for (const block of blocks) {
    if (
      ["header", "footer", "reference", "author", "figure", "table", "formula", "algorithm", "code"].includes(
        block.type,
      )
    )
      continue;
    for (const match of termMatches(block.text, unresolved)) {
      const key = termKey(match.term.source);
      if (found.has(key)) continue;
      const before = block.text.slice(0, match.start);
      const start = Math.max(before.lastIndexOf(". "), before.lastIndexOf("。")) + 1;
      const ending = block.text.slice(match.end).search(/[.!?。！？](?:\s|$)/);
      const end = ending < 0 ? block.text.length : match.end + ending + 1;
      let anchor = block.anchors[0];
      for (const [index, continuation] of (block.continuations || []).entries()) {
        const boundary = continuation.source_start ? block.text.indexOf(continuation.source_start) : -1;
        if (boundary >= 0 && match.start >= boundary && block.anchors[index + 1])
          anchor = block.anchors[index + 1];
      }
      found.set(key, {
        ...match.term,
        page: anchor?.page || block.page,
        y: anchor?.view_bbox[1] || 0,
        sentence: block.text.slice(start, end).trim().slice(0, 1600),
      });
    }
  }
  return [...found.values()];
}
export function termKind(kind?: string) {
  return (
    { acronym: "缩写", name: "模型 / 数据集", term: "学术术语", user: "用户术语", definition: "定义" }[
      kind || "term"
    ] || "学术术语"
  );
}
