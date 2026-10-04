export type Matrix = readonly number[];
export type Polygon = Array<{ x: number; y: number }>;
export function multiply(a: Matrix, b: Matrix): number[] {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
/** Image operators paint the unit square under the current graphics transform. */
export function imageRegions(
  list: { fnArray: number[]; argsArray: unknown[][] },
  ops: Record<string, number>,
  viewport: Matrix,
): Polygon[] {
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [],
    polygons: Polygon[] = [];
  const add = (extra?: Matrix) => {
    const m = multiply(viewport, extra ? multiply(matrix, extra) : matrix);
    if (!m.every(Number.isFinite)) return;
    polygons.push(
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ].map(([x, y]) => ({
        x: m[0] * x + m[2] * y + m[4],
        y: m[1] * x + m[3] * y + m[5],
      })),
    );
  };
  list.fnArray.forEach((op, index) => {
    const args = list.argsArray[index];
    if (op === ops.save || op === ops.paintFormXObjectBegin) {
      stack.push([...matrix]);
      if (op === ops.paintFormXObjectBegin && Array.isArray(args[0])) matrix = multiply(matrix, args[0]);
    } else if (op === ops.restore || op === ops.paintFormXObjectEnd) {
      matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    } else if (op === ops.transform) matrix = multiply(matrix, args as number[]);
    else if (
      op === ops.paintImageXObject ||
      op === ops.paintInlineImageXObject ||
      op === ops.paintImageMaskXObject
    )
      add();
    else if (op === ops.paintImageXObjectRepeat || op === ops.paintImageMaskXObjectRepeat) {
      const positions = args[op === ops.paintImageXObjectRepeat ? 3 : 5] as number[];
      const transform =
        op === ops.paintImageXObjectRepeat
          ? [Number(args[1]), 0, 0, Number(args[2])]
          : args.slice(1, 5).map(Number);
      for (let i = 0; i < positions.length; i += 2) add([...transform, positions[i], positions[i + 1]]);
    } else if (op === ops.paintInlineImageXObjectGroup || op === ops.paintImageMaskXObjectGroup) {
      const group = args[op === ops.paintInlineImageXObjectGroup ? 1 : 0] as Array<{ transform: number[] }>;
      for (const image of group) add(image.transform);
    }
  });
  return polygons;
}
