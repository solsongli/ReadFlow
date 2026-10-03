import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {readerBrowser} from './browser.mjs';
const {browser,page,errors,unexpected,output}=await readerBrowser('?large');
try{
 const firstPaint=Number(await page.locator('[data-paper-reader]').getAttribute('data-first-paint-ms'));
 const samples=await page.evaluate(async()=>{
   const target=document.querySelector('[data-pdf-pane]'), deltas=[];
   let previous=performance.now(), maxCanvas=0,maxBytes=0,maxQueued=0,maxRunning=0;
   for(let n=0;n<180;n++){
     await new Promise(requestAnimationFrame);const now=performance.now();deltas.push(now-previous);previous=now;
     target.scrollTop=(n/180)*(target.scrollHeight-target.clientHeight);
     const canvases=[...document.querySelectorAll('[data-pdf-pane] canvas')];maxCanvas=Math.max(maxCanvas,canvases.length);
     maxBytes=Math.max(maxBytes,canvases.reduce((sum,c)=>sum+c.width*c.height*4,0));
     const queue=JSON.parse(document.querySelector('[data-paper-reader]').dataset.renderQueue||'{}');maxQueued=Math.max(maxQueued,queue.queued||0);maxRunning=Math.max(maxRunning,queue.maximum||0);
   }
   deltas.sort((a,b)=>a-b);return{frames:deltas.length,p50:deltas[90],p95:deltas[Math.floor(deltas.length*.95)],over50ms:deltas.filter(d=>d>50).length,maxCanvas,maxCanvasMiB:maxBytes/1024/1024,maxQueued,maxRunning};
 });
 assert.ok(samples.maxCanvas<=6);assert.ok(samples.maxRunning<=2);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 await page.screenshot({path:output+'/100-pages.png'});
 const result={pages:100,deviceScaleFactor:2,viewport:'1440x950',firstCanvasFromMountMs:firstPaint,navigationFirstCanvasMs:Number(await page.locator("[data-paper-reader]").getAttribute("data-navigation-paint-ms")),...samples};
 await writeFile('/tmp/readflow-r1/performance.json',JSON.stringify(result,null,2));console.log(result);
}finally{await browser.close();}
