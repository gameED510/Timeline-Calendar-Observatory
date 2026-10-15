import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import '../performance.js';
const source=readFileSync(new URL('../platform-marks.js',import.meta.url),'utf8');
const window={TLPerformance:globalThis.TLPerformance};
vm.runInNewContext(source,{window});
test('platform marks use explicit normalized publication settings, not names or completion',()=>{
  const list=p=>Array.from(window.TLPlatformMarks.platforms(p));
  assert.deepEqual(list({name:'抖音 & 小红书'}),[]);
  assert.deepEqual(list({publication:{douyin:{count:1}}}),['douyin']);
  assert.deepEqual(list({publication:{xiaohongshu:{count:1},douyin:{count:1}},completedMilestones:{'发布':true}}),['douyin','xiaohongshu']);
  assert.deepEqual(list({publication:{douyin:{count:-1},xiaohongshu:{count:0}}}),[]);
});
test('platform assets ship locally in offline shell and both build targets',()=>{
  for(const file of ['index.html','sw.js','scripts/build-edgeone.mjs','scripts/build-netlify.mjs','scripts/prepare-static.mjs']){
    assert.match(readFileSync(new URL('../'+file,import.meta.url),'utf8'),/platform-marks\.js/);
  }
  assert.doesNotMatch(source,/fetch\(|innerHTML/);
  assert.match(source,/aria-label/);
  assert.match(source,/mark.title/);
});
