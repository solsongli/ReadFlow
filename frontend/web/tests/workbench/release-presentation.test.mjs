import assert from "node:assert/strict";
import test from "node:test";
import { libraryCount, libraryEmptyState, librarySubtitle } from "@/features/workbench/domain/library-presentation.js";
import { createSettingsServices } from "@/features/workbench/state/settings-services.js";

test("only the unfiltered whole library shows the library unread count", () => {
  assert.equal(librarySubtitle({ view: "all", total: 12, unread: 7 }), "7 篇待读");
  for (const view of ["trash", "recent", "unread", "starred", "notes", "unfiled", "needs_ocr", "missing_doi", "no_zh_title"]) {
    assert.equal(librarySubtitle({ view, total: 0, unread: 7 }), "");
  }
});

test("group, tag and search subtitles describe the active filters", () => {
  assert.equal(librarySubtitle({ view: "all", group: "机器学习", total: 3, unread: 7 }), "分组 机器学习");
  assert.equal(librarySubtitle({ view: "notes", query: "不存在", total: 0, unread: 7 }), "搜索「不存在」");
  assert.equal(librarySubtitle({ view: "all", group: "机器学习", tag: "重要", query: "PDF", total: 2 }), "分组 机器学习 · 标签 重要 · 搜索「PDF」");
});

test("the header badge shows the total, or the subset against the whole library", () => {
  assert.equal(libraryCount({ view: "all", total: 10, all: 10 }), "共 10 篇");
  assert.equal(libraryCount({ view: "all" }), "共 … 篇");
  assert.equal(libraryCount({ view: "all", query: "VLA", total: 3, all: 10 }), "3 / 10 篇");
  assert.equal(libraryCount({ view: "unread", total: 0, all: 10 }), "0 / 10 篇");
  assert.equal(libraryCount({ view: "all", group: "g", total: 4 }), "共 4 篇");
  assert.equal(libraryCount({ view: "trash", total: 2, all: 10 }), "共 2 篇");
});

test("empty views use their own meaning rather than an upload icon", () => {
  assert.equal(libraryEmptyState({ view: "trash" }).icon, "trash");
  assert.equal(libraryEmptyState({ view: "trash" }).title, "回收站是空的");
  for (const view of ["recent", "unread", "starred", "notes", "unfiled", "needs_ocr", "missing_doi", "no_zh_title"]) {
    assert.notEqual(libraryEmptyState({ view }).icon, "import");
  }
  assert.equal(libraryEmptyState({ view: "all", group: "g" }).icon, "group");
  assert.equal(libraryEmptyState({ view: "all", tag: "t" }).icon, "tag");
  assert.equal(libraryEmptyState({ view: "trash", query: "q" }).icon, "search");
});

test("About shows only the desktop app version and otherwise shows development", (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  t.after(() => { if (previous) Object.defineProperty(globalThis, "window", previous); else delete globalThis.window; });
  const settings = createSettingsServices();
  for (const [bridge, expected] of [[undefined, "开发版"], [{ appVersion: "" }, "开发版"], [{ version: "4.2.5" }, "开发版"], [{ appVersion: "1.2.3" }, "1.2.3"]]) {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { retainPdfDesktop: bridge } });
    assert.equal(settings.version(), expected);
  }
});
