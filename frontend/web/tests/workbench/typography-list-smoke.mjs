import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { hardeningBrowser } from "./hardening-browser.mjs";

const { browser, page, errors, unexpected } = await hardeningBrowser();
const output = '/tmp/readflow-t10/screenshots'; await mkdir(output, { recursive: true });
const checks = [], list = () => page.locator('[data-wb-list]');
async function check(name, work) { await work(); checks.push(name); console.log(`ok ${checks.length} - ${name}`); }
try {
  await check("2000-row list remeasures type changes and keeps the selected row visible", async () => {
    await page.evaluate(() => window.fixture.wb.select('1600', 'single'));
    await page.locator('[data-row="1600"]').waitFor();
    for (const textScale of [85, 130]) for (const theme of ['light', 'dark']) {
      await page.evaluate(({ textScale, theme }) => window.fixture.wb.setPrefs({ textScale, theme, uiFont: 'kai' }), { textScale, theme });
      await page.waitForFunction(scale => {
        const row = document.querySelector('[data-row="1600"]');
        return row && Math.abs(row.getBoundingClientRect().height - 81 * scale / 100) < .1;
      }, textScale);
      const row = page.locator('[data-row="1600"]');
      const a = await row.boundingBox(), b = await list().boundingBox();
      assert.ok(a.y >= b.y - 1 && a.y + a.height <= b.y + b.height + 1);
      assert.ok(await list().getByRole('option').count() < 35);
      await list().focus(); await page.keyboard.press('j');
      await page.waitForFunction(() => window.fixture.wb.store.getSnapshot().selectedIds[0] === '1601');
      await page.keyboard.press('k');
      await page.waitForFunction(() => window.fixture.wb.store.getSnapshot().selectedIds[0] === '1600');
      await page.screenshot({ path: `${output}/type-${textScale}-${theme}-2000.png` });
    }
  });
  await check("grouped sections use scaled sticky headers and retain range selection across windows", async () => {
    await page.evaluate(() => window.fixture.wb.setPrefs({ layout: 'grouped', textScale: 130 }));
    await page.waitForFunction(() => document.querySelector('[data-wb-list] button[aria-expanded]'));
    const header = list().locator('button[aria-expanded]').first();
    assert.ok(Math.abs((await header.boundingBox()).height - 41.6) < .1);
    await page.evaluate(() => window.fixture.wb.select('1800', 'single')); await page.locator('[data-row="1800"]').first().waitFor();
    await list().focus(); await page.keyboard.press('Shift+ArrowDown');
    await page.waitForFunction(() => window.fixture.wb.store.getSnapshot().selectedIds.length === 2);
    assert.ok(await list().getByRole('option').count() < 35);
    await page.evaluate(() => window.fixture.wb.setPrefs({ textScale: 85, density: 'compact' }));
    await page.waitForFunction(() => { const row = document.querySelector('[data-wb-list] [data-row]'); return row && Math.abs(row.getBoundingClientRect().height - 30.6) < .1; });
    await page.keyboard.press('ArrowDown');
    assert.equal((await page.evaluate(() => window.fixture.wb.store.getSnapshot().selectedIds)).length, 1);
  });
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  await writeFile('/tmp/readflow-t10/typography-list-smoke.json', JSON.stringify({ checks, errors, unexpected }, null, 2));
  console.log(`${checks.length}/${checks.length}, page errors 0, unexpected requests 0`);
} finally { await browser.close(); }
