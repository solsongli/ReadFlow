import test from 'node:test';
import assert from 'node:assert/strict';
import { imageRegions, multiply } from '../../src/features/paper-reader/domain/image-regions.ts';
const ops={save:1,restore:2,transform:3,paintImageXObject:4,paintInlineImageXObject:5,
  paintFormXObjectBegin:6,paintFormXObjectEnd:7,paintImageXObjectRepeat:8};
test('image regions follow nested transform, save/restore, viewport rotation and forms',()=>{
  const result=imageRegions({fnArray:[1,3,4,2,6,5,7,4],argsArray:[[],[100,0,0,50,20,30],[],[],[[0,1,-1,0,60,10]],[],[],[]]},ops,[1,0,0,-1,0,200]);
  assert.deepEqual(result[0],[{x:20,y:170},{x:120,y:170},{x:120,y:120},{x:20,y:120}]);
  assert.deepEqual(result[1][0],{x:60,y:190});
  assert.deepEqual(result[2][0],{x:0,y:200});
  assert.deepEqual(multiply([2,0,0,2,1,3],[1,0,0,1,10,20]),[2,0,0,2,21,43]);
});
test('repeat image operators preserve all placements and text/vector operations do not become images',()=>{
 const result=imageRegions({fnArray:[99,8],argsArray:[[],['image',20,30,[5,10,100,150]]]},ops,[1,0,0,1,0,0]);
 assert.equal(result.length,2);assert.deepEqual(result[1][2],{x:120,y:180});
});
