import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../performance.js';
import '../actual-import.js';
import { readFileSync } from 'node:fs';
const p = globalThis.TLPerformance;
test('settlement uses natural publication month delayed three months', () => {
  assert.deepEqual(p.naturalMonth('2026-07', -3), {start:'2026-04-01',end:'2026-05-01',last:'2026-04-30'});
  assert.equal(p.naturalMonth('2026-01', -3).start, '2025-10-01');
  assert.equal(p.cycle('2026-07').start, '2026-06-16');
});
test('per-account formulas preserve defaults and support custom or zero ratios', () => {
  const config=[{id:'a',name:'A',keywords:'A',rates:{douyin:10000},revenueShare:.7,commissionRate:.2}];
  const project={id:'p',name:'A',milestones:{'发布':'2026-04-01'},completedMilestones:{'发布':true},publication:{douyin:{count:1}}};
  assert.equal(p.summarize([project],p.naturalMonth('2026-04'),'2026-09-01',config).commission,1400);
  assert.equal(p.profiles()[0].commissionRate,.1);
  config[0].commissionRate=0;
  assert.equal(p.summarize([project],p.naturalMonth('2026-04'),'2026-09-01',config).commission,0);
  config[0].commissionRate=12;
  assert.equal(p.profiles(config)[0].commissionRate,.1);
});
test('only subsequent outcomes with stored predictions evaluate calibration', () => {
  const records=[{total:100,snapshot:{kind:'historical',formula:500,calibrated:100}},{total:150,snapshot:{kind:'forecast',formula:100,calibrated:140}}];
  assert.deepEqual(p.evaluate(records),{n:1,formulaMae:50,calibratedMae:10});
});
test('OCR months survive clipped days and explicit settlement month wins', () => {
  const o=globalThis.TLActualImport;
  assert.equal(o.parseBatch(['品牌 标准-原创 026-05-0 1000\n2000','个人提成\n0.1\n2 _ 200']).month,'2026-08');
  assert.equal(o.parseBatch(['结算月份 2026年8月\n发布日期 2026-04-30','个人提成\n0.1\n200']).month,'2026-08');
  assert.equal(o.parseBatch(['2026-04-30\n2026-05-01']).month,'');
  assert.equal(o.parseBatch(['个人提成\n0.1\n200']).month,'');
});
test('personal total is authoritative and revenue fallback uses account rate without splitting twice', () => {
  const o=globalThis.TLActualImport;
  const text='视频 笔记 示例广告 标准-原创 2026-04-30 1000\n7 2000';
  const config=[{id:'x',name:'X',rates:{},revenueShare:.5,commissionRate:.2}];
  assert.equal(o.parseBatch([text,'0.1\n200'],[],config).total,200);
  assert.equal(o.parseBatch([text],[],config).total,400);
  assert.equal(o.parseBatch([text],[],[...config,{id:'y',name:'Y',rates:{},commissionRate:.3}]).total,null);
});
test('calibration takes at most six prior valid months',()=>{
  const records=Array.from({length:8},(_,i)=>({month:`2026-${String(i+1).padStart(2,'0')}`,total:100,snapshot:{formula:200}}));
  const result=p.calibration(records,'2026-09');
  assert.equal(result.n,6);assert.ok(Math.abs(result.factor-2/3)<1e-12);
});
test('new browser modules ship in all deployment bundles; OCR stays lazy',()=>{
  for(const path of ['index.html','sw.js','scripts/build-edgeone.mjs','scripts/build-netlify.mjs','scripts/prepare-static.mjs']) {
    const text=readFileSync(new URL('../'+path,import.meta.url),'utf8');
    for(const file of ['actual-import.js','actual-performance.js','performance-charts.js'])assert.ok(text.includes(file));
  }
  const shell=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  assert.ok(!shell.includes('traineddata'));
  const ocr=readFileSync(new URL('../actual-import.js',import.meta.url),'utf8');
  assert.ok(ocr.includes('workerBlobURL: false'));
  assert.ok(!ocr.includes('https://'));
});
test('settlement writes enforce ownership, immutable snapshot and optimistic versions',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20260913090000_actual_performance.sql',import.meta.url),'utf8');
  assert.match(sql,/enable row level security/);
  assert.match(sql,/where user_id = auth.uid\(\) and month = p_month and version = p_expected_version/);
  assert.doesNotMatch(sql,/set[^;]+snapshot\s*=/);
  assert.match(sql,/revoke all on function/);
});
test('calibration excludes current/future months and zero baseline', () => {
  const rows = ['01','02','03'].map(m => ({month:`2026-${m}`,total:200,snapshot:{formula:100}}));
  rows.push({month:'2026-04',total:999,snapshot:{formula:1}});
  rows.push({month:'2025-12',total:999,snapshot:{formula:0}});
  const result = p.calibration(rows, '2026-04');
  assert.equal(result.n,3); assert.equal(result.factor,1.5); assert.equal(result.mae,100); assert.equal(result.bias,-100);
  assert.equal(p.calibration(rows,'2026-03').ready,false);
});
