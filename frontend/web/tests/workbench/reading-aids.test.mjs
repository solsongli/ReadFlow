import test from "node:test";
import assert from "node:assert/strict";
import { compileTerms, termMatches, locateTerms, termKey } from "../../src/features/paper-blocks/domain/terms.js";
import { bilingualHeadings } from "../../src/features/paper-reader/domain/outline.js";
import { overviewMarkdown, OVERVIEW_SECTIONS } from "../../src/features/reader-assistance/domain/overview.js";
const match = (text, source) => termMatches(text, compileTerms([{ source, target: "译法" }]));
test("term matching respects word boundaries, case, plurals and hyphen variants", () => {
  assert.equal(match("POLICIES policy policymaker", "policy").length, 2);
  assert.equal(match("vision–language models and vision-language model", "vision-language model").length, 2);
  assert.equal(match("VLA OpenVLA VLAS", "VLA").length, 2);
  assert.equal(match("token_vision vision2 revision", "vision").length, 0);
  assert.equal(match("学习控制策略的模型", "控制策略").length, 1);
  const values = termMatches("vision language model", compileTerms([
    { source: "model", target: "模型" }, { source: "vision-language model", target: "视觉语言模型" },
  ]));
  assert.equal(values.length, 1);
  assert.equal(values[0].term.source, "vision-language model");
});
test("first occurrence uses reading order and user glossary overrides paper terms", () => {
  const blocks = [
    { id: "1", type: "header", text: "policy", page: 1, anchors: [] },
    { id: "2", type: "abstract", text: "Before. Policies adapt to tasks. After.", page: 2, anchors: [{ view_bbox: [0, .3, 1, .5] }] },
    { id: "3", type: "text", text: "policy later", page: 3, anchors: [] },
  ];
  const found = locateTerms(blocks, [{ source: "policy", target: "策略" }], [{ source: "Policy", target: "控制策略", kind: "user" }]);
  assert.equal(found.length, 1);
  assert.equal(found[0].page, 2);
  assert.equal(found[0].target, "控制策略");
  assert.equal(found[0].sentence, "Policies adapt to tasks.");
  assert.equal(termKey(" Vision–Language  Model "), "vision language model");
});
test("bilingual outline requires matching title and page; source bookmarks stay authoritative", () => {
  const blocks = [{ id: "b", title: "2. Method", translation: "方法", page: 2, y: 22, level: 1 }];
  const outline = [{ id: "native", title: "Method", page: 2, y: 24, level: 2 }];
  assert.deepEqual(bilingualHeadings(outline, blocks, true)[0], { ...outline[0], translation: "方法" });
  assert.equal(bilingualHeadings([{ ...outline[0], page: 3 }], blocks, true)[0].translation, undefined);
  assert.equal(bilingualHeadings(outline, blocks, false)[0].translation, undefined);
  assert.equal(bilingualHeadings([], blocks, true)[0].id, "b");
});
test("overview Markdown preserves caution and disables unsupported page links", () => {
  const sections = Object.fromEntries(OVERVIEW_SECTIONS.map(([key]) => [key, [{ text: "Evidence", page: 2, trusted: true },
    { text: "Unknown", page: 99, trusted: false }]]));
  const md = overviewMarkdown({ sections }, "Title");
  assert.match(md, /p\. 2/);
  assert.doesNotMatch(md, /p\. 99/);
  assert.match(md, /页码待核对/);
  assert.match(md, /请核对原文/);
});

test("term first-page location follows retained cross-page paragraph anchors", () => {
  const blocks = [{ id: "body", type: "text", page: 1, text: "Beginning. A policy acts.",
    anchors: [{ page: 1, view_bbox: [0, .8, .4, .9] }, { page: 2, view_bbox: [0, .1, .4, .3] }],
    continuations: [{ source_start: "A policy acts." }] }];
  const [term] = locateTerms(blocks, [{ source: "policy", target: "策略" }]);
  assert.equal(term.page, 2);
  assert.equal(term.y, .1);
});
