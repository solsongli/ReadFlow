import test from "node:test";
import assert from "node:assert/strict";
import { buildHomeUrl, parseHomeTab, toContractTab, toUiTabKey } from "../../src/platform/navigation/pages.js";
import { buildResearchReaderUrl } from "../../src/features/research-library/domain/reader-route.js";

test("native research tab has a stable deep link without replacing previous navigation", () => {
  assert.equal(buildHomeUrl("research"), "./index.html?tab=research");
  assert.equal(parseHomeTab("?tab=research"), "research");
  assert.equal(toUiTabKey("research"), "research");
  assert.equal(toContractTab("research"), "research");
  assert.equal(buildHomeUrl("categories"), "./index.html?tab=collections");
  assert.equal(toUiTabKey("collections"), "categories");
  for (const value of ["library", "favorites", "ask"]) assert.equal(toUiTabKey(value), value);
});
test("same PDF in two papers retains separate paper and attachment scope", () => {
  const sha256 = "a".repeat(64);
  const a = new URL(buildResearchReaderUrl("paper-a", { id: "attachment-a", item_id: "paper-a", sha256 }, 0));
  const b = new URL(buildResearchReaderUrl("paper-b", { id: "attachment-b", item_id: "paper-b", sha256 }));
  assert.equal(a.pathname, "/reader.html");
  assert.equal(a.searchParams.get("document_id"), b.searchParams.get("document_id"));
  assert.equal(a.searchParams.get("research_item_id"), "paper-a");
  assert.equal(b.searchParams.get("research_item_id"), "paper-b");
  assert.equal(a.searchParams.get("attachment_id"), "attachment-a");
  assert.equal(b.searchParams.get("attachment_id"), "attachment-b");
  assert.equal(a.searchParams.get("page_idx"), "0");
  assert.equal(a.searchParams.has("job_id"), false);
});
test("mismatched owner, missing source hash and invalid page stop Reader navigation", () => {
  const attachment = { id: "attachment-a", item_id: "paper-a", sha256: "a".repeat(64) };
  assert.throws(() => buildResearchReaderUrl("paper-b", attachment), /身份/);
  assert.throws(() => buildResearchReaderUrl("paper-a", { ...attachment, sha256: "" }), /哈希/);
  assert.throws(() => buildResearchReaderUrl("paper-a", attachment, -1), /页码/);
  assert.throws(() => buildResearchReaderUrl("paper-a", attachment, 1.5), /页码/);
});
