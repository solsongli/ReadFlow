import test from "node:test";
import assert from "node:assert/strict";
import { marginSpace, marginSide, packMargins, floatingMargin } from "../../src/ui/wb/margin-layout.js";
import { rasterRatio, rasterDimensions } from "../../src/features/paper-reader/domain/navigation.js";
import { marginTypography } from "../../src/features/paper-blocks/domain/margin-typography.js";
import { parseWorkbenchPrefs } from "../../src/features/workbench/domain/preferences.js";
import { initialWorkbenchState, prefsOf } from "../../src/features/workbench/domain/workbench-store.js";
test("reader oversamples DPR 1, retains native DPR and bounds all zoom levels", () => {
  for (const dpr of [1, 1.5, 2, 3, 4])
    for (const zoom of [1, 1.5, 2]) {
      const w = 612 * zoom,
        h = 792 * zoom,
        r = rasterRatio(w, h, dpr);
      assert.ok(w * h * r * r <= 16000001);
      if (w * h * dpr * dpr <= 16000000) assert.ok(r >= dpr);
    }
  assert.equal(rasterRatio(612, 792, 1), 1.75);
});
test("margin fit-width reserves readable gutters and narrows to icons", () => {
  assert.deepEqual(marginSpace(600, true), { left: 20, right: 20 });
  assert.deepEqual(marginSpace(900, true), { left: 20, right: 260 });
  assert.deepEqual(marginSpace(1500, true), { left: 250, right: 250 });
  assert.equal(marginSide(0.2, 250, 250, "auto"), "left");
  assert.equal(marginSide(0.2, 20, 250, "auto"), "right");
  assert.equal(marginSide(0.2, 250, 250, "right"), "right");
});
test("mixed translation and annotation cards retain anchor order without overlap or page spill", () => {
  const entries = Array.from({ length: 20 }, (_, i) => ({
    id: String(i),
    x: 0.2,
    y: 0.02 + i * 0.02,
    height: 120,
  }));
  const placed = packMargins(entries, 1100);
  assert.equal(placed.length, 20);
  assert.ok(placed[0].top >= 0);
  for (let i = 1; i < placed.length; i++)
    assert.ok(placed[i].top >= placed[i - 1].top + placed[i - 1].height + 7.9);
  assert.ok(placed.at(-1).top + placed.at(-1).height <= 1100);
});
test("narrow fallback card never covers its original block", () => {
  for (const anchor of [
    { top: 200, bottom: 400, left: 50, right: 550 },
    { top: 680, bottom: 740, left: 50, right: 550 },
  ]) {
    const box = floatingMargin(anchor, { width: 650, height: 800 });
    assert.ok(box.top + box.maxHeight <= anchor.top || box.top >= anchor.bottom);
    assert.ok(box.left >= 0 && box.left + box.width <= 650);
  }
});
test("margin typography preserves original title hierarchy and rich-run owner", () => {
  assert.equal(marginTypography({ type: "heading", size: 18 }, 1).fontWeight, 650);
  assert.equal(marginTypography({ type: "text", size: 12 }, 1).fontSize, 12);
  assert.equal(marginTypography({ type: "caption", size: 8 }, 0.5).fontSize, 11);
});
test("margin preferences round-trip through safe existing preferences storage", () => {
  const prefs = { marginNotes: false, marginSide: "right", marginTranslations: true };
  const roundtrip = parseWorkbenchPrefs(JSON.stringify(prefsOf(initialWorkbenchState(prefs))));
  for (const key of Object.keys(prefs)) assert.equal(roundtrip[key], prefs[key]);
  assert.equal(parseWorkbenchPrefs('{"marginSide":"unexpected"}').marginSide, "auto");
});

test("bitmap rounding honors fractional CSS dimensions and the exact total-pixel ceiling", () => {
  for (const dpr of [1, 2, 3, 4])
    for (const width of [595.275, 1224.3, 2448.6]) {
      const height = width * 1.414,
        result = rasterDimensions(width, height, dpr);
      assert.ok(result.width * result.height <= 16000000);
      if (width * height * dpr * dpr < 15900000) {
        assert.ok(result.width >= width * dpr);
        assert.ok(result.height >= height * dpr);
      }
    }
});

test("paragraph gutters scale with the page while small viewports retain the narrow fallback", () => {
  const plan = marginSpace(1680, true, "auto", true);
  const page = 1680 - plan.left - plan.right;
  assert.ok(Math.abs(plan.left - 24 - page * 0.4) < 55);
  assert.deepEqual(marginSpace(780, true, "auto", true), { left: 20, right: 20 });
});
