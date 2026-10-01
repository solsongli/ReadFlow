import test from "node:test";
import assert from "node:assert/strict";

import { hasDesktopCredentials } from "../../src/features/credentials/domain/desktop-readiness.js";
import { showDesktopUi } from "../../src/app/desktop/bootstrap.js";

test("桌面初始化不依赖 React 已挂载可选的输出目录按钮", () => {
  const previous = globalThis.document;
  globalThis.document = { getElementById: () => null };
  try {
    assert.doesNotThrow(() => showDesktopUi());
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test("fresh desktop permits local reading and OCR without online tokens or translation key", () => {
  for (const snapshot of [undefined, null, {}, { ocrProvider: "paddle" }, { ocrProvider: "mineru", mineruToken: "archived" }, { modelApiKey: "translation-only" }]) assert.equal(hasDesktopCredentials(snapshot), true);
});
