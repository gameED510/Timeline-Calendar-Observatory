import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('shoot cards stay in front without changing the source or same-stage order', async()=>{
  const source=await readFile(new URL('../calendar-motion.js',import.meta.url),'utf8');
  const definition=source.match(/function orderPileItems\(items\) \{[\s\S]*?\n  \}/)[0];
  const order=vm.runInNewContext(`(${definition})`);
  const items=[{id:1,stage:'拍摄'},{id:2,stage:'脚本'},{id:3,stage:'拍摄',completed:true},{id:4,stage:'发布'}];
  assert.equal(Array.from(order(items),e=>e.id).join(','),'2,4,1,3');
  assert.equal(items.map(e=>e.id).join(','),'1,2,3,4');
  assert.equal(order([items[0]])[0],items[0]);
  assert.equal(order([]).length,0);
});

test('spring overshoots and settles with zero endpoint velocity', async()=>{
  const source=await readFile(new URL('../calendar-motion.js',import.meta.url),'utf8');
  const definition=source.match(/function springEase\(t\) \{[\s\S]*?\n  \}/)[0];
  const ease=vm.runInNewContext(`(${definition})`);
  assert.equal(ease(0),0);assert.equal(ease(1),1);
  const h=1e-6;
  assert.ok(Math.abs(ease(h)/h)<.001);
  assert.ok(Math.abs((1-ease(1-h))/h)<.001);
  const peak=Math.max(...Array.from({length:1001},(_,i)=>ease(i/1000)));
  assert.ok(peak>1.03&&peak<1.1);
});
