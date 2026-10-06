import { setPaperTone } from "./controls.mjs";
import { readerAction } from "./controls.mjs";
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { readerBrowser } from './browser.mjs';
const {browser,page,errors,unexpected,output}=await readerBrowser();
const checks=[]; const button=(name)=>page.getByRole('button',{name,exact:true});
async function check(name,work){await work();checks.push(name);console.log(`ok ${checks.length} - ${name}`);}
async function go(number){const input=page.getByRole('spinbutton',{name:'页码'});await input.fill(String(number));await input.press('Enter');await page.waitForFunction(n=>document.querySelector('input[name="page"]').value===String(n),number);await page.locator(`[data-paper-page="${number}"] .pr-text-layer span`).first().waitFor();}
async function hoverText(text){
 const box=await page.locator('.pr-text-layer').evaluateAll((layers,text)=>{for(const layer of layers)for(const span of layer.querySelectorAll('span')){const at=span.textContent.indexOf(text);if(at<0||!span.firstChild)continue;const r=document.createRange();r.setStart(span.firstChild,at);r.setEnd(span.firstChild,at+text.length);const b=r.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};}return null;},text);
 assert.ok(box,`text ${text}`);await page.mouse.move(box.x,box.y);
}
try{
 await check('native canvas and selectable text open without iframe',async()=>{assert.equal(await page.locator('iframe').count(),0);await page.getByRole('button',{name:'References',exact:true}).waitFor();assert.ok(await page.locator('[data-pdf-pane] canvas').count()<=5);await page.screenshot({path:output+'/reading.png'});});
 await check('reference hover prefers link destination and can copy and search the library',async()=>{
  await page.getByText(/本文参考文献 · 12/).waitFor();
  await page.locator('.pr-link[aria-label="文内链接"]').hover();
  const preview=page.getByRole('dialog',{name:'引用预览'});await preview.waitFor();assert.match(await preview.textContent(),/Synthetic research method 12/);
  await preview.getByRole('button',{name:'复制条目'}).click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/Synthetic research method 12/);
  await preview.getByRole('button',{name:'在文献库中查找'}).click();await preview.getByText(/已在库中/).waitFor();
  const before=await page.getByLabel('原文页面',{exact:true}).evaluate(el=>el.scrollTop);
  await preview.getByRole('button',{name:'跳到参考文献'}).click();await page.waitForFunction(()=>document.querySelector('input[name=page]').value==='12');
  await button('后退').click();await page.waitForFunction(()=>document.querySelector('input[name=page]').value==='1');
  assert.ok(Math.abs(await page.getByLabel('原文页面',{exact:true}).evaluate(el=>el.scrollTop)-before)<2);
 });
 await check('author-year fallback and figure caption screenshot previews',async()=>{
  await go(1);await hoverText('(Zhang et al., 2025)');await page.getByRole('dialog',{name:'引用预览'}).waitFor();
  await page.mouse.move(10,900);await page.getByRole('dialog',{name:'引用预览'}).waitFor({state:'hidden'});
  await hoverText('Figure 3');const preview=page.getByRole('dialog',{name:'图表预览'});await preview.waitFor();await page.waitForFunction(()=>document.querySelector('[aria-label="图表预览"] canvas')?.width>0);
  await page.screenshot({path:output+'/figure-preview.png'});await preview.getByRole('button',{name:'跳到图表区域',exact:true}).click();await page.waitForFunction(()=>document.querySelector('input[name=page]').value==='3');
 });
 await check('outline, named bookmark persistence and deletion',async()=>{
  await page.getByRole('button',{name:'2 Methods',exact:true}).click();await readerAction(page,"添加书签");await page.getByRole('textbox',{name:'书签名称'}).fill('Research method');await button('保存书签').click();await page.getByRole('button',{name:'Research method · 2'}).waitFor();
  await button('删除书签 Research method').click();await page.getByRole('button',{name:'Research method · 2'}).waitFor({state:'hidden'});
 });
 await check('search results jump, highlight text and have navigation history',async()=>{
  await page.locator('[data-pdf-pane]').first().focus();await page.keyboard.press('Control+f');await page.getByRole('textbox',{name:'搜索论文'}).fill('Reproducible evidence');
  await page.getByRole('button',{name:/第 2 页.*Reproducible evidence/}).first().click();await page.locator('.pr-search-hit').first().waitFor();
  await page.locator('[data-pdf-pane]').first().focus();await page.keyboard.press('n');await button('后退').click();
 });
 await check('night tone, focus and independent UI text remain readable',async()=>{
  await setPaperTone(page,"night");assert.match(await page.locator('[data-pdf-pane] canvas').first().evaluate(el=>getComputedStyle(el).filter),/invert/);
  await page.locator('[data-pdf-pane]').first().focus();await page.keyboard.press('f');assert.equal(await page.getByLabel('阅读导航',{exact:true}).count(),0);
  await page.screenshot({path:output+'/focus-night.png'});await page.mouse.move(400,4);await page.getByRole("button",{name:"更多阅读操作",exact:true}).waitFor();await readerAction(page,"退出专注模式");
 });
 await check('compare mode follows page numbers and can disable synchronization',async()=>{
  await button('对照').click();await page.getByLabel('译文页面',{exact:true}).waitFor();await go(5);
  await page.waitForFunction(()=>{const el=document.querySelector('[aria-label="译文页面"]');return el&&el.scrollTop>1000;});
  await page.getByRole('checkbox',{name:'同步滚动'}).uncheck();await button('译文').click();await page.waitForFunction(()=>document.querySelector('input[name=page]').max==='14');await button('原文').click();
 });
 await check('pointer zoom keeps its document anchor and progress resumes after reload',async()=>{
  await go(6);const beforeWidth=await page.locator('[data-paper-page="6"]').first().evaluate(el=>el.getBoundingClientRect().width);await button('放大 PDF').click();await page.waitForFunction(width=>document.querySelector('[data-paper-page="6"]').getBoundingClientRect().width>width,beforeWidth);await button('缩小 PDF').click();
  const pane=page.getByLabel('原文页面',{exact:true});const rect=await pane.boundingBox();await page.mouse.move(rect.x+rect.width/2,rect.y+220);await page.keyboard.down('Control');await page.mouse.wheel(0,-100);await page.keyboard.up('Control');
  await page.waitForFunction(()=>!['width','page'].includes(document.querySelector('[aria-label="PDF 缩放"]').value));
  await page.waitForFunction(()=>window.fixture.progress.some(p=>p.page===6));await page.reload();await page.waitForFunction(()=>document.querySelector('input[name=page]')?.value==='6');
 });
 await check('selection toolbar and Ctrl Shift C copy citations from PDF text only',async()=>{
  await go(1);await page.getByLabel('原文页面',{exact:true}).focus();
  await page.locator('.pr-text-layer').evaluateAll(layers=>{const span=layers.flatMap(el=>[...el.querySelectorAll('span')]).find(el=>el.textContent.includes('We follow'));const r=document.createRange();r.selectNodeContents(span);const s=window.getSelection();s.removeAllRanges();s.addRange(r);});
  await page.getByRole('toolbar',{name:'选中文字工具条'}).waitFor();await page.keyboard.press('Control+Shift+c');
  assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/Zhang et al\., 2025, p\. 1/);
  await page.getByRole('button',{name:'GB/T + 页码',exact:true}).click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/GBT entry|ZHANG A/);
  await page.evaluate(()=>window.getSelection().removeAllRanges());
 });
 await check('supplementary translated pages can have their own named bookmarks',async()=>{
  await button('译文').click();await go(14);await readerAction(page,"添加书签");await page.getByRole('textbox',{name:'书签名称'}).fill('Supplement');await button('保存书签').click();
  await button('原文').click();await page.getByRole('button',{name:'Supplement · 14（译文）',exact:true}).click();await page.waitForFunction(()=>document.querySelector('input[name=page]').value==='14');
  await button('后退').click();await page.waitForFunction(()=>document.querySelector('[aria-label="阅读模式"] button[aria-pressed="true"]').textContent==='原文');
 });
 await check('external links require explicit confirmation',async()=>{await go(1);await page.locator('.pr-link[aria-label="外部链接"]').click();await page.getByRole('dialog',{name:'打开外部链接'}).waitFor();assert.equal(page.context().pages().length,1);await button('取消').click();});
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);await writeFile('/tmp/readflow-r1/smoke.json',JSON.stringify({checks,errors,unexpected},null,2));console.log(`PASS ${checks.length}`);
}catch(error){await page.screenshot({path:output+'/failure.png'});console.log({errors,unexpected,state:await page.evaluate(()=>({page:document.querySelector('input[name=page]')?.value, panes:[...document.querySelectorAll('[data-pdf-pane]')].map(el=>({label:el.getAttribute('aria-label'),top:el.scrollTop,height:el.scrollHeight,viewport:el.clientHeight,width:el.clientWidth,pages:[...el.querySelectorAll('[data-paper-page]')].map(p=>({n:p.dataset.paperPage,top:p.getBoundingClientRect().top,height:p.clientHeight}))})),progress:window.fixture.progress.slice(-5)}))});throw error;}finally{await browser.close();}
