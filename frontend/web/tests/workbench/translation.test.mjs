import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createWorkbenchStore } from '../../src/features/workbench/domain/workbench-store.js';
import { createTranslations } from '../../src/features/workbench/state/translations.js';
import { translationPayload, translationReady, translationProgress } from '../../src/features/workbench/domain/translation.js';

const draft = { provider: 'custom', model: 'fixture-model', baseUrl: 'http://127.0.0.1:9/v1', workers: '3', apiKey: '演示凭据' };
function fixture() {
  const row = { id: 'paper', title: 'Synthetic paper', attachment_id: 'pdf', translation: { status: 'none' }, read_page: 4, read_status: 'reading', notes_count: 0, annotations_count: 0, last_opened_at: null };
  const store = createWorkbenchStore();
  store.actions.listLoaded({ items: [row], counts: { all: 1 }, groups: [], tags: [], total: 1 });
  store.actions.openTab({ id: 'reader:paper', itemId: 'paper', title: row.title, url: '/reader.html?document_id=fixture', status: 'ready', row });
  let value = draft, next = { status: 'running', job_id: 'task', stage: 'translation', percent: 40 };
  const calls = [], notices = [];
  const api = { row: async () => row, translate: async (id, payload) => { calls.push([id, payload]); return { translation: { status: 'queued', job_id: 'task' } }; }, translationStatus: async () => ({ translation: next }), cancelTranslation: async () => ({ translation: { status: 'failed', job_id: 'task' } }) };
  const translations = createTranslations({ api, store, notify: (...args) => notices.push(args), openReader: async () => {}, refreshDesk: async () => {}, loadConfig: async () => ({ draft: value, saved: {} }) });
  return { api, store, calls, notices, translations, config: (v) => { value = v; }, next: (v) => { next = v; } };
}

test('new payload matches the actual retained upload submit function golden body', () => {
  const expected = JSON.parse(execFileSync(process.execPath, ['--import', './tests/helpers/register-jsx.mjs', 'tests/workbench/translation-golden.mjs'], { encoding: 'utf8' }));
  const actual = JSON.parse(JSON.stringify(translationPayload(draft, { glossaryId: 'fixture-glossary' })));
  actual.source.upload_id = "fixture-upload"; // Native document endpoint performs this binding.
  assert.equal(JSON.stringify(actual) === JSON.stringify(expected), true, 'payload equality (credential content is not printed)');
});
test('readiness requires all three credentials fields, no model request', () => {
  assert.equal(translationReady(draft), true);
  for (const name of ['apiKey', 'baseUrl', 'model']) assert.equal(translationReady({ ...draft, [name]: ' ' }), false);
});
test('unconfigured translation offers settings without submitting', async () => {
  const h = fixture(); h.config({ ...draft, apiKey: '' });
  assert.equal(await h.translations.start(['paper']), false);
  assert.equal(h.calls.length, 0); assert.equal(h.store.getSnapshot().translationIssue.error.settings, 'translation');
});
test('submission, progress and completion update only the paper and update native reader data without remounting it', async () => {
  const h = fixture(); await h.translations.start(['paper', 'paper']);
  assert.equal(h.calls.length, 1);
  await h.translations.poll();
  assert.equal(h.store.getSnapshot().list.result.items[0].translation.percent, 40);
  h.next({ status: 'done', job_id: 'task', percent: 100 }); await h.translations.poll();
  const tab = h.store.getSnapshot().tabs.find((t) => t.itemId === 'paper');
  assert.equal(tab.row.translation.job_id, "task"); assert.equal(tab.row.read_page, 4);
  assert.equal(tab.navigationKey, undefined, "completion does not remount native reader");
  assert.equal(h.notices.at(-1)[0], '《Synthetic paper》翻译完成');
  assert.equal(h.notices.at(-1)[3], '对照阅读');
  await h.translations.poll(); assert.equal(h.notices.filter((n) => n[1] === 'success').length, 1);
});
test('failed job shows actionable details and retry resubmits explicitly', async () => {
  const h = fixture(); await h.translations.start(['paper']);
  h.next({ status: 'failed', job_id: 'task', error: { code: 'quota', message: '服务额度不足', settings: 'translation', details: '429 [已隐藏]' } });
  await h.translations.poll(); assert.equal(h.store.getSnapshot().translationIssue.error.code, 'quota');
  await h.translations.start(['paper']); assert.equal(h.calls.length, 2);
});
test('phase copy distinguishes OCR, translation and rendering', () => {
  assert.equal(translationProgress({ status: 'running', stage: 'render', percent: 70 }), '排版 70%');
  assert.equal(translationProgress({ status: 'running', stage: 'ocr', percent: 8 }), '文字识别 8%');
});

test('translation rendering reads the existing persisted font selection', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'Noto Serif CJK SC' } });
  try { assert.equal(translationPayload(draft, {}).render.typst_font_family, 'Noto Serif CJK SC'); }
  finally { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; }
});

test('cancel rejection offers cancel retry without reporting success', async () => {
  const h = fixture(); h.api.cancelTranslation = async () => ({ error: { code: 'network', message: 'unavailable' } });
  await h.translations.cancel('paper');
  assert.equal(h.store.getSnapshot().translationIssue.error.code, 'cancel_failed');
  assert.equal(h.notices.some((notice) => notice[0] === '已请求取消翻译。'), false);
});
