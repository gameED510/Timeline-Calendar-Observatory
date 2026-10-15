import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import '../performance.js';
const source=readFileSync(new URL('../platform-marks.js',import.meta.url),'utf8');
const window={TLPerformance:globalThis.TLPerformance};
const node=()=>({children:[],dataset:{},attributes:{},className:'',setAttribute(key,value){this.attributes[key]=value},append(child){this.children.push(child)}});
vm.runInNewContext(source,{window,document:{createElement:node,createElementNS:node}});
test('unset platforms show pending text and selected platforms show only logos',()=>{
  const pending=window.TLPlatformMarks.create({});
  assert.equal(pending.textContent,'平台待选');
  assert.match(pending.className,/platform-pending/);
  assert.equal(pending.children.length,0);
  const selected=window.TLPlatformMarks.create({publication:{douyin:{count:1}}});
  assert.equal(selected.children.length,1);
  assert.equal(selected.children[0].dataset.platform,'douyin');
  assert.equal(selected.textContent,undefined);
});
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
test('shooting cards inherit theme colors along with platform marks',()=>{
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const shoot=css.match(/\.motion-card\.shoot-highlight\s*\{([^}]+)\}/)[1];
  assert.match(shoot,/color: var\(--ink\)/);
  assert.match(shoot,/var\(--bg-soft\)/);
  assert.doesNotMatch(shoot,/color: #/);
  assert.match(css,/\.platform-marks\s*\{[^}]*color: inherit/);
});
