import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8").split("\nupdateThemeControls();")[0];
function app() {
  const storage = new Map();
  const delays = [];
  const context = vm.createContext({
    console, URL, Date, AbortController, navigator: { onLine: true },
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    document: { querySelector: () => null, querySelectorAll: () => [], documentElement: { dataset: {} } },
    window: { matchMedia: () => ({ matches: false }), clearInterval() {}, clearTimeout() {}, setTimeout(fn, delay) { delays.push(delay); return delays.length; } }
  });
  const run = (code) => vm.runInContext(code, context);
  run(source);
  run(`render = () => {}; renderSyncPanel = () => {}; showToast = () => {};
    projects = normalizeProjects([{id:"p",name:"测试项目",milestones:{"拍摄":"2026-09-06","发布":"2026-09-08"}}]);
    syncedProjects = {p:cloneProject(projects[0])}; projectSyncVersions = {p:1};
    dirtyProjectIds = new Set(); projectTombstones = {}; syncState.user = {id:"test"};
    activeAccountId = "test"; accountHydrated = true;`);
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
  run("syncState.client = {rpc:(...args)=>{const p=rpc(...args); p.abortSignal=()=>p; return p;}}; projects[0].name = 'updated';");
  await run("saveCloudProjects()");
  const persisted = JSON.parse(storage.get("tl-calendar-planner-v1:test"));
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
  pending.abortSignal = () => pending;
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

function result(value) {
  const promise = Promise.resolve(value);
  promise.abortSignal = () => promise;
  return promise;
}

test("logout clears projects and aborts requests without exposing legacy local data", () => {
  const { run, storage } = app();
  storage.set("tl-calendar-planner-v1", JSON.stringify({ projects: [{ id: "legacy" }] }));
  run("const oldSignal = accountAbort.signal; changeCloudAccount(null);");
  assert.equal(run("oldSignal.aborted"), true);
  assert.equal(run("projects.length"), 0);
  assert.equal(run("loadLocalState().projects.length"), 0);
  assert.equal(run("accountHydrated"), false);
  assert.ok(storage.has("tl-calendar-planner-v1"));
  assert.ok(storage.has("tl-calendar-planner-recovery-v2:test"));
});

test("first login uses cloud rows only and never uploads local cached projects", async () => {
  const { run, context, storage } = app();
  const local = run("cloneProject(projects[0])");
  storage.set("tl-calendar-planner-v1:other", JSON.stringify({ projects: [local] }));
  const cloud = { ...local, id: "cloud", name: "当前账号云端项目" };
  context.query = () => result({ data: [{ project_id: "cloud", project: cloud, version: 8, deleted: false }] });
  run(`changeCloudAccount({id:'other'});
    syncState.client = {from:()=>({select:()=>({eq:()=>({order:query})})}),rpc:()=>{throw Error('unexpected write')}};`);
  assert.equal(run("projects.length"), 0);
  await run("loadCloudProjects()");
  assert.equal(run("projects.length"), 1);
  assert.equal(run("projects[0].id"), "cloud");
  assert.equal(run("dirtyProjectIds.size"), 0);
  assert.equal(run("accountHydrated"), true);
  assert.equal(run("getLocalRecoveryPoints().some(point => point.projects.some(project => project.id === 'p'))"), true);
});

test("empty cloud account stays empty and does not bootstrap local examples", async () => {
  const { run, context } = app();
  context.query = () => result({ data: [] });
  context.legacy = () => result({ data: null });
  run(`changeCloudAccount({id:'empty'});
    syncState.client = {from:()=>({select:()=>({eq:()=>({order:query,maybeSingle:legacy})})}),rpc:()=>{throw Error('unexpected bootstrap')}};`);
  await run("loadCloudProjects()");
  assert.equal(run("projects.length"), 0);
  assert.equal(run("accountHydrated"), true);
});

test("late cloud response cannot repopulate a signed-out or different account", async () => {
  const { run, context } = app();
  let finish;
  let signal;
  const pending = new Promise((resolve) => { finish = resolve; });
  pending.abortSignal = (value) => { signal = value; return pending; };
  context.query = () => pending;
  run("syncState.client = {from:()=>({select:()=>({eq:()=>({order:query})})})};");
  const loading = run("loadCloudProjects()");
  run("changeCloudAccount({id:'another'});");
  finish({ data: [{ project_id: "old", project: { id: "old", name: "private", milestones: {} }, version: 1 }] });
  await loading;
  assert.equal(signal.aborted, true);
  assert.equal(run("projects.length"), 0);
  assert.equal(run("accountHydrated"), false);
});

test("token renewal retains edits; conflict uses cloud and archives local without a duplicate", () => {
  const { run } = app();
  run("projects[0].name='本机修改'; changeCloudAccount({id:'test'});");
  assert.equal(run("projects[0].name"), "本机修改");
  run("resolveCloudConflict('p', projects[0], {project_id:'p', project:{...projects[0],name:'云端修改'},version:3,deleted:false});");
  assert.equal(run("projects.length"), 1);
  assert.equal(run("projects[0].name"), "云端修改");
  assert.equal(run("getLocalRecoveryPoints()[0].projects[0].name"), "本机修改");
});

test("logout during an upload prevents acknowledgement writes and snapshot requests", async () => {
  const { run, context, storage } = app();
  let finish;
  let signal;
  let calls = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  pending.abortSignal = value => { signal = value; return pending; };
  context.rpc = () => { calls++; return pending; };
  run("syncState.client={rpc}; projects[0].name='unsent edit';");
  const saving = run("saveCloudProjects()");
  run("changeCloudAccount(null)");
  finish({data:{project_id:'p',project:{id:'p',name:'old',milestones:{}},version:2,status:'applied'}});
  await saving;
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
  assert.equal(run("projects.length"), 0);
  assert.equal(storage.has("tl-calendar-planner-v1:null"), false);
  assert.equal(run("getLocalRecoveryPoints().length"), 0);
});
