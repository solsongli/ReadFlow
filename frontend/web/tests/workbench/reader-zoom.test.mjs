import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeReaderZoom,
  normalizeReaderZooms,
  rememberReaderZoom,
} from "../../src/features/workbench/domain/reader-zoom.js";

test("reader zoom accepts named fits and bounded numeric values", () => {
  assert.equal(normalizeReaderZoom("width"), "width");
  assert.equal(normalizeReaderZoom("page"), "page");
  assert.equal(normalizeReaderZoom(1.5), 1.5);
  assert.equal(normalizeReaderZoom(8), undefined);
  assert.equal(normalizeReaderZoom("1.5"), undefined);
});

test("per-paper zoom keeps recent bounded entries and rejects malformed storage", () => {
  let value = {};
  for (let index = 0; index < 105; index++) value = rememberReaderZoom(value, `paper-${index}`, 1, 100);
  assert.equal(Object.keys(value).length, 100);
  assert.equal(value["paper-0"], undefined);
  value = rememberReaderZoom(value, "paper-100", "page", 100);
  assert.equal(value["paper-100"], "page");
  assert.deepEqual(normalizeReaderZooms({ ok: 2, bad: 8, nested: {} }), { ok: 2 });
});
