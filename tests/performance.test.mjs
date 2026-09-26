import test from "node:test";
import assert from "node:assert/strict";
import "../performance.js";
const { cycle, cycleMonth, summarize, normalize } = globalThis.TLPerformance;
const project = (id, date, publication, completed = true) => ({ id, name: `拜托了闻学长 & ${id}`, milestones: { "发布": date }, completedMilestones: { "发布": completed }, publication });
const both = { douyin: { count: 1 }, xiaohongshu: { count: 1 } };

test("custom profiles match names, honor explicit selection and avoid ambiguous rates", () => {
  const config = TLPerformance.profiles([{id:"custom",name:"测试账号",keywords:"别名",rates:{douyin:10000,xiaohongshu:""}}]);
  const p = {...project("p","2026-06-01",both),name:"别名 & 产品"};
  assert.equal(TLPerformance.account(p,config),"custom");
  assert.equal(summarize([p],cycle("2026-06"),"2026-09-13",config).commission,500);
  assert.equal(summarize([{...p,publicationGift:true}],cycle("2026-06"),"2026-09-13",config).commission,0);
  assert.equal(TLPerformance.account(p,[...config,{...config[0],id:"second"}]),"other");
  assert.equal(summarize([{...p,publicationAccount:"deleted"}],cycle("2026-06"),"2026-09-13",config).commission,0);
  assert.equal(summarize([p],cycle("2026-06"),"2026-09-13",[]).commission,0);
});

test("15th cycles are disjoint and commission offset crosses years", () => {
  assert.deepEqual(cycle("2027-01"), { start: "2026-12-16", end: "2027-01-16", last: "2027-01-15" });
  assert.equal(cycle("2026-02", -3).start, "2025-10-16");
  assert.equal(cycle("2026-01").end, cycle("2026-02").start);
  assert.throws(() => cycle("2026-13"));
});
test("the active performance month changes after the 15th and across years", () => {
  assert.equal(cycleMonth("2026-09-15"), "2026-09");
  assert.equal(cycleMonth("2026-09-16"), "2026-10");
  assert.equal(cycleMonth("2026-12-31"), "2027-01");
  assert.throws(() => cycleMonth("2026-02-30"));
});
test("completed platform publications count at the boundaries with exact commission", () => {
  const rows = [project("before", "2026-05-15", both), project("start", "2026-05-16", both), project("last", "2026-06-15", { douyin: { count: 2 } }), project("next", "2026-06-16", both), project("pending", "2026-06-10", both, false)];
  const result = summarize(rows, cycle("2026-09", -3), "2026-09-13");
  assert.equal(result.total, 4);
  assert.equal(result.projects, 2);
  assert.equal(result.counts.douyin, 3);
  assert.equal(result.counts.xiaohongshu, 1);
  assert.equal(result.commission, 9100);
});
test("project publication date is authoritative even for legacy platform dates", () => {
  const p = project("split", "2026-05-20", { douyin: { count: 1, date: "2026-06-16" }, xiaohongshu: { count: 1, date: "2026-06-15" } });
  assert.equal(summarize([p], cycle("2026-06"), "2026-07-20").commission, 3700);
  assert.equal(summarize([p], cycle("2026-07"), "2026-06-15").total, 0);
  p.milestones["发布"] = "2026-06-16";
  assert.equal(summarize([p], cycle("2026-06"), "2026-07-20").total, 0);
  assert.equal(summarize([p], cycle("2026-07"), "2026-06-15").total, 2);
});
test("an explicitly completed publication counts even when its scheduled date is ahead of today", () => {
  const completed = project("future-complete", "2026-10-05", { douyin: { count: 1 } });
  const pending = project("future-pending", "2026-10-06", { xiaohongshu: { count: 1 } }, false);
  const missingPlatform = project("future-missing", "2026-10-07", undefined, true);
  const result = summarize([completed, pending, missingPlatform], cycle("2026-10"), "2026-09-26");
  assert.equal(result.total, 1);
  assert.equal(result.counts.douyin, 1);
  assert.equal(result.projects, 1);
  assert.deepEqual(result.missing.map((item) => item.id), ["future-missing"]);
});
test("other accounts count publications but never inherit Wen's commission rates", () => {
  assert.equal(globalThis.TLPerformance.account({name:"拜托了闻学长TCL"}),"wen");
  const wen = project("wen", "2026-06-10", both);
  const other = {...project("other", "2026-06-10", both), name:"拾光备忘录 & 合作"};
  const result = summarize([wen,other], cycle("2026-06"), "2026-09-13");
  assert.equal(result.total,4);
  assert.equal(result.commission,3700);
  assert.deepEqual(result.commissionCounts,{douyin:1,xiaohongshu:1});
  wen.publicationAccount="other";
  assert.equal(summarize([wen],cycle("2026-06"),"2026-09-13").commission,0);
  other.publicationAccount="wen";
  assert.equal(summarize([other],cycle("2026-06"),"2026-09-13").commission,3700);
});
test("legacy records stay unclassified and malformed counts cannot inflate estimates", () => {
  const result = summarize([project("legacy", "2026-06-10")], cycle("2026-06"), "2026-09-13");
  assert.equal(result.missing.length, 1);
  assert.equal(result.commission, 0);
  assert.equal(normalize({ douyin: { count: -2 }, xiaohongshu: { count: 1.5, date: "2026-02-30" } }).xiaohongshu.date, "");
  assert.equal(normalize({ douyin: { count: -2 } }).douyin.count, 0);
});
test("gifted projects keep publication counts but contribute no commission", () => {
  const p = {...project("gift", "2026-06-15", both), publicationGift:true};
  const result = summarize([p],cycle("2026-06"),"2026-09-13");
  assert.equal(result.total,2);
  assert.equal(result.commission,0);
  assert.deepEqual(result.commissionCounts,{douyin:0,xiaohongshu:0});
  assert.ok(result.rows.every(row=>row.gifted));
  p.publicationGift=false;
  assert.equal(summarize([p],cycle("2026-06"),"2026-09-13").commission,3700);
});
