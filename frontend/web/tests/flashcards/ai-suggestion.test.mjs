import test from 'node:test';
import assert from 'node:assert/strict';
import { cardQuestion, cardSuggestion } from '../../src/features/flashcards/domain/ai-suggestion.ts';
test('AI card suggestions accept bounded JSON fields, without executing markup or guessing prose',()=>{
 assert.deepEqual(cardSuggestion('```json\n{"front":"问题","back":"答案"}\n```'),{front:'问题',back:'答案'});
 for(const value of ['plain answer','{"front":"","back":"a"}','{"front":{},"back":"a"}'])assert.equal(cardSuggestion(value),null);
 assert.equal(cardSuggestion(JSON.stringify({front:'a'.repeat(10001),back:'b'})),null);
 assert.match(cardQuestion('cloze'),/\[▢\]/);
 assert.match(cardQuestion('term'),/术语/);
});
