import assert from 'node:assert/strict';
import { readerBrowser } from './reader-browser.mjs';
const { browser, page, errors, unhandled, output } = await readerBrowser({ fixture: 'tests/workbench/translation-fixture.tsx', output: '/tmp/readflow-t12/screenshots', translated: true });
const checks = [];
async function check(name, work) { await work(); checks.push(name); console.log(`ok ${checks.length} - ${name}`); }
const button = (name) => page.getByRole('button', { name, exact: true });
try {
  await check('unconfigured translation is blocked with inline settings guidance', async () => {
    await button('翻译全文').click();
    await page.getByRole('region', { name: '翻译提示' }).count();
    await page.getByText('还没有配置翻译服务', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.calls.filter((call) => call[0] === 'translate').length), 0);
    await button('去设置').click(); await page.getByRole('heading', { name: '翻译', exact: true }).waitFor();
    await page.screenshot({ path: `${output}/unconfigured.png` });
    await button('完成').click(); await button('收起').click();
  });
  await check('explicit submission and reader toolbar share the running phase', async () => {
    await page.evaluate(() => window.fixture.configure()); await button('翻译全文').click();
    await page.waitForFunction(() => window.fixture.calls.some((c) => c[0] === 'translate'));
    await page.locator('[data-wb-list] [role="option"]').first().dblclick();
    await page.frameLocator('iframe').getByRole('button', { name: /当前第 3 页/ }).waitFor();
    await page.evaluate(async () => { window.fixture.phase({ status: 'running', stage: 'render', percent: 68, job_id: 'fixture-job' }); await window.fixture.wb.translations.poll(); });
    await page.getByLabel('阅读器翻译工具栏').getByText('排版 68%', { exact: true }).waitFor();
    await page.screenshot({ path: `${output}/running.png` });
  });
  await check('failure shows redacted details and explicit retry', async () => {
    await page.evaluate(async () => { window.fixture.phase({ status: 'failed', job_id: 'fixture-job', error: { code: 'credentials', message: '翻译服务的 Key 无效或没有访问权限。', details: '401 [已隐藏]', settings: 'translation' } }); await window.fixture.wb.translations.poll(); });
    await page.getByText('翻译服务的 Key 无效或没有访问权限。', { exact: true }).waitFor();
    await page.getByText('详情', { exact: true }).click(); await page.getByText('401 [已隐藏]').waitFor();
    await button('重试').click(); await page.waitForFunction(() => window.fixture.calls.filter((c) => c[0] === 'translate').length === 2);
  });
  await check('completion refreshes the same reader tab and offers compare reading', async () => {
    await page.evaluate(async () => { window.fixture.phase({ status: 'done', job_id: 'fixture-job', percent: 100 }); await window.fixture.wb.translations.poll(); });
    await page.getByText('《ReadFlow Reader 1》翻译完成', { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('iframe')?.src.includes('job_id=fixture-job'));
    const frame = page.frameLocator('iframe');
    await frame.locator('canvas').first().waitFor();
    for (const name of ['对照', '翻译文件', '源文件']) {
      const mode = frame.getByRole('tab', { name, exact: true });
      await mode.click(); assert.equal(await mode.getAttribute('aria-selected'), 'true');
    }
    await page.screenshot({ path: `${output}/completed.png` });
  });
  await check('command palette submits the selected paper and reader toolbar cancels it', async () => {
    await page.keyboard.press('Control+k');
    await page.getByRole('option', { name: /翻译所选文献/ }).click();
    await button('取消翻译').waitFor(); await button('取消翻译').click();
    await page.waitForFunction(() => window.fixture.calls.some((c) => c[0] === 'cancel'));
    await page.getByLabel('阅读器翻译工具栏').getByText('翻译已取消', { exact: true }).waitFor();
  });
  assert.deepEqual(errors, []); assert.deepEqual(unhandled, []);
  console.log(`PASS ${checks.length} scenarios`);
} finally { await browser.close(); }
