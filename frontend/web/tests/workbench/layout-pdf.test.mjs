import test from "node:test";
import assert from "node:assert/strict";
import { pdfFormats } from "../../src/features/paper-blocks/domain/formats.js";
import { parseWorkbenchPrefs } from "../../src/features/workbench/domain/preferences.js";
import { labelAt } from "../../src/features/paper-blocks/domain/reading.js";
import { fitTypography } from "../../src/features/paper-blocks/domain/typography.js";

test("layout is the persistent default; legacy reflow and intermediate generation stay readable", () => {
  assert.equal(parseWorkbenchPrefs("{}").translationFormat, "layout");
  assert.equal(parseWorkbenchPrefs('{"translationFormat":"reflow"}').translationFormat, "reflow");
  assert.equal(parseWorkbenchPrefs('{"translationFormat":"unknown"}').translationFormat, "layout");
  assert.equal(pdfFormats({ revision: "old" }, "layout").selected, "reflow");
  assert.equal(
    pdfFormats({ layout_ready: true, reflow_ready: false }, "layout").filename,
    "translated-layout.pdf",
  );
  assert.equal(pdfFormats({ layout_ready: true, reflow_ready: true }, "reflow").filename, "translated.pdf");
});
test("long figure labels shrink further before ellipsis and hover exposes the full translation", () => {
  const normal = fitTypography("长标签译文", 24, 10, 10);
  const label = fitTypography("长标签译文", 24, 10, 10, undefined, 0.35);
  assert.equal(normal.overflow, true);
  assert.equal(label.overflow, false);
  assert.ok(label.size >= 3.5 && label.size < 6.5);
  const rows = [
    { page: 1, type: "figure", figure_text: [{ translation: "完整的长标签", bbox: [10, 20, 60, 30] }] },
  ];
  assert.equal(
    labelAt(rows, 1, { width: 100, height: 100, page_to_display: [1, 0, 0, 1, 0, 0] }, 0.3, 0.25).translation,
    "完整的长标签",
  );
});
