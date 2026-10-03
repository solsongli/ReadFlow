import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { readerBrowser } from '../paper-reader/browser.mjs';
const output='/tmp/readflow-r5/screenshots';
await mkdir(output,{recursive:true});
const env=await readerBrowser('?configured','tests/paper-reader/integration-fixture.tsx');
const {page}=env, checks=[];
async function select(){
  await page.locator('[data-annotation-source=true] .pr-text-layer span').filter({hasText:'We follow'}).first().evaluate(span=>{
    const r=document.createRange();r.selectNodeContents(span);getSelection().removeAllRanges();getSelection().addRange(r);
  });
  await page.getByRole('toolbar',{name:'选中文字工具条'}).waitFor();
}
try {
  await page.getByRole('option',{name:'Paper a',exact:true}).dblclick();
  await page.getByRole('spinbutton',{name:'页码'}).fill('1');
  await page.getByRole('spinbutton',{name:'页码'}).press('Enter');
  for(const kind of ['question','cloze','term']) {
    await select();
    await page.getByRole('button',{name:'做成闪卡',exact:true}).click();
    const editor=page.getByRole('dialog',{name:'做成闪卡'});
    await editor.getByRole('radio',{name:{question:'问答',cloze:'填空',term:'术语'}[kind],exact:true}).click();
    if(kind==='cloze') {
      await editor.getByLabel('挖空原文').evaluate(el=>{el.focus();el.setSelectionRange(3,9);});
      await editor.getByRole('button',{name:'挖空',exact:true}).click();
      assert.match(await editor.getByLabel('正面',{exact:true}).inputValue(),/\[▢\]/);
    } else await editor.getByLabel('正面',{exact:true}).fill(kind==='term'?'Policy':'What supports the claim?');
    await editor.getByLabel('背面',{exact:true}).fill('Evidence and interpretation');
    await editor.getByLabel('我的解释').fill('My explanation');
    await page.screenshot({path:`${output}/editor-${kind}.png`});
    await editor.getByRole('button',{name:'保存',exact:true}).click();
    await editor.waitFor({state:'hidden'});
  }
  assert.equal(env.flashcards.cards().length,3);
  assert.equal(env.annotations().length,1);
  await page.getByRole('button',{name:'打开关联闪卡'}).first().waitFor();
  checks.push('three card kinds, cloze selection, editor, highlight creation, badge');
  await page.getByRole('button',{name:'文献库',exact:true}).first().click();
  await page.getByRole('button',{name:'复习',exact:true}).click();
  await page.getByLabel('复习卡组').selectOption('deck-0');
  await page.getByRole('button',{name:'开始复习',exact:true}).click();
  await page.getByRole('button',{name:'显示答案（空格）'}).waitFor();
  await page.keyboard.press('Space');
  await page.getByLabel('闪卡背面').waitFor();
  await page.screenshot({path:`output-placeholder` .replace('output-placeholder',`${output}/review-back.png`)});
  await page.keyboard.press('3');
  await page.getByText('已复习 1 张 · 剩余 2 张').waitFor();
  checks.push('flip, interval labels, grade, progress');
  await page.keyboard.press('Space');
  await page.keyboard.press('o');
  await page.getByRole('spinbutton',{name:'页码'}).waitFor();
  await page.getByRole('button',{name:'文献库',exact:true}).first().click();
  await page.getByRole('button',{name:'复习',exact:true}).click();
  await page.screenshot({path:`${output}/review-resume.png`});
  await page.reload();
  await page.getByRole('button',{name:'复习',exact:true}).click();
  await page.getByRole('button',{name:'开始复习',exact:true}).click();
  await page.getByRole('heading').filter({hasText:'[▢]'}).waitFor();
  assert.equal(await page.getByLabel('复习卡组').inputValue(),'deck-0');
  await page.evaluate(()=>window.fixture.wb.setPrefs({theme:'dark'}));
  await page.keyboard.press('Space');
  await page.screenshot({path:`${output}/review-dark.png`});
  checks.push('return to source, reload checkpoint, dark review');
  await page.getByRole('button',{name:'书桌',exact:true}).click();
  await page.getByRole('button',{name:'复习',exact:true}).last().waitFor();
  await page.screenshot({path:`${output}/desk.png`});
  checks.push('desk review entry');
  assert.deepEqual(env.errors,[]);
  assert.deepEqual(env.unexpected,[]);
} finally { await env.browser.close(); }
await writeFile('/tmp/readflow-r5/flashcards-scenes.json',JSON.stringify(checks,null,2));
console.log(JSON.stringify({passed:checks.length,checks}));
