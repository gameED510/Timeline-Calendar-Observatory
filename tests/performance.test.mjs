import test from "node:test";
import assert from "node:assert/strict";
import "../performance.js";
const { cycle, summarize, normalize } = globalThis.TLPerformance;
const project = (id, date, publication, completed = true) => ({ id, name: id, milestones: { "发布": date }, completedMilestones: { "发布": completed }, publication });
const both = { douyin: { count: 1 }, xiaohongshu: { count: 1 } };

test("15th cycles are disjoint and commission offset crosses years", () => {
  assert.deepEqual(cycle("2027-01"), { start: "2026-12-16", end: "2027-01-16", last: "2027-01-15" });
  assert.equal(cycle("2026-02", -3).start, "2025-10-16");
  assert.equal(cycle("2026-01").end, cycle("2026-02").start);
  assert.throws(() => cycle("2026-13"));
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
test("actual platform dates override schedule and future publications are excluded", () => {
  const p = project("split", "2026-05-20", { douyin: { count: 1, date: "2026-06-16" }, xiaohongshu: { count: 1, date: "2026-06-15" } });
  assert.equal(summarize([p], cycle("2026-06"), "2026-07-20").commission, 1000);
  assert.equal(summarize([p], cycle("2026-07"), "2026-06-15").total, 0);
});
test("legacy records stay unclassified and malformed counts cannot inflate estimates", () => {
  const result = summarize([project("legacy", "2026-06-10")], cycle("2026-06"), "2026-09-13");
  assert.equal(result.missing.length, 1);
  assert.equal(result.commission, 0);
  assert.equal(normalize({ douyin: { count: -2 }, xiaohongshu: { count: 1.5, date: "2026-02-30" } }).xiaohongshu.date, "");
  assert.equal(normalize({ douyin: { count: -2 } }).douyin.count, 0);
});
