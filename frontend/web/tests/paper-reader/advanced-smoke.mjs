import assert from 'node:assert/strict';
import { readerBrowser } from './browser.mjs';
const {browser,page,errors,unexpected}=await readerBrowser('?fallback');
const pane=()=>page.getByLabel('原文页面',{exact:true});
async function go(n){const input=page.getByRole('spinbutton',{name:'页码'});await input.fill(String(n));await input.press('Enter');await page.waitForFunction(n=>document.querySelector('input[name=page]').value===String(n),n);}
try{
 await page.getByRole('button',{name:'2.1 Experiments',exact:true}).waitFor();
 await page.getByRole('tab',{name:'缩略图',exact:true}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('[aria-label="阅读导航"] canvas')].some(c=>c.width>0));
 assert.ok(await page.locator('[aria-label="阅读导航"] canvas').evaluateAll(values=>values.filter(c=>c.width>0).length)<=8);
 await page.locator('[aria-label="阅读导航"] .wb-scroll').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 await page.waitForFunction(()=>document.querySelector('[aria-label="第 1 页缩略图"]').width===0);
 await page.getByRole('tab',{name:'目录',exact:true}).click();
 await go(2);await pane().focus();await page.keyboard.press('1');await page.setViewportSize({width:1400,height:950});await page.keyboard.press('0');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('input[name=page]').value==='10');
 await page.keyboard.type('gg',{delay:150});await page.waitForFunction(()=>document.querySelector('input[name=page]').value==='1');
 await page.keyboard.press(']');await page.waitForFunction(()=>document.querySelector('input[name=page]').value==='1'&&document.querySelector('[aria-current=location]')?.textContent==='Abstract');
 await page.keyboard.press('G');await page.waitForFunction(()=>document.querySelector('input[name=page]').value==='12');
 await pane().evaluate(el=>el.dispatchEvent(new MouseEvent('mousedown',{button:3,bubbles:true,cancelable:true})));
 await page.waitForFunction(()=>document.querySelector('input[name=page]').value==='1');
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 console.log('PASS 3 advanced scenarios: fallback outline, lazy/released thumbnails, keyboard and side-button navigation');
}finally{await browser.close();}
