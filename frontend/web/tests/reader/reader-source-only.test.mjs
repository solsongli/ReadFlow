import test from "node:test";
import assert from "node:assert/strict";
import { resolveReaderDocumentId, resolveReaderJobId } from "../../src/features/reader/domain/host/config.js";


// 馆藏文档"读原文"(F4):无 job、只有 document_id 时,阅读器走只读源文档分支。

test("resolveReaderJobId:带 document_id 时不回退到 mock job", () => {
  // 关键回归:mock 模式下 resolveReaderJobId 本来会兜底返回 mock job id——
  // 源文档阅读器若拿到这个 id 会去挂 mock 任务的译文,整条只读链路就串了。
  const jobId = resolveReaderJobId({
    search: "?document_id=doc-abc",
    isMock: () => true,
    mockJobId: () => "mock-job-1",
  });
  assert.equal(jobId, "", "有 document_id 时不返回 mock job");
});

test("resolveReaderJobId:job_id 优先,无 job_id/document_id 时 mock 兜底不变", () => {
  assert.equal(
    resolveReaderJobId({ search: "?job_id=j1&document_id=doc-abc", isMock: () => true, mockJobId: () => "m" }),
    "j1",
    "job_id 仍然优先",
  );
  assert.equal(
    resolveReaderJobId({ search: "", isMock: () => true, mockJobId: () => "mock-job-1" }),
    "mock-job-1",
    "两个都没有时保持原 mock 兜底行为",
  );
  assert.equal(
    resolveReaderJobId({ search: "", isMock: () => false, mockJobId: () => "mock-job-1" }),
    "",
  );
});

test("resolveReaderDocumentId:从 URL 读取 document_id", () => {
  assert.equal(resolveReaderDocumentId({ search: "?document_id=doc-abc" }), "doc-abc");
  assert.equal(resolveReaderDocumentId({ search: "?job_id=j1" }), "");
  assert.equal(resolveReaderDocumentId({ search: "" }), "");
});
