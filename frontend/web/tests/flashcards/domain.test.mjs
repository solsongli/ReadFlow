import test from 'node:test';
import assert from 'node:assert/strict';
import { learningDay, schedule, reviewQueue, cloze, cardsCsv } from '../../src/features/flashcards/domain/model.js';
const fresh = { id: 'a', due: '0001-01-01', interval: 0, repetitions: 0, ease: 2.5, suspended: false };
test('local learning day rolls at 04:00, including year boundary', () => {
  assert.equal(learningDay(new Date(2026, 0, 1, 3, 59)), '2025-12-31');
  assert.equal(learningDay(new Date(2026, 0, 1, 4, 0)), '2026-01-01');
  assert.equal(learningDay(new Date(2026, 2, 9, 3, 30)), '2026-03-08');
});
test('SM-2 variant covers initial ratings, graduation, lapse, floor and upper bound', () => {
  assert.deepEqual([1,2,3,4].map(r => schedule(fresh,r).interval),[0,1,1,4]);
  const first = schedule(fresh, 3), second = schedule(first,3);
  assert.equal(second.interval,6);
  assert.equal(schedule(second,3).interval,15);
  assert.equal(schedule(second,1).repetitions,0);
  let state = fresh;
  for(let i=0;i<50;i++) state=schedule(state,2);
  assert.equal(state.ease,1.3);
  assert.equal(schedule({ interval: 36500, ease: 5, repetitions: 20 },4).interval,36500);
  assert.throws(()=>schedule(fresh,5));
});
test('daily limits count distinct introductions and do not suppress relearning',()=>{
  const cards=[fresh,{...fresh,id:'b'},{...fresh,id:'c',due:'2026-10-01'},{...fresh,id:'d',suspended:true}];
  assert.deepEqual(reviewQueue(cards,[],'2026-10-03',1,1).map(c=>c.id),['a','c']);
  const logs=[{card_id:'a',previous:JSON.stringify(fresh),rating:1}];
  assert.deepEqual(reviewQueue([{...fresh,due:'2026-10-03'},...cards.slice(1)],logs,'2026-10-03',1,0).map(c=>c.id),['a']);
});
test('cloze selection preserves surrounding text and CSV escapes quotes, newlines and formula cells',()=>{
  assert.equal(cloze('The policy is safe.',4,10),'The [▢] is safe.');
  assert.throws(()=>cloze('text',2,2));
  const csv=cardsCsv([{front:'=SUM(1)',back:'a"b\nnext',quote:'quote',item_title:'Paper',page:8}]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=SUM(1)"'));
  assert.ok(csv.includes('a""b\nnext'));
});
