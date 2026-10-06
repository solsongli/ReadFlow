import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { readerBrowser } from '../paper-reader/browser.mjs';
await mkdir('/tmp/readflow-x9b/screenshots',{recursive:true});
const env=await readerBrowser('?blocks&configured&x6&repaired-sam','tests/paper-reader/integration-fixture.tsx');
try {
  const {page,context}=env;
  const source=await readFile('/home/lsy/Documents/LeoProjetcs/Retainpdf/readflow-corpus/2304.02643.pdf');
  await context.route('**/api/research/attachments/*/pdf',route=>route.fulfill({body:source,contentType:'application/pdf'}));
  await page.getByRole('option',{name:'Paper a',exact:true}).dblclick();
  await page.getByRole('tab',{name:'目录',exact:true}).click();
  const nav=page.getByRole('complementary',{name:'阅读导航',exact:true});
  await nav.getByText(/数据引擎/).first().waitFor();
  assert.doesNotMatch(await nav.innerText(),/BOLD|RF_[a-f0-9]/);
  const pageInput=page.getByRole('spinbutton',{name:'页码',exact:true});
  await pageInput.fill('5');await pageInput.press('Enter');
  await page.waitForFunction(()=>document.querySelector('[data-paper-page="5"] > canvas')?.style.visibility==='visible');
  await page.screenshot({path:'/tmp/readflow-x9b/screenshots/sam-clean-outline.png'});
  assert.deepEqual(env.errors,[]);assert.deepEqual(env.unexpected,[]);
  console.log('PASS real SAM repaired-cache bilingual outline: no internal marker text');
} finally {await env.browser.close();}
