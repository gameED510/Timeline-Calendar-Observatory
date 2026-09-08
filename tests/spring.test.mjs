import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

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
