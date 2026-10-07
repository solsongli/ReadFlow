import test from "node:test";
import assert from "node:assert/strict";
import {
  assignMarginSides,
  floatingMargin,
  leaderEndpoint,
  marginSide,
  marginSpace,
  packMargins,
} from "../../src/ui/wb/margin-layout.js";
import { rasterRatio, rasterDimensions } from "../../src/features/paper-reader/domain/navigation.js";
import { marginTypography } from "../../src/features/paper-blocks/domain/margin-typography.js";
import { displayTranslationRuns } from "../../src/features/paper-blocks/domain/reading.js";
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
test("compact cards grow into the free rail below without moving neighbours", () => {
  const placed = packMargins(
    [
      { id: "a", x: 0.2, y: 0.1, height: 104, grow: 400 },
      { id: "b", x: 0.2, y: 0.4, height: 104, grow: 60 },
      { id: "c", x: 0.2, y: 0.9, height: 104, grow: 500 },
    ],
    1000,
  );
  assert.deepEqual(
    placed.map((p) => p.top),
    [100, 400, 896],
  );
  // a stops one gap short of b; b keeps its minimum; c is bounded by the page bottom.
  assert.deepEqual(
    placed.map((p) => p.height),
    [292, 104, 104],
  );
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
  const prefs = {
    marginNotes: false,
    marginSide: "right",
    marginTranslations: true,
    alignmentGuide: false,
  };
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
test("wide single-column blocks greedily use both rails while real columns keep their side", () => {
  const wide = Array.from({ length: 6 }, (_, index) => ({
    id: `wide-${index}`,
    x: 0.12,
    right: 0.88,
    y: 0.08 + index * 0.1,
    height: 180,
  }));
  const assigned = assignMarginSides(wide, 1000, 300, 300, "auto");
  assert.deepEqual(new Set(assigned.map((entry) => entry.side)), new Set(["left", "right"]));
  const columns = assignMarginSides(
    [
      { id: "left", x: 0.08, right: 0.44, y: 0.2, height: 90 },
      { id: "right", x: 0.56, right: 0.92, y: 0.2, height: 90 },
    ],
    1000,
    300,
    300,
    "auto",
  );
  assert.deepEqual(
    columns.map((entry) => entry.side),
    ["left", "right"],
  );
  assert.ok(assignMarginSides(wide, 1000, 300, 300, "right").every((entry) => entry.side === "right"));
});
test("leader ends at the block edge nearest its rail", () => {
  const entry = { x: 0.16, right: 0.84 };
  assert.equal(leaderEndpoint("left", entry, 1000), 160);
  assert.equal(leaderEndpoint("right", entry, 1000), 840);
});
test("legacy translated paragraphs recover a bold lead from the real block font boundary", () => {
  const block = {
    type: "text",
    text: "Generalist Robot Policies A recent trend",
    translation: "通用机器人策略 机器人学最近的趋势",
    translation_runs: [{ kind: "text", text: "通用机器人策略 机器人学最近的趋势" }],
    start_font: "NimbusRomNo9L-Medi",
    text_font: "NimbusRomNo9L-Regu",
  };
  const runs = displayTranslationRuns(block);
  assert.equal(runs[0].text, "通用机器人策略");
  assert.equal(runs[0].bold, true);
  assert.equal(runs.map((run) => run.text).join(""), block.translation);
});
test("SAM-style translated run-in heads recover through punctuation without inserted spacing", () => {
  const block = {
    type: "text",
    text: "Task. We start by translating the idea",
    translation: "任务。我们首先迁移这一概念。",
    translation_runs: [{ kind: "text", text: "任务。我们首先迁移这一概念。" }],
    start_font: "NimbusRomNo9L-Medi",
    text_font: "NimbusRomNo9L-Regu",
  };
  const runs = displayTranslationRuns(block);
  assert.deepEqual(runs[0], { kind: "text", text: "任务。", bold: true });
  assert.equal(runs.map((run) => run.text).join(""), block.translation);
});
test("cached PDF math controls and modifier quotes become printable without rewriting cache", () => {
  const block = {
    type: "text",
    translation: "N\u00000,σ²I\u0001 通用˝\u0007Strategyθ",
    translation_runs: [
      { kind: "text", text: "N\u00000,σ²I\u0001 通用˝\u0007" },
      { kind: "sub", text: "Strategy" },
      { kind: "sub", text: "θ" },
    ],
  };
  const runs = displayTranslationRuns(block);
  assert.equal(runs.map((run) => run.text).join(""), "N(0,σ²I) 通用”Strategyθ");
  assert.deepEqual(runs.slice(-2).map((run) => run.kind), ["text", "sub"]);
});
