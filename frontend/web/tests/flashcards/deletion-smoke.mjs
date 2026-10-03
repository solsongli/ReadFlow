import assert from 'node:assert/strict';
import { readerBrowser } from '../paper-reader/browser.mjs';
const env=await readerBrowser('?configured','tests/paper-reader/integration-fixture.tsx');
const {page}=env;
try {
  await page.getByRole('option',{name:'Paper a',exact:true}).dblclick();
  await page.getByRole('spinbutton',{name:'页码'}).fill('1');
  await page.getByRole('spinbutton',{name:'页码'}).press('Enter');
  for(const policy of ['keep','remove']) {
    await page.locator('[data-annotation-source=true] .pr-text-layer span').filter({hasText:'We follow'}).first().evaluate(span=>{
      const r=document.createRange();r.selectNodeContents(span);getSelection().removeAllRanges();getSelection().addRange(r);
    });
    await page.getByRole('toolbar',{name:'选中文字工具条'}).getByRole('button',{name:'做成闪卡',exact:true}).click();
    const editor=page.getByRole('dialog',{name:'做成闪卡'});
    await editor.getByLabel('正面',{exact:true}).fill('Delete choice '+policy);
    await editor.getByRole('button',{name:'保存',exact:true}).click();
    await editor.waitFor({state:'hidden'});
    const id=env.annotations().at(-1).id;
    await page.locator(`[data-annotation-id="${id}"]`).first().click({force:true});
    const popup=page.getByRole('region',{name:'编辑批注'});
    await popup.getByRole('button',{name:'删除',exact:true}).click();
    await popup.getByRole('button',{name:'确认删除',exact:true}).click();
    const modal=page.getByRole('dialog',{name:'处理画布引用'});
    await modal.getByText(/1 张闪卡/).waitFor();
    await modal.getByRole('button',{name:policy==='keep'?'保留为静态摘录':'一并删除画布卡和闪卡',exact:true}).click();
    await modal.waitFor({state:'hidden'});
    assert.equal(env.annotations().length,0);
  }
  assert.equal(env.flashcards.cards().length,1);
  assert.equal(env.flashcards.cards()[0].orphaned,true);
  assert.deepEqual(env.errors,[]);
  console.log('2 deletion choices passed');
} finally { await env.browser.close(); }
