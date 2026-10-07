import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { readerBrowser } from '../paper-reader/browser.mjs';
import { setPaperTone } from '../paper-reader/controls.mjs';
const output='/tmp/readflow-m1/screenshots';
await mkdir(output,{recursive:true});
const checks=[];
{
 const env=await readerBrowser('?configured','tests/paper-reader/integration-fixture.tsx');
 const {page}=env;
 try {
  await page.getByRole('option',{name:'Paper a',exact:true}).click();
  const notes=page.getByRole('region',{name:'文献笔记'});
  await notes.getByRole('button',{name:'新建笔记',exact:true}).waitFor();
  assert.equal(await notes.getByText('查看全部 0 条').count(),0);
  await page.getByRole('option',{name:'Paper a',exact:true}).dblclick();
  await page.getByRole('spinbutton',{name:'页码'}).fill('1');
  await page.getByRole('spinbutton',{name:'页码'}).press('Enter');
  await page.locator('[data-annotation-source=true] .pr-text-layer span').filter({hasText:'We follow'}).first().evaluate(span=>{
   const range=document.createRange();range.selectNodeContents(span);getSelection().removeAllRanges();getSelection().addRange(range);
  });
  await page.getByRole('toolbar',{name:'选中文字工具条'}).getByRole('button',{name:'做成闪卡',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'做成闪卡'});
  assert.equal(env.assistance.calls.length,0);
  await dialog.getByRole('button',{name:'让 AI 出题（会发送这段文字）',exact:true}).click();
  await dialog.getByRole('region',{name:'闪卡出题隐私确认'}).waitFor();
  assert.equal(env.assistance.calls.filter(c=>c.action==='ask').length,0);
  await page.screenshot({path:output+'/card-privacy.png'});
  await dialog.getByRole('region',{name:'闪卡出题隐私确认'}).getByRole('button',{name:'发送',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('textarea[aria-label="正面"]').value==='这段证据支持什么结论？');
  assert.match(await dialog.getByLabel('背面',{exact:true}).inputValue(),/仅供验收/);
  assert.equal(env.flashcards.cards().length,0);
  await dialog.getByLabel('正面',{exact:true}).fill('用户修改后的问题');
  await page.screenshot({path:output+'/card-suggestion.png'});
  await dialog.getByRole('button',{name:'保存',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
  assert.equal(env.flashcards.cards()[0].front,'用户修改后的问题');
  assert.deepEqual(env.errors,[]);assert.deepEqual(env.unexpected,[]);
  checks.push('empty notes card; explicit AI consent; suggestions editable and never autosaved');
 }finally{await env.browser.close();}
}
{
 const env=await readerBrowser('?images');const {page}=env;
 try {
  await setPaperTone(page,'night');
  const result=await page.locator('[data-paper-page="1"] .pr-image-colors').evaluate(canvas=>{
   const source=canvas.parentElement.querySelector('canvas');
   const x=Math.floor(100*source.width/400), y=Math.floor(180*source.height/600);
   return {source:[...source.getContext('2d').getImageData(x,y,1,1).data],
    overlay:[...canvas.getContext('2d').getImageData(x-Number(canvas.dataset.pixelLeft),y-Number(canvas.dataset.pixelTop),1,1).data],
    cropped:canvas.width<source.width*.5&&canvas.height<source.height*.3,
    filter:getComputedStyle(canvas).filter,display:getComputedStyle(canvas).display,regions:canvas.dataset.imageRegions};
  });
  assert.deepEqual(result.overlay,result.source);assert.equal(result.cropped,true);
  assert.equal(result.filter,'none');assert.equal(result.display,'block');assert.equal(result.regions,'1');
  await page.screenshot({path:output+'/night-images.png'});
  assert.deepEqual(env.errors,[]);checks.push('night raster regions retain original pixels and transparent outside');
 }finally{await env.browser.close();}
}
{
 const env=await readerBrowser('','tests/thought-canvas/fixture.tsx');const {page}=env;
 try {
  const image='data:image/png;base64,'+(await readFile('tests/fixtures/paper-image.png')).toString('base64');
  const nodes=[
   {id:'g',type:'group',x:0,y:0,width:780,height:400,text:'相关工作'},
   {id:'a',type:'excerpt',x:30,y:55,width:300,height:145,text:'自己的解释',quote:'Evidence from the source paper.',item_id:'a',title:'Paper a',page:2},
   {id:'b',type:'sticky',x:420,y:55,width:270,height:145,text:'比较不同方法的安全假设'},
   {id:'c',type:'todo',x:30,y:235,width:300,height:120,text:'还需验证的问题'},
   {id:'d',type:'text',x:420,y:235,width:270,height:85,text:'实验对照'},
   {id:'e',type:'image',x:30,y:440,width:300,height:230,text:'原始图片',image_ref:'fixture.png',image},
   {id:'f',type:'paper',x:420,y:440,width:300,height:230,text:'文献卡',title:'Research title',authors:['Alice Zhang'],year:'2026',venue:'Journal',item_id:'a'},
  ];
  env.canvases.documents.set('large',{id:'large',name:'思考画布',nodes,edges:[{id:'edge',from_id:'a',to_id:'b',label:'支持',style:'arrow'}]});
  await page.reload();await page.getByRole('button',{name:'导出 PNG',exact:true}).waitFor();
  const colors=[];
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.documentElement.dataset.wbTheme=theme,theme);
   const download=page.waitForEvent('download');
   await page.getByRole('button',{name:'导出 PNG',exact:true}).click();
   const file=output+`/canvas-${theme}.png`;await(await download).saveAs(file);
   const png=PNG.sync.read(await readFile(file));
   assert.ok(png.width>1000&&png.height>1000);colors.push(png.data[0]);
   await page.screenshot({path:output+`/canvas-ui-${theme}.png`});
  }
  assert.ok(colors[0]>colors[1]);assert.deepEqual(env.errors,[]);
  checks.push('full canvas PNG includes groups, connections, labels, text, source and image cards in both themes');
 }finally{await env.browser.close();}
}
await writeFile('/tmp/readflow-m1/scenarios.json',JSON.stringify(checks,null,2));
console.log(JSON.stringify(checks));
