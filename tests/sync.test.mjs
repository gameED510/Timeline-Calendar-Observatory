import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8").split("\nupdateThemeControls();")[0];
function app() {
  const storage = new Map();
  const delays = [];
  const context = vm.createContext({
    console, URL, Date, navigator: { onLine: true },
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    document: { querySelector: () => null, querySelectorAll: () => [], documentElement: { dataset: {} } },
    window: { matchMedia: () => ({ matches: false }), clearTimeout() {}, setTimeout(fn, delay) { delays.push(delay); return delays.length; } }
  });
  const run = (code) => vm.runInContext(code, context);
  run(source);
  run(`render = () => {}; renderSyncPanel = () => {}; showToast = () => {};
    projects = normalizeProjects([{id:"p",name:"测试项目",milestones:{"拍摄":"2026-09-06","发布":"2026-09-08"}}]);
    syncedProjects = {p:cloneProject(projects[0])}; projectSyncVersions = {p:1};
    dirtyProjectIds = new Set(); projectTombstones = {}; syncState.user = {id:"test"};`);
  return { run, context, storage, delays };
}

test("deletion during upload is not resurrected by the acknowledgement", () => {
  const { run } = app();
  run(`const sent = cloneProject(projects[0]); const fp = projectFingerprint(sent); projects = [];
    applySyncedCloudRow({project_id:"p",project:sent,version:2,deleted:false},fp,false); markDirtyProjects();`);
  assert.equal(run("projects.length"), 0);
  assert.equal(run("dirtyProjectIds.has('p')"), true);
  assert.equal(run("projectTombstones.p.version"), 2);
});

test("edits and recreation during an in-flight request keep the latest local state", () => {
  const { run } = app();
  run(`const sent = cloneProject(projects[0]); const fp = projectFingerprint(sent); projects[0].name = "最新修改";
    applySyncedCloudRow({project_id:"p",project:sent,version:2,deleted:false},fp,false);`);
  assert.equal(run("projects[0].name"), "最新修改");
  run(`applySyncedCloudRow({project_id:"p",project:sent,version:3,deleted:true},null,true);`);
  assert.equal(run("projects[0].name"), "最新修改");
  assert.equal(run("dirtyProjectIds.has('p')"), true);
});

test("snapshot failure persists the acknowledged version and retries only the snapshot", async () => {
  const { run, context, storage, delays } = app();
  const calls = [];
  let snapshotFails = true;
  context.rpc = async (name, payload) => {
    calls.push(name);
    return name === "sync_timeline_project"
      ? { data: { project_id: "p", project: payload.p_project, version: 2, deleted: false, status: "applied" } }
      : { error: snapshotFails ? Error("temporary failure") : null };
  };
  run("syncState.client = {rpc}; projects[0].name = 'updated';");
  await run("saveCloudProjects()");
  const persisted = JSON.parse(storage.get("tl-calendar-planner-v1"));
  assert.equal(persisted.sync.versions.p, 2);
  assert.equal(persisted.sync.snapshotPending, true);
  assert.equal(delays.at(-1), 2000);
  snapshotFails = false;
  await run("saveCloudProjects()");
  assert.equal(calls.filter((name) => name === "sync_timeline_project").length, 1);
  assert.equal(calls.filter((name) => name === "create_timeline_snapshot").length, 2);
  assert.equal(run("snapshotPending"), false);
});

test("unchanged cloud reads are single-flight and do not redraw the interface", async () => {
  const { run, context } = app();
  let finish;
  let queries = 0;
  const pending = new Promise((resolve) => { finish = resolve; });
  context.query = () => { queries++; return pending; };
  run(`let renders = 0; render = () => { renders++; };
    syncState.client = {from:()=>({select:()=>({eq:()=>({order:query})})})};`);
  const first = run("loadCloudProjects()");
  await run("loadCloudProjects()");
  finish({ data: [{ project_id: "p", project: run("cloneProject(projects[0])"), version: 1, deleted: false }] });
  await first;
  assert.equal(queries, 1);
  assert.equal(run("renders"), 0);
});

test("offline sync pauses; failed requests back off to at most one per minute", async () => {
  const { run, context, delays } = app();
  context.navigator.onLine = false;
  run("syncState.client = {}; queueCloudSave();");
  await run("saveCloudProjects()");
  assert.equal(delays.length, 0);
  context.navigator.onLine = true;
  run("syncRetryCount = 30; queueCloudSave();");
  assert.equal(delays.at(-1), 60000);
});

test("optional stages do not affect completion; project labels are escaped", () => {
  const { run } = app();
  assert.equal(run("isProjectComplete(projects[0])"), false);
  run('projects[0].completedMilestones = {"拍摄":true,"发布":true}');
  assert.equal(run("isProjectComplete(projects[0])"), true);
  assert.equal(run(`escapeHtml('<img src=x onerror="alert(1)">')`), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
});
