import test from "node:test";
import assert from "node:assert/strict";

import {
  arxivId,
  bibAuthor,
  formatBibtex,
  formatGbt7714,
  gbtAuthor,
  gbtAuthors,
} from "@/features/workbench/domain/citation.js";
import {
  buildGroupTree,
  chipGroups,
  descendantIds,
  flattenGroupTree,
  groupLabel,
} from "@/features/workbench/domain/groups.js";
import {
  formatDay,
  readingPercent,
  relativeTime,
  shortAuthors,
  tagColorSlot,
} from "@/features/workbench/domain/format.js";

const safeVla = {
  title: "SafeVLA: Towards Safety Alignment of Vision-Language-Action Model via Constrained Learning",
  authors: ["Borong Zhang", "Yuhao Zhang", "Jiaming Ji", "Yingshan Lei"],
  date: "2025-03-05",
  year: "2025",
  venue: "arXiv",
  item_type: "preprint",
  doi: "10.48550/arXiv.2503.03480",
  url: "https://arxiv.org/abs/2503.03480",
};

test("GB/T 7714 author forms: surname upper case, initials, et al after three", () => {
  assert.equal(gbtAuthor("Borong Zhang"), "ZHANG B");
  assert.equal(gbtAuthor("Moo Jin Kim"), "KIM M J");
  assert.equal(gbtAuthor("Chi, Cheng"), "CHI C");
  assert.equal(gbtAuthor("张三"), "张三");
  assert.equal(gbtAuthors(safeVla.authors), "ZHANG B, ZHANG Y, JI J, et al");
  assert.equal(gbtAuthors(["张三", "李四", "王五", "赵六"]), "张三, 李四, 王五, 等");
  assert.equal(gbtAuthors([]), "佚名");
});

test("GB/T 7714 entries by item type", () => {
  assert.equal(
    formatGbt7714(safeVla),
    "ZHANG B, ZHANG Y, JI J, et al. SafeVLA: Towards Safety Alignment of Vision-Language-Action Model via Constrained Learning[EB/OL]. (2025-03-05). https://arxiv.org/abs/2503.03480.",
  );
  const journal = { ...safeVla, item_type: "journalArticle", venue: "Nature Machine Intelligence", authors: ["Ada Li"], doi: "10.1/x" };
  assert.equal(formatGbt7714(journal), "LI A. SafeVLA: Towards Safety Alignment of Vision-Language-Action Model via Constrained Learning[J]. Nature Machine Intelligence, 2025. DOI: 10.1/x.");
  const paper = { ...journal, item_type: "conferencePaper", venue: "CoRL", doi: "" };
  assert.match(formatGbt7714(paper), /\[C\]\/\/CoRL\. 2025\.$/);
});

test("BibTeX entries keep arXiv eprints and Last, First authors", () => {
  assert.equal(arxivId(safeVla), "2503.03480");
  assert.equal(arxivId({ doi: "", url: "https://arxiv.org/pdf/2410.24164v1.pdf" }), "2410.24164v1");
  assert.equal(bibAuthor("Borong Zhang"), "Zhang, Borong");
  const bib = formatBibtex(safeVla, "zhang2025safevla");
  assert.match(bib, /^@misc\{zhang2025safevla,\n/);
  assert.match(bib, /title = \{\{SafeVLA: Towards Safety Alignment/);
  assert.match(bib, /author = \{Zhang, Borong and Zhang, Yuhao and Ji, Jiaming and Lei, Yingshan\}/);
  assert.match(bib, /eprint = \{2503\.03480\},\n  archivePrefix = \{arXiv\},/);
  assert.doesNotMatch(bib, /howpublished/);
  const article = formatBibtex({ ...safeVla, item_type: "journalArticle", doi: "10.1/{x}", url: "" }, "k");
  assert.match(article, /^@article\{k,/);
  assert.match(article, /journal = \{arXiv\}/);
  assert.match(article, /doi = \{10\.1\/x\}/);
});

const groups = [
  { id: "vla", name: "具身智能 · VLA", parent_id: null, count: 20, direct_count: 9 },
  { id: "safe", name: "安全对齐", parent_id: "vla", count: 6, direct_count: 6 },
  { id: "data", name: "数据集与基准", parent_id: "vla", count: 5, direct_count: 5 },
  { id: "thesis", name: "毕业论文", parent_id: null, count: 18, direct_count: 6 },
  { id: "ch2", name: "第二章 相关工作", parent_id: "thesis", count: 12, direct_count: 12 },
  { id: "orphan", name: "孤儿分组", parent_id: "missing", count: 0, direct_count: 0 },
  { id: "loop-a", name: "环 A", parent_id: "loop-b", count: 0, direct_count: 0 },
  { id: "loop-b", name: "环 B", parent_id: "loop-a", count: 0, direct_count: 0 },
];

test("group tree nests children, survives orphans and cycles", () => {
  const tree = buildGroupTree(groups);
  const flat = flattenGroupTree(tree);
  assert.equal(flat.length, groups.length, "every group appears exactly once");
  assert.ok(tree.some((node) => node.id === "orphan" && node.depth === 0));
  const vla = tree.find((node) => node.id === "vla");
  assert.deepEqual(vla.children.map((node) => node.id).sort(), ["data", "safe"]);
  assert.ok(vla.children.every((node) => node.depth === 1));
  const collapsed = flattenGroupTree(tree, new Set(["thesis"]));
  assert.ok(collapsed.some((node) => node.id === "ch2"));
  assert.ok(!collapsed.some((node) => node.id === "safe"));
  assert.equal(groupLabel(groups, "ch2"), "毕业论文 › 第二章 相关工作");
  assert.deepEqual([...descendantIds(groups, "vla")].sort(), ["data", "safe", "vla"]);
});

test("row chips hide the group being browsed and its ancestors", () => {
  const chips = chipGroups(groups, ["safe", "ch2", "vla"], "safe").map((group) => group.id);
  assert.deepEqual(chips, ["ch2"]);
  assert.deepEqual(chipGroups(groups, ["safe", "gone"], null).map((group) => group.id), ["safe"]);
});

test("display formatting", () => {
  const now = new Date(2026, 9, 1, 12, 0, 0);
  assert.equal(shortAuthors(["Borong Zhang", "Yuhao Zhang"]), "Zhang 等");
  assert.equal(shortAuthors(["Octo Model Team"]), "Team");
  assert.equal(shortAuthors([]), "—");
  assert.equal(relativeTime(new Date(2026, 9, 1, 11, 59, 40).toISOString(), now), "刚刚");
  assert.equal(relativeTime(new Date(2026, 9, 1, 11, 15).toISOString(), now), "45 分钟前");
  assert.equal(relativeTime(new Date(2026, 9, 1, 8, 5).toISOString(), now), "今天 08:05");
  assert.equal(relativeTime(new Date(2026, 8, 30, 22, 0).toISOString(), now), "昨天");
  assert.equal(relativeTime(new Date(2026, 8, 27, 9, 0).toISOString(), now), "4 天前");
  assert.equal(relativeTime(new Date(2026, 8, 1).toISOString(), now), "09-01");
  assert.equal(formatDay(new Date(2025, 0, 2).toISOString(), now), "2025-01-02");
  assert.equal(formatDay(null, now), "—");
  assert.equal(readingPercent({ read_status: "reading", read_page: 3, read_pages: 12 }), 25);
  assert.equal(readingPercent({ read_status: "read", read_page: null, read_pages: null }), 100);
  assert.equal(readingPercent({ read_status: "unread", read_page: null, read_pages: null }), null);
  assert.equal(tagColorSlot("安全"), tagColorSlot("安全"));
  assert.ok(tagColorSlot("方法") >= 1 && tagColorSlot("方法") <= 7);
});
