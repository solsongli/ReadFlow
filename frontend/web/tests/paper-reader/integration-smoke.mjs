import assert from 'node:assert/strict';
import { readerBrowser } from './browser.mjs';
const {browser,page,errors,unexpected,output}=await readerBrowser('', 'tests/paper-reader/integration-fixture.tsx');
try{
 await page.getByRole('option',{name:'Paper a',exact:true}).dblclick();
 await page.locator('[data-wb-reader-active=true] [data-paper-page="3"] .pr-text-layer span').first().waitFor();
 assert.equal(await page.locator('iframe').count(),0);
 const paint=await page.locator('[data-wb-reader-active=true] [data-paper-reader]').getAttribute('data-first-paint-ms');
 const input=page.getByRole('spinbutton',{name:'页码'});await input.fill('5');await input.press('Enter');
 await page.waitForFunction(()=>window.fixture.rows[0].read_page===5);
 await page.evaluate(()=>window.fixture.wb.openReader('b'));await page.locator('[data-wb-reader-active=true] [data-paper-page="3"] .pr-text-layer span').first().waitFor();
 await page.evaluate(()=>window.fixture.wb.activateTab('reader:a'));
 await page.waitForFunction(()=>document.querySelector('[data-wb-reader-active=true] input[name=page]').value==='5');
 assert.equal(await page.locator('[data-wb-reader-active=true] [data-paper-reader]').getAttribute('data-first-paint-ms'),paint);
 await page.evaluate(()=>window.fixture.wb.setPrefs({uiFont:'serif',textScale:130,theme:'dark'}));
 await page.waitForFunction(()=>getComputedStyle(document.body).fontFamily.includes('Noto Serif'));
 await page.locator('[data-wb-reader-active=true]').getByLabel('原文页面',{exact:true}).focus();await page.keyboard.press('f');
 await page.waitForFunction(()=>document.querySelector('[data-paper-reader][data-focus=true]')!==null);
 assert.equal(await page.getByRole('button',{name:'设置',exact:true}).count(),0);
 await page.screenshot({path:output+'/native-focus-dark.png'});await page.keyboard.press('f');
 await page.evaluate(()=>{const row=window.fixture.wb.store.getSnapshot().tabs.find(t=>t.itemId==='a').row;window.fixture.rows[0].translation={status:"done",job_id:"task",percent:100};const result=window.fixture.wb.store.getSnapshot().list.result;window.fixture.wb.store.actions.listLoaded({...result,items:result.items.map(r=>r.id===row.id?{...r,translation:window.fixture.rows[0].translation}:r)});window.fixture.wb.store.actions.updateTab('reader:a',{row:{...row,translation:window.fixture.rows[0].translation}});});
 await page.getByRole('button',{name:'对照',exact:true}).click();await page.getByLabel('译文页面',{exact:true}).locator('.pr-text-layer span').first().waitFor();
 await page.screenshot({path:output+'/native-workbench.png'});
 assert.equal(await page.locator('iframe').count(),0);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 console.log('PASS 5 native integration scenarios: progress/resume, tab keepalive, typography/theme, focus, translation completion');
}finally{await browser.close();}
