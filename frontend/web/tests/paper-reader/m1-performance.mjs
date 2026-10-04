// Run once, alone, after functional verification. One Chrome instance, GPU disabled by readerBrowser.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { readerBrowser } from './browser.mjs';
const started=performance.now();
const env=await readerBrowser('?images');
try{
 await env.page.getByLabel("页面底色",{exact:true}).selectOption("night");
 const firstReady=performance.now()-started;
 const samples=[];
 for(const number of [1,10,20,30,40,50]){
  const page=env.page;
  const input=page.getByRole('spinbutton',{name:'页码'});
  await input.fill(String(number));await input.press('Enter');
  const overlay=page.locator(`[data-paper-page="${number}"] .pr-image-colors[data-restore-ms]`);
  await overlay.waitFor({state:'attached'});
  samples.push(await overlay.evaluate(el=>Number(el.dataset.restoreMs)));
 }
 const live=await env.page.locator('.pr-image-colors').evaluateAll(nodes=>({
  canvases:nodes.filter(el=>el.width>0).length,
  bytes:nodes.reduce((sum,el)=>sum+el.width*el.height*4,0),
 }));
 assert.ok(live.canvases<10);
 const result={pages:100,firstReadyIncludingBrowserMs:Math.round(firstReady),
  imageRestoreMeanMs:samples.reduce((a,b)=>a+b,0)/samples.length,imageRestoreMaxMs:Math.max(...samples),
  sampledPages:6,...live};
 await writeFile('/tmp/readflow-m1/performance.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}finally{await env.browser.close();}
