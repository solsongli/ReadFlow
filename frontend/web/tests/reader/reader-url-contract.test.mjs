import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReaderParams,
  buildReaderUrl,
  canonicalizeReaderSearch,
  parseReaderParams,
} from "../../src/platform/navigation/pages.ts";


// 单一 URL 契约真源：page_idx/block_id 为规范名，page/blockId 为只读别名；
// 构造只写规范名，mock 在同处集中注入。

test("parseReaderParams：规范名与历史别名都读，page_idx 优先", () => {
  assert.deepEqual(parseReaderParams("?job_id=j1&page_idx=3&block_id=b-9&mock=parallel"), {
    jobId: "j1",
    documentId: "",
    page: 3,
    blockId: "b-9",
    mock: "parallel",
  });
  assert.deepEqual(parseReaderParams("?page=4&blockId=b-legacy"), {
    jobId: "",
    documentId: "",
    page: 4,
    blockId: "b-legacy",
    mock: "",
  });
  const both = parseReaderParams("?page=9&page_idx=2&blockId=alias&block_id=canonical");
  assert.equal(both.page, 2, "page_idx 是运行时真值，优先于 page");
  assert.equal(both.blockId, "canonical", "block_id 优先于 blockId");
  assert.equal(parseReaderParams("?page_idx=abc").page, null);
  assert.equal(parseReaderParams("?document_id=doc-1").documentId, "doc-1");
});

test("buildReaderParams：只写规范名，不写别名；mock 集中注入", () => {
  const params = buildReaderParams({
    jobId: "j1",
    anchor: { page: 3, blockId: "b-1" },
    mock: "parallel",
  });
  assert.deepEqual(params, { job_id: "j1", page_idx: "3", block_id: "b-1", mock: "parallel" });
  assert.equal(params.page, undefined);
  assert.equal(params.blockId, undefined);

  assert.deepEqual(buildReaderParams({ documentId: "doc-1" }), { document_id: "doc-1" });
  assert.deepEqual(buildReaderParams({ anchor: { pageIdx: 0 } }), { page_idx: "0" });
  assert.deepEqual(buildReaderParams({ anchor: { page: null, pageIdx: 5 } }), { page_idx: "5" });
});

test("buildReaderUrl：相对 reader.html，规范参数，缺 job/document 返回空串", () => {
  assert.equal(
    buildReaderUrl("j1", { pageIdx: 0, blockId: "b-1" }),
    "./reader.html?job_id=j1&page_idx=0&block_id=b-1",
  );
  assert.equal(buildReaderUrl("", null, { documentId: "doc-1" }), "./reader.html?document_id=doc-1");
  assert.equal(buildReaderUrl(""), "");
  assert.equal(buildReaderUrl("", { blockId: "b-1" }), "");
});

test("canonicalizeReaderSearch：别名补成规范名，无变化返回 null", () => {
  assert.equal(canonicalizeReaderSearch("?page=4&blockId=b-1"), "page_idx=4&block_id=b-1");
  assert.equal(canonicalizeReaderSearch("?page_idx=2&block_id=b-1"), null);
  assert.equal(canonicalizeReaderSearch("?job_id=j1"), null);
  assert.equal(canonicalizeReaderSearch("?page=4"), "page_idx=4");
});
