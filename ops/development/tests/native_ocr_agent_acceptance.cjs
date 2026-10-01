const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const repo = path.resolve(__dirname, '../../..');
const { chromium } = require(path.join(repo, 'frontend/web/node_modules/playwright'));
const out = path.join(repo, 'docs/ops/planning/research-library-mvp/validation/ocr-agent-20261001');
fs.mkdirSync(out, { recursive: true });
const report = { at: new Date().toISOString(), entry: 'http://127.0.0.1:40061/index.html?tab=research', steps: [], pageErrors: [], realModelTested: false, realOcrTested: false };
const itemId = '626f17cb-6f21-4e57-ad2d-ff54d6387e89';
const attachmentId = 'b9bf0f8d-ae33-405a-9dff-ca4295be9ccd';
const sourceHash = '91d8a7eeadc5841ef2328c242e9eb1197eecd9ab769c94c4bd9e2eaceaa68d13';
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9229');
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('40061'));
  assert(page, 'Original Electron app page exists');
  page.setDefaultTimeout(20000);
  page.on('pageerror', e => report.pageErrors.push(e.message));
  async function selectWorkspace() {
    await page.goto(report.entry, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('搜索文献信息').fill('SafeVLA');
    const row = page.locator('tbody tr').filter({ hasText: 'SafeVLA' });
    await row.first().waitFor({ state: 'visible' });
    await row.getByRole('checkbox').check();
    await page.getByRole('button', { name: '文献库工作区（1 篇）', exact: true }).click();
    return page.getByRole('dialog', { name: '文献库工作区' });
  }
  let dialog = await selectWorkspace();
  const status = await (await page.request.get('http://127.0.0.1:40061/api/research/agent/status')).json();
  assert.equal(status.external_models_allowed, false);
  report.modelGate = { configured: status.configured, enabled: status.external_models_allowed };
  assert.equal(await dialog.getByRole('button', { name: 'Agent 问答', exact: true }).isDisabled(), true);
  await dialog.getByText('文献库专用模型设置', { exact: true }).click();
  await dialog.getByLabel('Base URL', { exact: true }).fill('http://localhost:11434/v1');
  await dialog.getByLabel('模型', { exact: true }).fill('any-local-model');
  assert.equal(await dialog.getByLabel('API Key', { exact: true }).inputValue(), '');
  assert.equal(await dialog.getByRole('button', { name: '保存配置', exact: true }).isEnabled(), true);
  // Verify form flexibility without saving configuration or contacting any model.
  await dialog.getByLabel('Base URL', { exact: true }).fill('https://provider.example/v1');
  assert.equal(await dialog.getByRole('button', { name: '保存配置', exact: true }).isDisabled(), true);
  await dialog.getByLabel('Base URL', { exact: true }).fill(status.base_url || '');
  await dialog.getByLabel('模型', { exact: true }).fill(status.model || '');
  await dialog.getByText('文献库专用模型设置', { exact: true }).click();
  report.steps.push('Original shell workspace supports custom OpenAI-compatible and local keyless model configuration, without saving or calling a model.');
  await dialog.getByLabel('问题或原文关键词').fill('risk');
  const started = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/api/research/agent/runs'));
  await dialog.getByRole('button', { name: '本地原文检索', exact: true }).click();
  let run = await (await started).json();
  for (let tries = 0; ['queued', 'running'].includes(run.status) && tries < 80; tries++) {
    await new Promise(resolve => setTimeout(resolve, 150));
    run = await (await page.request.get('http://127.0.0.1:40061/api/research/agent/runs/' + run.id)).json();
  }
  assert.equal(run.status, 'completed', JSON.stringify(run.error));
  assert.equal(run.result.kind, 'source-search');
  assert(run.result.citations.length > 0);
  for (const citation of run.result.citations) {
    assert.equal(citation.item_id, itemId);
    assert.equal(citation.attachment_id, attachmentId);
    assert.equal(citation.sha256, sourceHash);
    assert(citation.page_idx >= 0 && citation.page_idx < 32);
  }
  await dialog.getByText('以下是本地原文检索结果，未生成模型回答。', { exact: true }).waitFor();
  report.evidence = { count: run.result.citations.length, pageNumbers: run.result.citations.map(c => c.page_idx + 1), itemId, attachmentId, sourceHash };
  await page.screenshot({ path: path.join(out, 'native-source-evidence.png') });
  const target = run.result.citations.find(c => c.page_idx > 0) || run.result.citations[0];
  await dialog.getByRole('button', { name: `在原阅读器查看第 ${target.page_idx + 1} 页 ↗`, exact: true }).first().click();
  const reader = page.frameLocator('#soft-reader-frame');
  const physicalPage = reader.locator(`.react-pdf__Page[data-page-number="${target.page_idx + 1}"]`);
  await physicalPage.locator('canvas').waitFor({ state: 'visible' });
  assert(page.url().includes('research_item_id=' + itemId));
  assert(page.url().includes('page_idx=' + target.page_idx));
  report.readerPageNumber = target.page_idx + 1;
  report.readerPageVisible = await physicalPage.isVisible();
  await page.screenshot({ path: path.join(out, 'native-source-citation-reader.png') });
  report.steps.push('Actual public SafeVLA text is retrieved locally; verified source citation opens the matching physical page in the original Reader.');
  dialog = await selectWorkspace();
  await dialog.getByRole('button', { name: '可选 OCR', exact: true }).click();
  await dialog.getByRole('button', { name: '查看下载清单', exact: true }).click();
  await dialog.getByRole('heading', { name: '下载前确认', exact: true }).waitFor();
  assert.equal(await dialog.getByRole('button', { name: '确认下载上述模块', exact: true }).isDisabled(), true);
  const preview = await (await page.request.get('http://127.0.0.1:40061/api/research/ocr/modules/rapidocr-mobile-cpu/preview')).json();
  assert.equal(preview.total_bytes, 151802982);
  assert.equal(preview.files.length, 18);
  assert.equal(preview.download_enabled, false);
  report.ocrPreview = { bytes: preview.total_bytes, files: preview.files.length, downloadEnabled: preview.download_enabled };
  await page.screenshot({ path: path.join(out, 'native-optional-ocr-manifest.png') });
  report.steps.push('Original shell shows the pinned 18-file OCR manifest, exact sizes and checksums; unapproved download remains disabled.');
  assert.deepEqual(report.pageErrors, []);
  report.passed = true;
  fs.writeFileSync(path.join(out, 'native-ocr-agent-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  process.exit(0);
})().catch(error => {
  report.passed = false;
  report.error = error.stack;
  fs.writeFileSync(path.join(out, 'native-ocr-agent-report-failed.json'), JSON.stringify(report, null, 2));
  console.error(error.stack);
  process.exit(1);
});
