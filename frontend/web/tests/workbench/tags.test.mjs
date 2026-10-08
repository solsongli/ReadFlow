import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTag, rowColoredTags, sidebarTagOrder, suggestTags, toggleTagPlan } from "@/features/workbench/domain/tags.js";

const colors = [
  { name: "待精读", color: 1, position: 1 },
  { name: "方法", color: 5, position: 2 },
];

test("number keys add a colored tag unless every selected paper already has it", () => {
  assert.deepEqual(toggleTagPlan([["方法"], []], "方法"), { add: ["方法"], remove: [] });
  assert.deepEqual(toggleTagPlan([["方法"], ["方法", "x"]], "方法"), { add: [], remove: ["方法"] });
  assert.deepEqual(toggleTagPlan([], "方法"), { add: ["方法"], remove: [] });
});

test("rows show only colored tags, in key order", () => {
  assert.deepEqual(rowColoredTags(["综述", "方法", "待精读"], colors).map((t) => t.name), ["待精读", "方法"]);
  assert.deepEqual(rowColoredTags(["综述"], colors), []);
});

test("autocomplete prefers prefixes, skips existing tags and normalises input", () => {
  const all = ["机器人", "机器学习", "强化学习", "方法论"];
  assert.deepEqual(suggestTags(all, "机器", []), ["机器人", "机器学习"]);
  assert.deepEqual(suggestTags(all, "学习", ["机器学习"]), ["强化学习"]);
  assert.deepEqual(suggestTags(all, "", ["机器人"], 2), ["机器学习", "强化学习"]);
  assert.equal(normalizeTag("  深度   学习 "), "深度 学习");
  assert.equal(normalizeTag("x".repeat(300)).length, 200);
});

test("sidebar lists colored tags first by position, then the rest by name", () => {
  const tags = [{ name: "综述", count: 1 }, { name: "方法", count: 3 }, { name: "安全", count: 2 }, { name: "待精读", count: 5 }];
  assert.deepEqual(sidebarTagOrder(tags, colors).map((t) => t.name), ["待精读", "方法", "安全", "综述"]);
});
