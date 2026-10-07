import type { TextLine } from "./types.js";

export interface AlignmentBand {
  page: number;
  index: number;
  y: number;
  height: number;
  x0: number;
  x1: number;
}

export interface PagePoint {
  page: number;
  x: number;
  y: number;
}

export interface ParagraphBox {
  id: string;
  page: number;
  rect: number[];
}

export function alignmentBands(lines: TextLine[], sizes: Array<{ width: number; height: number }>): AlignmentBand[] {
  const rows: Omit<AlignmentBand, "index">[] = [];
  for (const line of lines) {
    const page = sizes[line.page - 1];
    if (!page) continue;
    const value = {
      page: line.page,
      y: line.y / page.height,
      height: Math.max(line.height / page.height, 0.004),
      x0: line.x / page.width,
      x1: (line.x + line.width) / page.width,
    };
    const match = [...rows]
      .reverse()
      .find(
        (row) =>
          row.page === value.page &&
          Math.abs(row.y + row.height / 2 - value.y - value.height / 2) <
            Math.max(0.003, Math.min(row.height, value.height) * 0.35),
      );
    if (match) {
      const bottom = Math.max(match.y + match.height, value.y + value.height);
      match.y = Math.min(match.y, value.y);
      match.height = bottom - match.y;
      match.x0 = Math.min(match.x0, value.x0);
      match.x1 = Math.max(match.x1, value.x1);
    } else rows.push(value);
  }
  return rows
    .sort((left, right) => left.page - right.page || left.y - right.y || left.x0 - right.x0)
    .map((row, index) => ({ ...row, index }));
}

function axisDistance(value: number, from: number, to: number) {
  return value < from ? from - value : value > to ? value - to : 0;
}

export function snapAlignmentLine(bands: AlignmentBand[], point: PagePoint) {
  return bands
    .filter((band) => band.page === point.page)
    .sort((left, right) => {
      const vertical =
        axisDistance(point.y, left.y, left.y + left.height) -
        axisDistance(point.y, right.y, right.y + right.height);
      if (vertical) return vertical;
      return axisDistance(point.x, left.x0, left.x1) - axisDistance(point.x, right.x0, right.x1);
    })[0];
}

export function moveAlignmentLine(bands: AlignmentBand[], current: AlignmentBand, direction: -1 | 1) {
  return bands[Math.max(0, Math.min(bands.length - 1, current.index + direction))];
}

export function paragraphAt(boxes: ParagraphBox[], point: PagePoint) {
  return boxes
    .filter(
      ({ page, rect }) =>
        page === point.page &&
        point.x >= rect[0] &&
        point.x <= rect[2] &&
        point.y >= rect[1] &&
        point.y <= rect[3],
    )
    .sort(
      (left, right) =>
        (left.rect[2] - left.rect[0]) * (left.rect[3] - left.rect[1]) -
        (right.rect[2] - right.rect[0]) * (right.rect[3] - right.rect[1]),
    )[0];
}
