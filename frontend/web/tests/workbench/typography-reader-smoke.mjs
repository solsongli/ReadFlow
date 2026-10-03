import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { readerBrowser } from "./reader-browser.mjs";

const { browser, page, errors, unhandled } = await readerBrowser();
const output = "/tmp/readflow-t10/screenshots";
await mkdir(output, { recursive: true });
const checks = [];
async function check(name, work) { await work(); checks.push(name); console.log(`ok ${checks.length} - ${name}`); }
try {
  await page.locator('[data-wb-list] [role="option"]').first().dblclick();
  await page.frameLocator('iframe').getByRole("button", { name: /当前第 3 页，共 8 页/ }).waitFor();
  const frame = page.frames().find(frame => frame.url().includes('embed=workbench'));
  const token = await frame.evaluate(() => window.documentToken);
  const pdfBefore = await frame.locator('canvas').first().evaluate(el => ({ width: el.width, height: el.height, font: getComputedStyle(document.querySelector('.textLayer span')).fontFamily }));
  const zoomBefore = await frame.locator('.reader-react-hud-zoom-label').textContent();
  await check("embedded UI fonts and text size sync live while PDF pixels and zoom remain unchanged", async () => {
    await page.evaluate(() => window.fixture.wb.setPrefs({ uiFont: 'kai', textScale: 130, theme: 'dark' }));
    await frame.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.querySelector('.reader-react-hud-page')).fontSize) - 15.6) < .01);
    assert.match(await frame.locator('.reader-react-hud').evaluate(el => getComputedStyle(el).fontFamily), /AR PL UKai CN/);
    const pdfAfter = await frame.locator('canvas').first().evaluate(el => ({ width: el.width, height: el.height, font: getComputedStyle(document.querySelector('.textLayer span')).fontFamily }));
    assert.deepEqual(pdfAfter, pdfBefore);
    assert.equal(await frame.locator('.reader-react-hud-zoom-label').textContent(), zoomBefore);
    assert.equal(await frame.evaluate(() => window.documentToken), token);
    assert.equal(await frame.evaluate(() => window.themeReads.length + window.themeWrites.length), 0);
    await frame.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${output}/type-130-dark-reader.png` });
  });
  await check("Markdown and AI panel controls adopt the interface font without sending model requests", async () => {
    await frame.getByRole('button', { name: '打开Markdown', exact: true }).click();
    const markdown = frame.locator('#reader-markdown-panel');
    await markdown.waitFor();
    assert.match(await markdown.evaluate(el => getComputedStyle(el).fontFamily), /AR PL UKai CN/);
    const search = frame.getByRole('searchbox', { name: '搜索 Markdown 正文', exact: true });
    const markdownSize = await search.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    await page.evaluate(() => window.fixture.wb.setPrefs({ textScale: 85 }));
    await frame.waitForFunction(() => document.documentElement.style.getPropertyValue('--readflow-ui-scale') === '0.85');
    assert.ok(Math.abs(await search.evaluate(el => parseFloat(getComputedStyle(el).fontSize)) - markdownSize * 85 / 130) < .05);
    await page.evaluate(() => window.fixture.wb.setPrefs({ textScale: 130 }));
    await frame.waitForFunction(() => document.documentElement.style.getPropertyValue('--readflow-ui-scale') === '1.3');
    await frame.getByRole('tab', { name: 'AI 问答', exact: true }).click();
    const ai = frame.locator('.reader-float-ai');
    await ai.waitFor();
    assert.match(await ai.evaluate(el => getComputedStyle(el).fontFamily), /AR PL UKai CN/);
    // This source-only fixture shows AI availability text rather than a model-backed composer.
    const aiText = ai.locator('p').first();
    const aiSize = await aiText.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    await page.evaluate(() => window.fixture.wb.setPrefs({ textScale: 85 }));
    await frame.waitForFunction(() => document.documentElement.style.getPropertyValue('--readflow-ui-scale') === '0.85');
    assert.ok(Math.abs(await aiText.evaluate(el => parseFloat(getComputedStyle(el).fontSize)) - aiSize * 85 / 130) < .05);
    await page.evaluate(() => window.fixture.wb.setPrefs({ textScale: 130 }));
    await frame.waitForFunction(() => document.documentElement.style.getPropertyValue('--readflow-ui-scale') === '1.3');
    const missing = await frame.locator('button,input,textarea,select').evaluateAll(elements => elements.filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width && rect.height && !el.closest('.textLayer,.annotationLayer') && !getComputedStyle(el).fontFamily.includes('AR PL UKai CN');
    }).map(el => ({ tag: el.tagName, cls: el.className })));
    assert.deepEqual(missing, []);
    await page.screenshot({ path: `${output}/type-130-dark-reader-ai.png` });
    await frame.getByRole('button', { name: '关闭阅读辅助面板', exact: true }).click();
  });
  await check("Ctrl zoom inside the reader remains PDF zoom and does not alter workbench text size", async () => {
    await frame.locator('.reader-react-hud-page-btn').focus();
    await page.keyboard.press('Control+=');
    await frame.waitForFunction(before => document.querySelector('.reader-react-hud-zoom-label').textContent !== before, zoomBefore);
    assert.equal(await page.evaluate(() => window.fixture.wb.store.getSnapshot().textScale), 130);
    await page.keyboard.press('Control+0');
    await frame.waitForFunction(before => document.querySelector('.reader-react-hud-zoom-label').textContent === before, zoomBefore);
    // Focus on the parent tab bar still routes these keys to the active PDF.
    await page.getByRole('navigation', { name: '阅读器标签页' }).getByRole('button', { name: 'ReadFlow Reader 1', exact: true }).click();
    await page.keyboard.press('Control+-');
    await frame.waitForFunction(before => document.querySelector('.reader-react-hud-zoom-label').textContent !== before, zoomBefore);
    assert.equal(await page.evaluate(() => window.fixture.wb.store.getSnapshot().textScale), 130);
  });
  await check("all open readers receive appearance, including a hidden tab without reload", async () => {
    await page.evaluate(() => window.fixture.wb.openReader(window.fixture.rows[1].id));
    await page.waitForFunction(() => document.querySelectorAll('iframe').length === 2 && [...document.querySelectorAll('iframe')].every(el => el.contentWindow.location.search.includes('embed=workbench')));
    const other = page.frames().find(value => value !== frame && value.url().includes('embed=workbench'));
    await other.locator('.reader-react-hud').waitFor();
    await page.evaluate(() => window.fixture.wb.setPrefs({ uiFont: 'serif', textScale: 85, theme: 'light' }));
    for (const child of [frame, other]) {
      await child.waitForFunction(() => document.documentElement.style.getPropertyValue('--readflow-ui-scale') === '0.85');
      assert.match(await child.locator('.reader-react-hud').evaluate(el => getComputedStyle(el).fontFamily), /Noto Serif CJK SC/);
    }
    assert.equal(await frame.evaluate(() => window.documentToken), token);
    await page.screenshot({ path: `${output}/type-85-light-reader.png` });
  });
  assert.deepEqual(errors, []); assert.deepEqual(unhandled, []);
  await writeFile('/tmp/readflow-t10/typography-reader-smoke.json', JSON.stringify({ checks, errors, unhandled }, null, 2));
  console.log(`${checks.length}/${checks.length}, page errors 0, unhandled requests 0`);
} finally { await browser.close(); }
