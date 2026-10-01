import test from "node:test";
import assert from "node:assert/strict";
import { api, ApiError, exportUrl, pdfUrl, request } from "../../src/app/research-library/api.js";

test("API reports structured server errors with their actual message", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: "LOCAL_ZOTERO_UNAVAILABLE", message: "Zotero 未运行" } }), { status: 503 });
  await assert.rejects(request("/imports/zotero-local/preview"), (e) => e instanceof ApiError && e.status === 503 && e.message === "Zotero 未运行");
});
test("PDF upload preserves binary bytes and encodes filename and item identity", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  const file = new File([new Uint8Array([37, 80, 68, 70, 0, 255])], "测试 & paper.pdf", { type: "application/pdf" });
  globalThis.fetch = async (url, options) => {
    const target = new URL(url, "http://127.0.0.1");
    assert.equal(target.pathname, "/api/research/files");
    assert.equal(target.searchParams.get("filename"), "测试 & paper.pdf");
    assert.equal(target.searchParams.get("item_id"), "item/?#");
    assert.equal(options.headers["Content-Type"], "application/pdf");
    assert.deepEqual(new Uint8Array(await options.body.arrayBuffer()), new Uint8Array([37, 80, 68, 70, 0, 255]));
    return Response.json({ item: { id: "fixture" }, attachment: {} });
  };
  assert.equal((await api.upload(file, "item/?#")).item.id, "fixture");
});
test("preview and commit transmit the exact reviewed payload and plan fingerprint", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  const payload = { format: "csl-json", source_id: "fixture", data: [{ id: "A", title: "Synthetic" }] };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/research/imports/commit");
    assert.deepEqual(JSON.parse(options.body), { payload, plan_hash: "reviewed-plan-hash" });
    return Response.json({ batch_id: "batch-1" });
  };
  assert.equal((await api.commitImport(payload, "reviewed-plan-hash")).batch_id, "batch-1");
});
test("document links stay inside the local API and escape path separators", () => {
  assert.equal(pdfUrl("a/b?c#d"), "/api/research/attachments/a%2Fb%3Fc%23d/pdf");
  assert.equal(exportUrl("a/b", "markdown"), "/api/research/items/a%2Fb/export?format=markdown");
});

test("local Zotero preview always transmits the user-named source namespace", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  globalThis.fetch = async (url, options) => {
    const target = new URL(url, "http://127.0.0.1");
    assert.equal(target.pathname, "/api/research/imports/zotero-local/preview");
    assert.equal(target.searchParams.get("source_namespace"), "博士课题 & 分库");
    assert.equal(options.method, undefined);
    return Response.json({ plan: {}, payload: {} });
  };
  await api.localZoteroPreview("  博士课题 & 分库  ");
});
