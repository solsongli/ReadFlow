import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { blockAt, busy, plainClick } from "../../src/features/paper-blocks/domain/model.js";
import { parseWorkbenchPrefs } from "../../src/features/workbench/domain/preferences.js";

test("block hit testing respects page, smallest region, and excluded margins", () => {
  const block = (id, page, type, box) => ({ id, type, anchors: [{ page, view_bbox: box }] });
  const body = block("body", 1, "text", [0.1, 0.1, 0.9, 0.7]);
  const formula = block("formula", 1, "formula", [0.2, 0.3, 0.5, 0.4]);
  const rows = [
    body,
    formula,
    block("other", 2, "text", [0, 0, 1, 1]),
    block("margin", 1, "header", [0.2, 0.3, 0.3, 0.4]),
  ];
  assert.equal(blockAt(rows, 1, 0.25, 0.35).block.id, "formula");
  assert.equal(blockAt(rows, 1, 0.8, 0.6).block.id, "body");
  assert.equal(blockAt(rows, 1, 0.95, 0.95), undefined);
});

test("dragging, text selections, double clicks and existing reference handlers own their gestures", () => {
  assert.equal(plainClick(0, "", 1, false), true);
  for (const values of [
    [9, "", 1, false],
    [0, "selected", 1, false],
    [0, "", 2, false],
    [0, "", 1, true],
  ]) {
    assert.equal(plainClick(...values), false);
  }
  assert.ok(busy("cancelling") && busy("queued") && busy("running"));
  assert.equal(busy("done"), false);
});

test("block target language persists in existing preferences and rejects unsupported stored values", () => {
  assert.equal(parseWorkbenchPrefs("{}").blockLanguage, "zh-CN");
  for (const blockLanguage of ["zh-CN", "en", "ja", "de", "fr"]) {
    assert.equal(parseWorkbenchPrefs(JSON.stringify({ blockLanguage })).blockLanguage, blockLanguage);
  }
  assert.equal(parseWorkbenchPrefs('{"blockLanguage":"unsupported"}').blockLanguage, "zh-CN");
});

test("PyMuPDF block anchors match actual pdf.js viewports with CropBox, MediaBox offsets and four rotations", async () => {
  const directory = "tests/fixtures/blocks/";
  const anchors = JSON.parse(readFileSync(directory + "coordinates.json"));
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(directory + "coordinates.pdf")) })
    .promise;
  try {
    for (const anchor of anchors) {
      const page = await pdf.getPage(anchor.page);
      const viewport = page.getViewport({ scale: 1 });
      const box = viewport.convertToViewportRectangle(anchor.pdf_bbox);
      const normalized = [
        Math.min(box[0], box[2]) / viewport.width,
        Math.min(box[1], box[3]) / viewport.height,
        Math.max(box[0], box[2]) / viewport.width,
        Math.max(box[1], box[3]) / viewport.height,
      ];
      normalized.forEach((value, i) => assert.ok(Math.abs(value - anchor.view_bbox[i]) < 1e-6));
    }
  } finally {
    await pdf.destroy();
  }
});

test("separate job scopes keep whole-document action available during a single-block request", async () => {
  const { jobViews } = await import("../../src/features/paper-blocks/domain/model.js");
  const single = { id: "one", scope: "block", block_id: "a", status: "running", percent: 30 };
  const full = { id: "whole", scope: "full", status: "running", percent: 60 };
  assert.equal(jobViews({ jobs: [single] }, "a").full, undefined);
  assert.equal(jobViews({ jobs: [single] }, "a").block, single);
  assert.equal(jobViews({ jobs: [single, full] }, "a").full, full);
  assert.equal(jobViews({ jobs: [{ ...full, status: "done" }] }).active, false);
});

test("inline math uses safe React super/sub elements and code-point source offsets", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { InlineRuns } = await import("../../src/features/paper-blocks/ui/InlineRuns.js");
  const { sourceRuns } = await import("../../src/features/paper-blocks/domain/model.js");
  const block = {
    text: "𝑥i2 next",
    protected: [
      {
        start: 0,
        end: 3,
        text: "𝑥i2",
        runs: [
          { kind: "text", text: "𝑥" },
          { kind: "sub", text: "i" },
          { kind: "super", text: "2" },
        ],
      },
    ],
  };
  const runs = sourceRuns(block);
  assert.equal(runs.at(-1).text, " next");
  const html = renderToStaticMarkup(
    React.createElement(InlineRuns, {
      text: block.text,
      runs: [...runs, { kind: "text", text: "<img onerror=bad()>" }],
    }),
  );
  assert.match(html, /<sub>i<\/sub>/);
  assert.match(html, /<sup>2<\/sup>/);
  assert.ok(!html.includes("<img"));
});

test("global block-mode opt-out and tutorial dismissal use the existing safe preference parser", () => {
  const prefs = parseWorkbenchPrefs('{"blockModeDisabled":true,"blockModeHintDismissed":true}');
  assert.equal(prefs.blockModeDisabled, true);
  assert.equal(prefs.blockModeHintDismissed, true);
  const invalid = parseWorkbenchPrefs('{"blockModeDisabled":"yes"}');
  assert.notEqual(invalid.blockModeDisabled, "yes");
});

test("figure translation preference is boolean, persistent, and enabled by default", async () => {
  const { DEFAULT_PREFS } = await import("../../src/features/workbench/domain/workbench-store.js");
  assert.equal(DEFAULT_PREFS.blockImageText, true);
  assert.equal(parseWorkbenchPrefs('{"blockImageText":false}').blockImageText, false);
  assert.equal(parseWorkbenchPrefs('{"blockImageText":"disabled"}').blockImageText, undefined);
});

test("render failures, label retention and legacy records are distinct", async () => {
  const { fallbackMessages, usageText } = await import("../../src/features/paper-blocks/domain/status.js");
  const messages = fallbackMessages({ render_fallback: ["render"], label_fallback: ["label"], translation_fallback: ["a"] },
    { translation_fallback: ["a", "b"] });
  assert.equal(messages.length, 3);
  assert.match(messages.find(m => m.kind === "translation").text, /2 个/);
  assert.match(messages.find(m => m.kind === "render").text, /排版失败/);
  assert.match(messages.find(m => m.kind === "label").text, /正常渲染/);
  assert.doesNotMatch(messages.find(m => m.kind === "label").text, /排版失败/);
  assert.equal(fallbackMessages({ fallback_blocks: ["unknown"] }, null)[0].kind, "legacy");
  assert.equal(usageText({ total_tokens: 120, reasoning_tokens: 70 }), "本次约 120 tokens，其中推理约 70");
  assert.equal(usageText({ total_tokens: 0 }), "");
});
