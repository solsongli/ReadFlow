import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { settingsBrowser } from "./settings-browser.mjs";

const { browser, page, output, errors, unexpected } = await settingsBrowser({ output: "/tmp/readflow-t10/screenshots" });
const checks = [];
const field = name => page.getByRole("combobox", { name, exact: true });
async function check(name, work) { await work(); checks.push(name); console.log(`ok ${checks.length} - ${name}`); }
async function open(section = "general") { await page.evaluate(section => window.fixture.wb.openSettings(section), section); }
async function screenshot(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== "running"));
  await page.screenshot({ path: `${output}/${name}.png` });
}
async function layout() {
  const overflow = await page.evaluate(() => [...document.querySelectorAll('button,input,select,[role="slider"]')].filter(el => {
    const r = el.getBoundingClientRect(), style = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && (r.right > innerWidth + 1 || r.left < -1);
  }).map(el => el.getAttribute('aria-label') || el.textContent));
  assert.deepEqual(overflow, []);
  const toolbar = page.getByLabel("工作台工具栏", { exact: true });
  if (await toolbar.count()) {
    const overflow = await toolbar.evaluate(el => {
      const box = el.getBoundingClientRect();
      return [...el.querySelectorAll('button,input')].filter(child => { const r = child.getBoundingClientRect(); return r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1); }).map(child => child.getAttribute('aria-label') || child.textContent);
    });
    assert.deepEqual(overflow, [], "toolbar controls stay within their own column");
  }
}
try {
  await open();
  await check("presets and real installed family selection update all interface text immediately", async () => {
    for (const [choice, family] of [["serif", "Noto Serif CJK SC"], ["kai", "AR PL UKai CN"], ["sans", "Noto Sans CJK SC"]]) {
      await field("界面字体").selectOption(choice);
      await page.waitForFunction(family => getComputedStyle(document.body).fontFamily.startsWith('"'+family+'"'), family);
      assert.ok((await page.getByLabel("字体预览", { exact: true }).evaluate(el => getComputedStyle(el).fontFamily)).includes(family));
      assert.ok((await page.getByRole("button", { name: "笔记", exact: true }).evaluate(el => getComputedStyle(el).fontFamily)).includes(family));
    }
    await field("界面字体").selectOption("custom");
    await field("已安装字体").getByRole("option", { name: /支持中文/ }).first().waitFor({ state: "attached" });
    await field("已安装字体").selectOption("DejaVu Sans Mono");
    await page.waitForFunction(() => getComputedStyle(document.body).fontFamily.startsWith('"DejaVu Sans Mono"'));
    await field("笔记编辑器字体").selectOption("serif");
    assert.match(await page.evaluate(() => document.documentElement.style.getPropertyValue("--wb-note-font")), /Noto Serif CJK SC/);
    await page.getByRole("button", { name: "恢复默认", exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixture.wb.store.getSnapshot().uiFont), "custom");
    await field("界面字体").selectOption("default");
    await field("笔记编辑器字体").selectOption("interface");
  });
  await check("smallest and largest typography layouts fit in light and dark", async () => {
    for (const textScale of [85, 130]) for (const theme of ["light", "dark"]) {
      await page.evaluate(({ textScale, theme }) => window.fixture.wb.setPrefs({ textScale, theme }), { textScale, theme });
      await page.waitForFunction(scale => Math.abs(parseFloat(getComputedStyle(document.body).fontSize) - 13 * scale / 100) < .05, textScale);
      await layout(); await screenshot(`type-${textScale}-${theme}-settings`);
      await page.evaluate(() => window.fixture.wb.closeSettings());
      await page.locator('[data-wb-list] [role="option"]').first().click();
      await layout(); await screenshot(`type-${textScale}-${theme}-library`);
      await page.keyboard.press('Control+k');
      await page.getByRole('dialog', { name: '命令与搜索' }).waitFor();
      await layout(); await page.keyboard.press('Escape');
      await open();
    }
    await page.setViewportSize({ width: 900, height: 900 });
    await layout(); await screenshot("type-130-dark-narrow-settings");
    await page.getByRole("button", { name: "完成", exact: true }).click(); await layout();
    await screenshot("type-130-dark-narrow-library");
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await check("keyboard adjusts and resets UI size with normal inputs focused", async () => {
    await page.keyboard.press("Control+0");
    await page.getByRole("searchbox", { name: "搜索文献" }).click();
    await page.keyboard.press("Control+=");
    assert.equal(await page.evaluate(() => window.fixture.wb.store.getSnapshot().textScale), 110);
    await page.keyboard.press("Control+-");
    assert.equal(await page.evaluate(() => window.fixture.wb.store.getSnapshot().textScale), 100);
    await page.keyboard.press("Control+-");
    assert.equal(await page.evaluate(() => window.fixture.wb.store.getSnapshot().textScale), 95);
    await page.keyboard.press("Control+0");
  });
  await check("preferences synchronize across browser tabs and persist through reload", async () => {
    const second = await page.context().newPage();
    await second.goto("http://settings.test/workbench.html");
    await second.locator('[data-wb-list] [role="option"]').first().waitFor();
    await page.evaluate(() => window.fixture.wb.setPrefs({ uiFont: "kai", textScale: 120, noteFont: "mono" }));
    await second.waitForFunction(() => window.fixture.wb.store.getSnapshot().textScale === 120 && window.fixture.wb.store.getSnapshot().uiFont === "kai");
    await second.reload();
    await second.waitForFunction(() => window.fixture.wb?.store.getSnapshot().noteFont === "mono");
    await second.evaluate(() => window.fixture.wb.setPrefs({ textScale: 90 }));
    await page.waitForFunction(() => window.fixture.wb.store.getSnapshot().textScale === 90);
    await second.close();
    await page.evaluate(() => window.fixture.wb.setPrefs({ uiFont: "default", textScale: 100, noteFont: "interface" }));
  });
  await check("PDF typesetting font uses the legacy key, independently from interface font", async () => {
    await open("translation");
    await field("译文排版字体").selectOption("Source Han Sans SC");
    assert.equal(await page.evaluate(() => localStorage.getItem("retainpdf.render.typst_font_family")), "Source Han Sans SC");
    assert.equal(await page.evaluate(() => window.fixture.wb.store.getSnapshot().uiFont), "default");
    await open(); await open("translation");
    await page.waitForFunction(() => document.querySelector('select[aria-label="译文排版字体"]')?.value === "Source Han Sans SC");
    assert.equal(await field("译文排版字体").inputValue(), "Source Han Sans SC");
    await screenshot("type-translation-font-settings");
  });
  await check("browser-only settings expose presets and omit local enumeration", async () => {
    await page.evaluate(() => { delete window.retainPdfDesktop; window.fixture.wb.openSettings("library"); });
    await page.getByRole("heading", { name: "文献库", exact: true }).waitFor(); await open();
    assert.equal(await field("界面字体").getByRole("option").count(), 4);
    assert.equal(await field("已安装字体").count(), 0);
  });
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  await writeFile("/tmp/readflow-t10/typography-smoke.json", JSON.stringify({ checks, errors, unexpected }, null, 2));
  console.log(`${checks.length}/${checks.length}, page errors 0, unexpected requests 0`);
} finally { await browser.close(); }
