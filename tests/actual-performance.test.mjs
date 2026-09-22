import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../performance.js';
import { readFileSync } from 'node:fs';
const p = globalThis.TLPerformance;
test('chart windows retain missing months and distinguish zero from absent totals',()=>{
  const points=p.chartPoints([
    {month:'2025-12',total:0,snapshot:{formula:100}},
    {month:'2026-01',total:null,snapshot:{formula:200}},
    {month:'2026-03',total:300,snapshot:{formula:300}}
  ],'2026-02',3);
  assert.deepEqual(points.map(r=>r.month),['2025-12','2026-01','2026-02']);
  assert.equal(points[0].total,0);
  assert.equal(points[1].total,null);
  assert.equal(points[1].snapshot,null);
  assert.equal(points[2].total,null);
});
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
test('calibration takes at most six prior valid months',()=>{
  const records=Array.from({length:8},(_,i)=>({month:`2026-${String(i+1).padStart(2,'0')}`,total:100,snapshot:{formula:200}}));
  const result=p.calibration(records,'2026-09');
  assert.equal(result.n,6);assert.ok(Math.abs(result.factor-2/3)<1e-12);
  assert.deepEqual(result.months,['2026-08','2026-07','2026-06','2026-05','2026-04','2026-03']);
});
test('manual settlement modules ship without screenshot recognition',()=>{
  for(const path of ['index.html','sw.js','scripts/build-edgeone.mjs','scripts/build-netlify.mjs','scripts/prepare-static.mjs']) {
    const text=readFileSync(new URL('../'+path,import.meta.url),'utf8');
    for(const file of ['actual-performance.js','performance-charts.js'])assert.ok(text.includes(file));
  }
  const shell=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  assert.ok(!shell.includes('traineddata'));
  const ui=readFileSync(new URL('../actual-performance.js',import.meta.url),'utf8');
  assert.doesNotMatch(ui,/actualFiles|recognize|type="file"/);
  assert.match(ui,/个人总提成/);
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
