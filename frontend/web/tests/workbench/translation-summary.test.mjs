import test from 'node:test';
import assert from 'node:assert/strict';
import { translationSummary, summaryStorageKey } from '../../src/features/paper-blocks/domain/summary.js';
const status = (patch = {}) => ({ document: { blocks: [], warnings: [] }, job: null, result: null, renderer_ready: true, ...patch });
test('translation summary consolidates QA and rendering warnings under one actionable label', () => {
  const value = translationSummary(status({ qa: { checked: 345, retried: 24, needs_review: 6 }, result: {
    qa: { checked: 1, needs_review: 1 }, layout_overflow: ['a'], layout_truncated: ['a'], layout_render_fallback: ['b'],
    label_fallback: ['c'], layout_label_fallback: ['d'], render_fallback: [], usage: { total_tokens: 100 },
  } }));
  assert.equal(value.title, '翻译完成 · 6 块需核对');
  assert.equal(value.actionable, true);
  assert.equal(value.details.filter(d => d.kind === 'quality').length, 1);
  assert.match(value.details.find(d => d.kind === 'quality').text, /24 块已自动重译/);
  assert.equal(value.details.length, 6);
});
test('successful QA retries, label fallback and usage remain passive details', () => {
  const value = translationSummary(status({ qa: { checked: 10, retried: 4, needs_review: 0 }, result: {
    label_fallback: ['figure'], layout_label_fallback: ['label'], usage: { total_tokens: 10 },
  } }));
  assert.equal(value.actionable, false);
  assert.ok(value.details.length >= 3);
  assert.equal(translationSummary(status()).actionable, false);
});
test('dismissal keys belong to the paper and local repair is shown without a paid retry', () => {
  assert.equal(summaryStorageKey('paper'), 'readflow.translation-summary.dismissed.v1:paper');
  assert.notEqual(summaryStorageKey('one'), summaryStorageKey('two'));
  const value = translationSummary(status({ result: { repair_pending: true, marker_cleanup: { tokens: 30, unresolved: 0 } } }));
  assert.equal(value.actionable, true);
  assert.match(value.title, /旧译文待本地修复/);
  assert.match(value.details[0].text, /无需重新翻译/);
});
