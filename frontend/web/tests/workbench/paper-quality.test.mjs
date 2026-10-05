import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InlineRuns } from "../../src/features/paper-blocks/ui/InlineRuns.js";
import { sliceRuns } from "../../src/features/paper-blocks/domain/reading.js";
import { fallbackMessages } from "../../src/features/paper-blocks/domain/status.js";

test("local bold runs survive allocation and render as escaped React elements", () => {
  const runs = [{ kind: "text", text: "任务<script>", bold: true }, { kind: "sub", text: "i" }];
  assert.equal(sliceRuns(runs, 0, 2)[0].bold, true);
  const html = renderToStaticMarkup(React.createElement(InlineRuns, { text: "", runs }));
  assert.ok(html.includes("<strong>任务&lt;script&gt;</strong>"));
  assert.ok(html.includes("<sub>i</sub>"));
});
test("quality notice separates automatic retries from remaining review warnings", () => {
  const messages = fallbackMessages({ qa: { checked: 5, retried: 2, needs_review: 1 } }, null);
  assert.equal(messages[0].kind, "quality");
  assert.match(messages[0].text, /2 块已自动重译，1 块仍需核对/);
});
