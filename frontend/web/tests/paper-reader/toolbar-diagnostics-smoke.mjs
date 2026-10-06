import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { readerBrowser } from './browser.mjs';
import { setPaperTone, setTranslationFormat, translationAction, readerAction } from './controls.mjs';
const output='/tmp/readflow-x9c/screenshots';await mkdir(output,{recursive:true});
const env=await readerBrowser('?blocks&configured&x6&x7&diagnostics','tests/paper-reader/integration-fixture.tsx');
const {page}=env;
try {
  await page.getByRole('option',{name:'Paper a',exact:true}).dblclick();
  const toolbar=page.getByRole('toolbar',{name:'论文阅读工具栏',exact:true});
  for(const width of [1280,1440]) {
    await page.setViewportSize({width,height:950});
    await toolbar.waitFor();
    const metrics=await toolbar.evaluate(e=>({height:e.getBoundingClientRect().height,width:e.clientWidth,scroll:e.scrollWidth,
      centers:[...e.children].filter(c=>c.getBoundingClientRect().width>0).map(c=>c.getBoundingClientRect().top+c.getBoundingClientRect().height/2)}));
    assert.ok(metrics.height<=52,JSON.stringify(metrics));
    assert.ok(metrics.scroll<=metrics.width+1,JSON.stringify(metrics));
    assert.ok(Math.max(...metrics.centers)-Math.min(...metrics.centers)<=2,JSON.stringify(metrics));
    await page.screenshot({path:`${output}/toolbar-${width}.png`});
  }
  for(const name of ['原文','对照','译文','原位','块模式']) assert.equal(await toolbar.getByRole('button',{name,exact:true}).count(),1);
  await setTranslationFormat(page,'reflow');
  assert.equal(await page.evaluate(()=>window.fixture.wb.store.getSnapshot().translationFormat),'reflow');
  await setTranslationFormat(page,'layout');
  await setPaperTone(page,'night');
  await page.evaluate(()=>window.fixture.wb.setPrefs({theme:'dark'}));
  await page.screenshot({path:`${output}/toolbar-1440-dark.png`});
  await readerAction(page,'专注模式');
  await page.keyboard.press('f');
  const failure=page.locator('[role="status"]').filter({hasText:'无法连接模型服务或请求超时'});
  await failure.locator('summary').filter({hasText:'查看详情'}).click();
  await failure.getByText(/术语预处理 · ConnectTimeout/).waitFor();
  await page.screenshot({path:`${output}/safe-diagnostics.png`});
  await translationAction(page,'本地重新质检');
  assert.equal(env.blocks.requests().length,0);
  await page.getByRole('button',{name:'翻译菜单',exact:true}).click();
  for(const name of ['原版式 PDF（推荐）','重排 PDF','LaTeX 工程']) await page.getByRole('menuitem',{name,exact:true}).waitFor();
  await page.screenshot({path:`${output}/translation-menu.png`});
  await page.keyboard.press('Escape');
  assert.deepEqual(env.errors,[]);assert.deepEqual(env.unexpected,[]);
  console.log('PASS 1280/1440 single row, modes, format/tone/export menus, focus shortcut, local QA and safe diagnostics');
} finally {await env.browser.close();}
