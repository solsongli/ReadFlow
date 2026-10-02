import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { Marked } from "../../vendor/marked/lib/marked.esm.js";
import { noteMarkdownParser, renderNoteMarkdown, safeNoteLink } from "../../src/features/workbench/domain/notes-markdown.ts";
import { noteSummary, noteDateGroup, noteColor, exportNotesMarkdown, noteKind } from "../../src/features/workbench/domain/notes-format.ts";
import { emptyNote, editableNote, noteNeedsSave } from "../../src/features/workbench/domain/notes.ts";
import { notesQueryParams } from "../../src/platform/api/workbench.ts";

test("note grouping uses local calendar dates including year and DST boundaries", () => {
  const now = new Date(2026, 0, 2, 12);
  const iso = (...parts) => new Date(...parts).toISOString();
  assert.equal(noteDateGroup(iso(2026, 0, 2, 1), now), "今天");
  assert.equal(noteDateGroup(iso(2026, 0, 1, 23), now), "昨天");
  assert.equal(noteDateGroup(iso(2025, 11, 27, 23), now), "过去 7 天");
  assert.equal(noteDateGroup(iso(2025, 11, 26, 23), now), "更早");
  assert.equal(noteDateGroup("invalid", now), "更早");
  assert.equal(noteDateGroup(iso(2026, 2, 8, 23), new Date(2026, 2, 9, 1)), "昨天");
});
test("note row text prefers body then quotation and distinguishes empty PDF selections", () => {
  assert.deepEqual(noteSummary({ body: "\nTitle\nMore\nthoughts", quote: "Quote", translated_quote: "" }), { title: "Title", excerpt: "More thoughts" });
  assert.equal(noteSummary({ body: "", quote: "Quoted title", translated_quote: "" }).title, "Quoted title");
  assert.equal(noteKind({ quote: "", translated_quote: "", page_idx: 0 }), "annotation");
  assert.equal(noteKind({ quote: "", translated_quote: "", page_idx: null }), "note");
  assert.equal(noteColor("purple"), "purple");
  assert.equal(noteColor("#ffd400"), "yellow");
  assert.equal(noteColor("url(unsafe)"), "yellow");
});
test("query serialization keeps search text distinct from URL parameters", () => {
  const query = notesQueryParams({ itemId: "paper", query: "a&kind=notes", kind: "annotations", offset: 200 });
  assert.equal(query.get("item_id"), "paper"); assert.equal(query.get("q"), "a&kind=notes");
  assert.equal(query.get("kind"), "annotations"); assert.equal(query.get("limit"), "200"); assert.equal(query.get("offset"), "200");
});
test("Markdown escapes script, raw image/event HTML and attribute breakout", () => {
  const html = renderNoteMarkdown('<script>globalThis.injected=1</script>\n\n<img src=x onerror="injected=1">\n\n<span onclick="evil()">text</span>\n\n[title](https://example.test "\" onmouseover=evil()")', noteMarkdownParser(Marked));
  const dom = new JSDOM(html);
  assert.equal(dom.window.document.querySelectorAll("script,img,span[onclick],[onmouseover]").length, 0);
  assert.match(dom.window.document.body.textContent, /<script>/);
  assert.match(dom.window.document.body.textContent, /<img/);
  dom.window.close();
});
test("Markdown links allow only http/https/mailto including entity and control obfuscation", () => {
  const body = '[bad](javascript:alert(1)) [entity](javascript&#58;alert(1)) [data](data:text/html,test) [file](file:///tmp/example) [relative](/local) [ok](https://example.test) [mail](mailto:reader@example.test)';
  const dom = new JSDOM(renderNoteMarkdown(body, noteMarkdownParser(Marked)));
  const links = [...dom.window.document.querySelectorAll("a")];
  assert.equal(links.length, 2);
  for (const link of links) { assert.equal(link.rel, "noopener noreferrer"); assert.equal(link.target, "_blank"); }
  assert.equal(safeNoteLink("java\tscript:alert(1)"), null);
  assert.equal(safeNoteLink("//example.test"), null);
  dom.window.close();
});
test("Markdown retains headings, lists, emphasis, code and safe image alt text without requests", () => {
  const dom = new JSDOM(renderNoteMarkdown('# Heading\n\n- **Bold**\n- *Emphasis*\n\n```html\n<img onerror=evil()>\n```\n\n![An image](https://example.test/image.png)', noteMarkdownParser(Marked)));
  assert.equal(dom.window.document.querySelector("h1").textContent, "Heading");
  assert.equal(dom.window.document.querySelectorAll("li").length, 2);
  assert.equal(dom.window.document.querySelector("code").textContent.trim(), "<img onerror=evil()>");
  assert.equal(dom.window.document.querySelectorAll("img").length, 0);
  assert.match(dom.window.document.body.textContent, /An image/);
  dom.window.close();
});
test("export groups notes by stable paper identity, preserves Markdown and uses one-based pages", () => {
  const first = emptyNote({ id: "a", title: "Paper <unsafe>", title_translated: "文献甲" }, "1", new Date("2026-10-02T12:00:00Z"));
  const second = { ...first, id: "2", body: "**A thought**", quote: "Quote line 1\nQuote line 2", kind: "annotation", page_idx: 0 };
  const other = { ...first, item_id: "b", id: "3", item_title: "Other", item_title_translated: "", body: "Other body" };
  const output = exportNotesMarkdown([{ ...first, body: "First" }, other, second]);
  assert.equal((output.match(/^## /gm) ?? []).length, 2);
  assert.match(output, /Paper &lt;unsafe&gt;/); assert.match(output, /文献甲/);
  assert.match(output, /批注 · 第 1 页/); assert.match(output, /> Quote line 1\n> Quote line 2/);
  assert.ok(output.indexOf("**A thought**") < output.indexOf("## Other"));
});
test("new empty drafts are not invalid server writes; edited or saving drafts block departure", () => {
  const draft = editableNote(emptyNote({ id: "paper", title: "Paper" }, "draft", new Date()), true);
  assert.equal(noteNeedsSave(draft), false);
  assert.equal(noteNeedsSave({ ...draft, body: "Written" }), true);
  assert.equal(noteNeedsSave({ ...draft, status: "saving" }), true);
});
