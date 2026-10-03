import test from "node:test";
import assert from "node:assert/strict";
import {
  pageCitations,
  needsConsent,
  translationCacheKey,
  assistanceError,
  AI_OFFLINE,
} from "../../src/features/paper-reader/domain/assistance.js";
test("reader page citations accept bounded known page numbers", () => {
  assert.deepEqual(
    pageCitations("Evidence (p. 2), (p. 99), （第 3 页）", 12).map((v) => v.page),
    [2, 3],
  );
  assert.equal(pageCitations("(p. 0)", 12).length, 0);
});
test("consent is scoped to the paper session or persisted service fingerprint", () => {
  const status = { target: "service-a" };
  assert.equal(needsConsent("", status), true);
  assert.equal(needsConsent("service-a", status), false);
  assert.equal(needsConsent("", status, "service-a"), false);
  assert.equal(needsConsent("service-b", status, "service-b"), true);
});
test("translation cache separates services, models and terminology without storing key in identity", () => {
  const value = {
    base_url: "http://127.0.0.1:9/v1",
    model: "fixture",
    api_key: "fixture-private-value",
    glossary_id: "g",
  };
  const key = translationCacheKey("text", value);
  assert.equal(key.includes(value.api_key), false);
  assert.notEqual(key, translationCacheKey("text", { ...value, model: "another" }));
  assert.notEqual(key, translationCacheKey("text", { ...value, glossary_id: "other" }));
  assert.equal(key, translationCacheKey("text", { ...value }));
});
test("assistance errors are human-readable and never echo untrusted details", () => {
  assert.equal(assistanceError({ status: 502 }, true).message, AI_OFFLINE);
  assert.match(assistanceError({ code: "credentials", message: "private body" }).message, /Key 无效/);
  assert.equal(assistanceError(new Error("private body")).message.includes("private body"), false);
  assert.match(assistanceError({ code: "unconfigured" }, true).message, /AI 伴读/);
});
