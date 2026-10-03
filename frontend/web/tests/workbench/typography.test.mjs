import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TYPOGRAPHY, WORKBENCH_TEXT_SCALES, normalizeTypography, stepTextScale, textScaleShortcut, typographyVariables, readerAppearance } from "@/features/workbench/domain/typography.js";
import { parseWorkbenchPrefs, PREFS_KEY } from "@/features/workbench/domain/preferences.js";
import { createWorkbench } from "@/features/workbench/state/controller.js";
import { createSettingsFonts } from "@/features/workbench/state/settings-fonts.js";
import { getFontFamily, RENDER_FONT_STORAGE_KEY } from "@/features/settings/domain.js";

test("seven text sizes have a middle default and bounded keyboard steps", () => {
  assert.deepEqual(WORKBENCH_TEXT_SCALES, [85, 90, 95, 100, 110, 120, 130]);
  assert.equal(stepTextScale(85, -1), 85); assert.equal(stepTextScale(130, 1), 130);
  assert.equal(stepTextScale(100, 1), 110); assert.equal(stepTextScale(100, -1), 95);
  assert.equal(stepTextScale(130, 0), 100);
  assert.equal(textScaleShortcut({ key: "=", ctrlKey: true }), 1);
  assert.equal(textScaleShortcut({ key: "-", metaKey: true }), -1);
  assert.equal(textScaleShortcut({ key: "0", ctrlKey: true }), 0);
  assert.equal(textScaleShortcut({ key: "=", ctrlKey: true, altKey: true }), null);
  assert.equal(textScaleShortcut({ key: "=" }), null);
});

test("old or invalid preferences fall back safely and custom family values are quoted", () => {
  assert.equal(parseWorkbenchPrefs('{"theme":"dark"}').textScale, 100);
  assert.deepEqual(normalizeTypography({ uiFont: "invalid", textScale: Infinity }), DEFAULT_TYPOGRAPHY);
  assert.equal(normalizeTypography({ textScale: 999 }).textScale, 130);
  assert.equal(normalizeTypography({ textScale: 0 }).textScale, 85);
  assert.equal(normalizeTypography({ uiFont: "custom", customFont: "unsafe; color: red" }).uiFont, "default");
  const vars = typographyVariables({ ...DEFAULT_TYPOGRAPHY, uiFont: "custom", customFont: 'Name "Quoted"', textScale: 120, noteFont: "mono" });
  assert.match(vars["--wb-ui-font"], /^"Name \\"Quoted\\""/);
  assert.equal(vars["--wb-ui-scale"], "1.2"); assert.match(vars["--wb-note-font"], /monospace/);
});

test("typography persists and synchronizes without echo writes or changing library selection", () => {
  const data = new Map(), events = new EventTarget(); let writes = 0;
  const storage = { getItem: key => data.get(key), setItem: (key, value) => { writes++; data.set(key, value); } };
  const a = createWorkbench({ api: {}, storage, preferenceEvents: events });
  const b = createWorkbench({ api: {}, storage, preferenceEvents: events });
  b.store.actions.patch({ selectedIds: ["paper"], query: "keep" });
  a.setPrefs({ uiFont: "kai", textScale: 130, noteFont: "serif" });
  assert.equal(b.store.getSnapshot().textScale, 130);
  assert.deepEqual(b.store.getSnapshot().selectedIds, ["paper"]); assert.equal(b.store.getSnapshot().query, "keep");
  assert.equal(writes, 1);
  const restarted = createWorkbench({ api: {}, storage });
  assert.equal(restarted.store.getSnapshot().uiFont, "kai");
  const event = Object.assign(new Event("storage"), { key: PREFS_KEY, newValue: JSON.stringify({ textScale: 85, uiFont: "serif" }) });
  events.dispatchEvent(event);
  assert.equal(a.store.getSnapshot().textScale, 85); assert.equal(b.store.getSnapshot().uiFont, "serif"); assert.equal(writes, 1);
  a.dispose(); b.dispose(); restarted.dispose();
});

test("new render font settings use the exact legacy key, getter and change event", (t) => {
  const previous = new Map(["window", "localStorage"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => { for (const [key, value] of previous) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; } });
  const data = new Map();
  Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) } });
  const service = createSettingsFonts().render; let changes = 0;
  const stop = service.subscribe(() => changes++);
  service.save("Source Han Sans SC");
  assert.equal(data.get(RENDER_FONT_STORAGE_KEY), "Source Han Sans SC");
  assert.equal(service.read(), getFontFamily()); assert.equal(changes, 1);
  assert.deepEqual([...data.keys()], ["retainpdf.render.typst_font_family"]);
  localStorage.setItem = () => { throw new Error("fixture storage unavailable"); };
  assert.throws(() => service.save("Source Han Serif SC"), /未能保存/);
  assert.equal(getFontFamily(), "Source Han Sans SC");
  stop();
});
