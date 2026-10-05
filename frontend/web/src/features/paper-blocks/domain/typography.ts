/** Shared deterministic estimate; DOM measurement tightens it for the actual installed serif font. */
export function lineCount(text: string, width: number, size: number) {
  if (width <= 0 || size <= 0) return Infinity;
  let lines = 1,
    line = 0;
  for (const char of text) {
    if (char === "\n") {
      lines++;
      line = 0;
      continue;
    }
    const advance = size * (/\s/u.test(char) ? 0.28 : /[\u0000-\u024f]/u.test(char) ? 0.53 : 1);
    if (line && line + advance > width) {
      lines++;
      line = 0;
    }
    line += advance;
  }
  return lines;
}
export function fitTypography(
  text: string,
  width: number,
  height: number,
  base: number,
  measure = (size: number) => lineCount(text, width, size) * size * 1.18,
) {
  const original = Math.max(1, base),
    minimum = original * 0.65;
  if (measure(original) <= height) return { size: original, overflow: false };
  if (measure(minimum) > height) return { size: minimum, overflow: true };
  let lo = minimum,
    hi = original;
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    if (measure(mid) <= height) lo = mid;
    else hi = mid;
  }
  return { size: lo, overflow: false };
}
export function typographyScale(box: number[], native: number[], pageWidth: number) {
  return ((box[2] - box[0]) * pageWidth) / Math.max(1, native[2] - native[0]);
}
