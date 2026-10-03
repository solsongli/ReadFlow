import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmedExternalUrl } from './external-links.js';
test('confirmed links may use web or mail handlers, never files or executable schemes',()=>{
  assert.equal(confirmedExternalUrl('https://example.org'),'https://example.org/');
  assert.equal(confirmedExternalUrl('mailto:author@example.org'),'mailto:author@example.org');
  for(const url of ['javascript:alert(1)','file:///etc/passwd','https://user:pass@example.org',null]) assert.throws(()=>confirmedExternalUrl(url));
});
