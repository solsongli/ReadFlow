import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { notesBrowser } from "./notes-browser.mjs";

const { browser, page, errors, unexpected } = await notesBrowser();
const output = '/tmp/readflow-t10/screenshots'; await mkdir(output, { recursive: true });
try {
  await page.getByLabel('导航', { exact: true }).getByRole('button', { name: '笔记', exact: true }).click();
  const editor = page.getByLabel('笔记正文', { exact: true }); await editor.waitFor();
  const body = await editor.inputValue();
  for (const [noteFont, expected] of [['interface', 'AR PL UKai CN'], ['serif', 'Noto Serif CJK SC'], ['mono', 'DejaVu Sans Mono']]) {
    await page.evaluate(noteFont => window.fixture.wb.setPrefs({ uiFont: 'kai', textScale: 130, noteFont }), noteFont);
    await page.waitForFunction(expected => getComputedStyle(document.querySelector('[aria-label="笔记正文"]')).fontFamily.includes(expected), expected);
    assert.equal(await editor.evaluate(el => getComputedStyle(el).fontSize), '22.1px');
    assert.equal(await editor.inputValue(), body);
  }
  await page.evaluate(() => window.fixture.wb.setPrefs({ theme: 'dark' }));
  await page.screenshot({ path: `${output}/type-130-dark-notes-mono.png` });
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await page.getByLabel('Markdown 预览', { exact: true }).waitFor();
  assert.match(await page.getByLabel('Markdown 预览', { exact: true }).evaluate(el => getComputedStyle(el).fontFamily), /DejaVu Sans Mono/);
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  await writeFile('/tmp/readflow-t10/typography-notes-smoke.json', JSON.stringify({ checks: ['three editor fonts, scaled size and Markdown preview'], errors, unexpected }, null, 2));
  console.log('1/1, page errors 0, unexpected requests 0');
} finally { await browser.close(); }
