/** Line breaking for the PNG export: Latin words stay whole, CJK breaks per character. */
export type Measure = (text: string) => number;
const TOKEN = /\n|[ \t]+|[⺀-鿿가-힯豈-﫿＀-￯]|[^\s⺀-鿿가-힯豈-﫿＀-￯]+/g;

export function wrapLines(value: string, width: number, measure: Measure, maxLines = Infinity): string[] {
  const lines: string[] = [];
  let line = "";
  const push = () => {
    lines.push(line.trimEnd());
    line = "";
  };
  for (const token of value.match(TOKEN) ?? []) {
    if (token === "\n") {
      push();
      continue;
    }
    if (/^[ \t]+$/.test(token)) {
      if (line) line += " ";
      continue;
    }
    if (measure(line + token) <= width) {
      line += token;
      continue;
    }
    if (line) push();
    if (measure(token) <= width) {
      line = token;
      continue;
    }
    // A single word wider than the card is the only case that breaks inside a word.
    for (const char of token) {
      if (line && measure(line + char) > width) push();
      line += char;
    }
  }
  if (line || !lines.length) push();
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = ellipsize(kept[maxLines - 1] + "…", width, measure);
  return kept;
}

export function ellipsize(value: string, width: number, measure: Measure): string {
  if (measure(value) <= width) return value;
  let text = value.replace(/…$/, "");
  while (text && measure(text + "…") > width) text = text.slice(0, -1);
  return text.trimEnd() + "…";
}
