import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { url:'http://localhost/reader.html' });
for (const key of ['window','document','history','location','localStorage','HTMLElement','Element','Event','Node']) {
  Object.defineProperty(globalThis, key, { value:dom.window[key], writable:true, configurable:true });
}
const { defaultReaderDataPort } = await import('../../src/features/reader/domain/host/data.ts');

test('local OCR Markdown uses the registered canonical range endpoint, not stale OCR artifact URLs', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const requests = [];
  const content = '本地文献证据测试';
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), 'http://localhost');
    requests.push(url.pathname + url.search);
    if (url.pathname === '/api/v1/jobs/local-ocr') {
      return Response.json({ code:0, data:{ job_id:'local-ocr', workflow:'ocr', artifacts:{
        markdown_ready:true, markdown:{ ready:true, raw_url:'/api/v1/ocr/jobs/local-ocr/markdown?raw=true',
          images_base_url:'/api/v1/ocr/jobs/local-ocr/markdown/images/' },
      } } });
    }
    if (url.pathname === '/api/v1/jobs/local-ocr/markdown' && url.search === '?raw=true') {
      return new Response(content, { status:200 });
    }
    return Response.json({ message:'route not found' }, { status:404 });
  };
  const source = await defaultReaderDataPort.loadMarkdownSource('local-ocr');
  assert.ok(source?.rawUrl);
  const result = await defaultReaderDataPort.loadMarkdownRange(source.rawUrl, 0, 262143);
  assert.equal(result.status, 200);
  assert.equal(new TextDecoder().decode(result.bytes), content);
  assert.deepEqual(requests, ['/api/v1/jobs/local-ocr','/api/v1/jobs/local-ocr/markdown?raw=true']);
  assert.equal(new URL(source.imagesBaseUrl, 'http://localhost').pathname, '/api/v1/jobs/local-ocr/markdown/images/');
});

test('translation Markdown keeps its published artifact URL', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => Response.json({ code:0, data:{ job_id:'translation', workflow:'book', artifacts:{
    markdown_ready:true, markdown:{ ready:true, raw_url:'/published/translation.md', images_base_url:'/published/images/' },
  } } });
  const source = await defaultReaderDataPort.loadMarkdownSource('translation');
  assert.ok(source?.rawUrl.endsWith('/published/translation.md'));
  assert.ok(source?.imagesBaseUrl.endsWith('/published/images/'));
});
