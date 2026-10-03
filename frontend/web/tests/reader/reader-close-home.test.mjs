import test from "node:test";
import assert from "node:assert/strict";

import { canReturnToReaderReferrer } from "../../../../frontend/packages/reader/src/components/react-pdf/ReaderCloseHome.tsx";

test("Reader close only walks history back to a real same-origin home route", () => {
  const current = "http://127.0.0.1:40001/reader.html?job_id=job-1";
  assert.equal(canReturnToReaderReferrer(
    "http://127.0.0.1:40001/workbench.html",
    current,
    2,
  ), true);
  assert.equal(canReturnToReaderReferrer("", current, 8), false);
  assert.equal(canReturnToReaderReferrer(
    "http://127.0.0.1:40001/reader.html?job_id=job-old",
    current,
    8,
  ), false);
  assert.equal(canReturnToReaderReferrer(
    "https://example.com/landing",
    current,
    8,
  ), false);
});

test("standalone Reader falls back to the workbench, never an unrelated same-origin route", async () => {
  const { navigateReaderToHome } = await import("../../../../frontend/packages/reader/src/components/react-pdf/ReaderCloseHome.tsx");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  let destination = "";
  const host = {};
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    self: host, top: host, history: { length: 1 },
    location: { href: "http://reader.test/reader.html", assign: (url) => { destination = url; } },
  } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { referrer: "" } });
  try {
    navigateReaderToHome();
    assert.equal(destination, "http://reader.test/workbench.html");
    assert.equal(canReturnToReaderReferrer("http://reader.test/unrelated.html", "http://reader.test/reader.html", 3), false);
  } finally {
    for (const [key, descriptor] of [["window", previousWindow], ["document", previousDocument]]) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
