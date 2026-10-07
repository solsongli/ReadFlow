import test from "node:test";
import assert from "node:assert/strict";
import {
  alignmentBands,
  moveAlignmentLine,
  paragraphAt,
  snapAlignmentLine,
} from "../../src/features/paper-reader/domain/alignment.js";

const sizes = [{ width: 600, height: 800 }];
const lines = [
  { page: 1, text: "left one", x: 40, y: 80, width: 220, height: 12, size: 10 },
  { page: 1, text: "right one", x: 340, y: 80.5, width: 210, height: 11, size: 10 },
  { page: 1, text: "left two", x: 40, y: 110, width: 220, height: 12, size: 10 },
  { page: 1, text: "last", x: 40, y: 740, width: 160, height: 12, size: 10 },
];

test("line bands merge matching columns but keep distinct vertical rows", () => {
  const bands = alignmentBands(lines, sizes);
  assert.equal(bands.length, 3);
  assert.equal(bands[0].x0, 40 / 600);
  assert.equal(bands[0].x1, 550 / 600);
  assert.ok(Math.abs(bands[0].y - 0.1) < 0.001);
});

test("line snapping handles whitespace, either column and page edges", () => {
  const bands = alignmentBands(lines, sizes);
  assert.equal(snapAlignmentLine(bands, { page: 1, x: 0.9, y: 0.102 })?.index, 0);
  assert.equal(snapAlignmentLine(bands, { page: 1, x: 0.1, y: 0.13 })?.index, 1);
  assert.equal(snapAlignmentLine(bands, { page: 1, x: 0.5, y: 0 })?.index, 0);
  assert.equal(snapAlignmentLine(bands, { page: 1, x: 0.5, y: 1 })?.index, 2);
});

test("pinned movement clamps and paragraph hit chooses the smallest block", () => {
  const bands = alignmentBands(lines, sizes);
  assert.equal(moveAlignmentLine(bands, bands[0], -1)?.index, 0);
  assert.equal(moveAlignmentLine(bands, bands[0], 1)?.index, 1);
  assert.equal(moveAlignmentLine(bands, bands[2], 1)?.index, 2);
  const hit = paragraphAt(
    [
      { id: "outer", page: 1, rect: [0.1, 0.1, 0.9, 0.5] },
      { id: "inner", page: 1, rect: [0.2, 0.2, 0.5, 0.3] },
    ],
    { page: 1, x: 0.3, y: 0.25 },
  );
  assert.equal(hit?.id, "inner");
});
