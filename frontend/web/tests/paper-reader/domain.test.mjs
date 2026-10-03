import test from 'node:test';
import assert from 'node:assert/strict';
import { citationMarkers, parseReferences, findReferences, figureReference, figureTargets, heuristicOutline, quoteReference } from '../../src/features/paper-reader/domain/analysis.js';
import { initialHistory, jumpHistory, moveHistory, visiblePages, offsets, correspondingPage, anchoredScroll, externalLink, rasterRatio } from '../../src/features/paper-reader/domain/navigation.js';
const line = (text, page=1, y=100, size=11) => ({ text, page, y, x: 50, width: 300, height: size, size });
test('citation numbers, bounded ranges, lists and author-year markers', () => {
  assert.deepEqual(citationMarkers('[12]').numbers, [12]);
  assert.deepEqual(citationMarkers('[3–5]').numbers, [3,4,5]);
  assert.deepEqual(citationMarkers('[7, 9]').numbers, [7,9]);
  assert.deepEqual(citationMarkers('(Zhang et al., 2025)'), { numbers: [], author: 'zhang', year: '2025' });
  assert.equal(citationMarkers('[1-999999]'), null);
});
test('reference section combines continuation lines and uses explicit destinations first', () => {
  const refs = parseReferences([line('Introduction'), line('References', 12, 50, 18), line('[1] Li, A. 2024. Research One.', 12, 100), line('Journal pages 1-8.',12,113), line('[12] Zhang, A. et al. 2025. Research Two.',12,160)]);
  assert.equal(refs.length, 2); assert.match(refs[0].text, /Journal pages/);
  assert.equal(findReferences('[12]', refs)[0].title, 'Research Two');
  assert.equal(findReferences('(Zhang et al., 2025)', refs)[0].number, 12);
  assert.equal(findReferences('[1]', refs, {page:12,y:160})[0].number, 12);
});
test('figures, tables and equations resolve caption regions', () => {
  for (const text of ['Figure 3','Fig. 3','图 3']) assert.deepEqual(figureReference(text), {kind:'figure',number:'3'});
  assert.equal(figureReference('Table 2').kind, 'table'); assert.equal(figureReference('表 2').kind,'table');
  assert.equal(figureReference('Eq. (4)').kind,'equation');
  const targets=figureTargets([line('See Figure 3'),line('Figure 3: Result',3,400),line('Table 2: Values',4,100)],Array(5).fill(842));
  assert.equal(targets.length,2); assert.ok(targets[0].top<400); assert.equal(targets[1].top,100);
});
test('heuristic outline respects body size and section depth', () => {
  const headings=heuristicOutline([line('A paragraph'),line('Another paragraph'),line('1 Introduction',1,80,18),line('1.2.3 Method',2,80,14),line('References',12,70,16)]);
  assert.deepEqual(headings.map(h=>h.level),[1,3,1]);
});
test('history records precise position and drops forward branch after new jump', () => {
  let h=jumpHistory(initialHistory(),{page:1,offset:.123,x:12},{page:5,offset:.4});
  const back=moveHistory(h,{page:5,offset:.6},-1); assert.deepEqual(back.target,{page:1,offset:.123,x:12});
  assert.equal(moveHistory(back.history,back.target,1).target.offset,.6);
  h=jumpHistory(back.history,back.target,{page:8,offset:0}); assert.equal(h.entries.length,2); assert.equal(moveHistory(h,{page:8,offset:0},1).target,null);
});
test('100 page virtualization is bounded and compare mode clamps missing pages', () => {
  const tops=offsets(Array(100).fill(842),1);
  for(let y=0;y<80000;y+=300) assert.ok(visiblePages(tops,y,900).length<=5);
  assert.equal(correspondingPage(14,12),12); assert.equal(correspondingPage(3,14),3);
  assert.equal(anchoredScroll(200,100,1,2),500);
});
test('citations keep selected text, author, year and page; external URLs are restricted', () => {
  assert.equal(quoteReference(' original ', ['Alice Zhang','Bob Li'],'2025',8),'“original” (Zhang et al., 2025, p. 8)');
  assert.equal(quoteReference('word', [], '',2,'GBT entry'),'“word”\nGBT entry 第 2 页。');
  for(const url of ['javascript:alert(1)','file:///tmp/a','https://user:pass@example.org']) assert.equal(externalLink(url),null);
  assert.equal(externalLink('https://example.org'),'https://example.org/');
});

test('HiDPI keeps native density at ordinary zoom and bounds large canvases',()=>{
 assert.equal(rasterRatio(800,1000,2),2);
 const ratio=rasterRatio(2400,3400,3);assert.ok(2400*3400*ratio*ratio<=16000001);
});
