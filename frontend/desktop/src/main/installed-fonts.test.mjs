import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createInstalledFonts, fontFamilies } from "./installed-fonts.js";
import { installRendererZoomShortcuts, rendererOwnsZoom } from "./renderer-shortcuts.js";

test("fontconfig catalog contains only deduplicated installed families with Chinese coverage", async () => {
  const calls = [];
  const catalog = createInstalledFonts({ run: async args => {
    calls.push(args);
    return args[0] === ":lang=zh" ? "Noto Sans CJK SC,思源黑体\nAbsent Family\n" : "Zeta\nNoto Sans CJK SC,思源黑体\nNoto Sans CJK SC\nAlpha\n";
  } });
  const fonts = await catalog.list();
  assert.deepEqual(calls, [["--format", "%{family}\n"], [":lang=zh", "--format", "%{family}\n"]]);
  assert.equal(fonts.length, 4);
  assert.equal(fonts.find(font => font.family === "Noto Sans CJK SC").chinese, true);
  assert.equal(fonts.find(font => font.family === "Alpha").chinese, false);
  assert.equal(fonts.some(font => font.family === "Absent Family"), false);
  assert.deepEqual(fonts.map(font => font.family), fonts.map(font => font.family).sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true })));
  assert.deepEqual(fontFamilies(" \nAlpha\nAlpha\ninvalid;family\n"), ["Alpha"]);
});

test("fontconfig failures do not fabricate an installed font catalog", async () => {
  await assert.rejects(createInstalledFonts({ run: async () => { throw new Error("fixture unavailable"); } }).list(), /fixture unavailable/);
});

test("workbench Ctrl zoom keys bypass menu accelerators but still reach the renderer", () => {
  const contents = new EventEmitter(), ignored = [];
  let url = "http://local/workbench.html";
  contents.getURL = () => url;
  contents.setIgnoreMenuShortcuts = value => ignored.push(value);
  installRendererZoomShortcuts(contents);
  const event = { preventDefault() { throw new Error("DOM key must not be swallowed"); } };
  for (const key of ["=", "+", "-", "0"]) {
    contents.emit("before-input-event", event, { type: "keyDown", control: true, key });
    contents.emit("before-input-event", event, { type: "keyUp", control: true, key });
  }
  assert.deepEqual(ignored, [true, false, true, false, true, false, true, false]);
  assert.equal(rendererOwnsZoom({ type: "keyDown", meta: true, key: "=" }), true);
  for (const name of ["reader.html", "index.html", "detail.html"]) {
    url = "http://local/"+name;
    contents.emit("before-input-event", event, { type: "keyDown", control: true, key: "=" });
    assert.equal(ignored.at(-1), false);
  }
  url = "http://local/workbench.html";
  contents.emit("before-input-event", event, { type: "keyDown", control: true, key: "r" });
  assert.equal(ignored.at(-1), false);
});
