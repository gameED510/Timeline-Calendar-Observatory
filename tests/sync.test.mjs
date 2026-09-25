import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8").split("\nupdateThemeControls();")[0];
function app() {
  const storage = new Map();
  const delays = [];
  const context = vm.createContext({
    console, URL, Date, AbortController, TLActualUI: { reset() {} }, navigator: { onLine: true },
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    document: { querySelector: () => null, querySelectorAll: () => [], documentElement: { dataset: {} } },
    window: { matchMedia: () => ({ matches: false }), clearInterval() {}, clearTimeout() {}, setTimeout(fn, delay) { delays.push(delay); return delays.length; } }
  });
  const run = (code) => vm.runInContext(code, context);
  run(readFileSync(new URL("../performance.js", import.meta.url), "utf8"));
  run(source);
  run(`render = () => {}; renderSyncPanel = () => {}; showToast = () => {};
    projects = normalizeProjects([{id:"p",name:"测试项目",milestones:{"拍摄":"2026-09-06","发布":"2026-09-08"}}]);
    syncedProjects = {p:cloneProject(projects[0])}; projectSyncVersions = {p:1};
    dirtyProjectIds = new Set(); projectTombstones = {}; syncState.user = {id:"test"};
    activeAccountId = "test"; accountHydrated = true;`);
  return { run, context, storage, delays };
}

test("persistent project drafts survive memory reset and remain account scoped", () => {
  const {run}=app();
  assert.equal(run(`storeProjectDraft('test:p',{fields:[{name:'name',value:'草稿'}],color:'#123456'})`),true);
  run('projectDrafts.clear()');
  assert.equal(run(`readProjectDraft('test:p').fields[0].value`),'草稿');
  run(`activeAccountId='other'`);
  assert.equal(run(`readProjectDraft('test:p')`),null);
  run(`activeAccountId='test';discardProjectDraft('test:p')`);
  assert.equal(run(`readProjectDraft('test:p')`),null);
});

test("view preferences restore valid choices without sharing them across accounts", () => {
  const {run}=app();
  run(`calendarMode='week';projectFilter='done';projectSort='name';saveViewPreferences();
    calendarMode='month';projectFilter='active';projectSort='next';restoreViewPreferences()`);
  assert.equal(run('calendarMode'),'week');assert.equal(run('projectFilter'),'done');assert.equal(run('projectSort'),'name');
  run(`activeAccountId='other';projectFilter='active';projectSort='next';restoreViewPreferences()`);
  assert.equal(run('calendarMode'),'month');assert.equal(run('projectFilter'),'active');
  run(`localStorage.setItem('tl-view:other','{"calendarMode":"bad","projectSort":"bad"}');restoreViewPreferences()`);
  assert.equal(run('projectSort'),'next');
});

test("desktop navigation keeps mobile navigation state ready for viewport changes", () => {
  const {run}=app();
  run(`document.querySelector=()=>({scrollTop:0});
    requestAnimationFrame=fn=>fn();window.scrollTo=()=>{};
    elements.appShell={classList:{toggle(){}}};
    elements.views=Object.fromEntries(['calendar','projects','timeline','conflicts','performance'].map(key=>[key,{classList:{toggle(){}}}]));`);
  for(const view of ['performance','conflicts','timeline','projects','calendar']) {
    run(`switchView('${view}')`);
    assert.equal(run('mobilePage'),view==='calendar'?'plan':view);
  }
});

test("overview picks one earliest pending milestone per project without mutating input", () => {
  const {run}=app();
  run(`items=[
    {project:{id:'a'},stage:'发布',date:'2026-09-28',completed:false},
    {project:{id:'a'},stage:'拍摄',date:'2026-09-24',completed:false},
    {project:{id:'b'},stage:'发布',date:'2026-09-25',completed:false},
    {project:{id:'c'},stage:'发布',date:'2026-09-20',completed:true}];
    nextItems=nextDistinctProjectMilestones(items);`);
  assert.equal(run('nextItems.length'),2);
  assert.equal(run('nextItems[0].stage'),'拍摄');
  assert.equal(run('nextItems[1].project.id'),'b');
  assert.equal(run('items[0].date'),'2026-09-28');
  assert.equal(run('nextDistinctProjectMilestones(items,1).length'),1);
});

test("schedule risk names evidence instead of treating every dense date as high risk", () => {
  const {run}=app();
  assert.equal(run(`scheduleRisk('2026-09-25',[{stage:'脚本'},{stage:'初稿'},{stage:'发布'}],'2026-09-24').severe`),false);
  assert.equal(run(`scheduleRisk('2026-09-25',[{stage:'拍摄'},{stage:'拍摄'}],'2026-09-24').label`),'拍摄同日');
  assert.equal(run(`scheduleRisk('2026-09-23',[{stage:'发布'}],'2026-09-24').label`),'已逾期');
  assert.equal(run(`scheduleRisk('2026-09-25',[{stage:'拍摄'},{stage:'拍摄',completed:true}],'2026-09-24').severe`),false);
});

test("version refresh blocks open dialogs, pending uploads and offline state", () => {
  const {run}=app();
  assert.equal(run('updateRefreshBlocker()'), '');
  run('dirtyProjectIds.add("p")');
  assert.match(run('updateRefreshBlocker()'), /同步/);
  run('dirtyProjectIds.clear();syncState.saving=true');
  assert.match(run('updateRefreshBlocker()'), /同步/);
  run('syncState.saving=false;navigator.onLine=false');
  assert.match(run('updateRefreshBlocker()'), /离线/);
  run('navigator.onLine=true;document.querySelector=()=>({open:true})');
  assert.match(run('updateRefreshBlocker()'), /窗口/);
});

test("recovery comparison identifies additions, removals and changed fields without mutation", () => {
  const {run}=app();
  run(`saved=[cloneProject(projects[0]),cloneProject({...projects[0],id:'removed'})];
    projects[0].name='changed';projects.push(cloneProject({...projects[0],id:'added'}));
    compared=recoveryDifferences(saved,projects);`);
  assert.equal(run('compared.length'),3);
  assert.equal(run(`compared.find(row=>row.id==='p').fields[0].label`),'名称');
  assert.equal(run(`compared.find(row=>row.id==='removed').kind`),'仅恢复点存在');
  assert.equal(run(`compared.find(row=>row.id==='added').kind`),'仅当前存在');
  assert.equal(run('saved[0].name'),'测试项目');
});

test("restoring either source stops when protective local backup fails", async () => {
  const {run}=app();
  run(`canEditProjects=()=>true;window.confirm=()=>true;createLocalRecoveryPoint=()=>null;
    getLocalRecoveryPoints=()=>[{id:'point',projects:[]}];
    originalProjects=JSON.stringify(projects);rpcCalled=false;
    syncState.client={rpc:()=>{rpcCalled=true;throw Error('must not restore')}};`);
  run(`restoreLocalRecoveryPoint('point')`);
  await run(`restoreCloudSnapshot('snapshot')`);
  assert.equal(run('JSON.stringify(projects)===originalProjects'),true);
  assert.equal(run('rpcCalled'),false);
});

test("sync conflict never overwrites local edits if the recovery backup fails", () => {
  const {run}=app();
  run(`createLocalRecoveryPoint=()=>null;originalProjects=JSON.stringify(projects)`);
  assert.throws(()=>run(`resolveCloudConflict('p',projects[0],{project_id:'p',project:{...projects[0],name:'remote'},version:2})`),/备份失败/);
  assert.equal(run('JSON.stringify(projects)===originalProjects'),true);
});

test("cloud restoration rejects pending work and locks editing and background sync until settled", async () => {
  const {run,context}=app();
  run(`window.confirm=()=>true;rpcCalls=0;createLocalRecoveryPoint=()=>({id:'backup'});
    syncState.client={rpc:()=>{rpcCalls++;throw Error('unexpected')}};dirtyProjectIds.add('p');`);
  await run(`restoreCloudSnapshot('snapshot')`);
  assert.equal(run('rpcCalls'),0);
  let finish;
  const pending=new Promise(resolve=>{finish=resolve;});pending.abortSignal=()=>pending;
  context.pendingRestore=pending;
  run(`dirtyProjectIds.clear();syncState.client={rpc:()=>{rpcCalls++;return pendingRestore;}}`);
  const restore=run(`restoreCloudSnapshot('snapshot')`);
  assert.equal(run('syncState.restoring'),true);
  assert.equal(run('canEditProjects()'),false);
  await run('saveCloudProjects()');
  await run('loadCloudProjects()');
  assert.equal(run('rpcCalls'),1);
  assert.match(run('updateRefreshBlocker()'),/恢复/);
  finish({error:new Error('test failure')});
  await restore;
  assert.equal(run('syncState.restoring'),false);
  assert.equal(run('projects.length'),1);
});

test("successful restoration unlocks before history refresh and ignores late account errors", async () => {
  const {run,context}=app();
  let rejectHistory;
  context.historyPending=new Promise((resolve,reject)=>{rejectHistory=reject;});
  run(`window.confirm=()=>true;createLocalRecoveryPoint=()=>({id:'backup'});
    persistLocalProjects=()=>{};messages=[];showToast=message=>messages.push(message);
    renderRecoveryHistory=()=>historyPending;
    syncState.client={rpc:()=>({abortSignal:()=>Promise.resolve({data:[]})})};`);
  await run(`restoreCloudSnapshot('snapshot')`);
  assert.equal(run('syncState.restoring'),false);
  assert.equal(run('canEditProjects()'),true);
  assert.match(run('messages[0]'),/已恢复/);
  run('accountEpoch++');
  rejectHistory(new Error('late history failure'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(run('messages.length'),1);
});

test("project search matches short names, account and platform together", () => {
  const {run}=app();
  run(`projects[0].shortName='耳机';projects[0].publicationAccount='wen';projects[0].publication={douyin:{count:1}};
    projectFilter='all';projectSearchTerm='耳机 抖音';`);
  assert.equal(run('getVisibleProjects().length'),1);
  run(`projectSearchTerm='闻学长 耳机'`);
  assert.equal(run('getVisibleProjects().length'),1);
  run(`projectSearchTerm='耳机 小红书'`);
  assert.equal(run('getVisibleProjects().length'),0);
});

test("keyboard viewport only adjusts for an editor and ignores pinch zoom", () => {
  const {run}=app();
  assert.equal(run(`keyboardViewport({height:500,offsetTop:20,scale:1},844,false)`),null);
  assert.equal(run(`keyboardViewport({height:500,offsetTop:20,scale:2},844,true)`),null);
  assert.equal(run(`keyboardViewport({height:800,offsetTop:0,scale:1},844,true)`),null);
  assert.equal(run(`keyboardViewport({height:500,offsetTop:20,scale:1},844,true).height`),500);
  assert.equal(run(`keyboardViewport({height:500,offsetTop:20,scale:1},844,true).top`),20);
});

test("day rollover updates today without changing the viewed month or selection", () => {
  const {run}=app();
  run(`TODAY_ISO='2026-09-21';calendarMonthAnchor='2026-08-01';selectedCalendarDate='2026-08-15';`);
  assert.equal(run(`refreshCurrentDate(new Date(2026,8,22,1))`),true);
  assert.equal(run('TODAY_ISO'),'2026-09-22');
  assert.equal(run('calendarMonthAnchor'),'2026-08-01');
  assert.equal(run('selectedCalendarDate'),'2026-08-15');
  assert.equal(run(`refreshCurrentDate(new Date(2026,8,22,2))`),false);
});

test("sync summary distinguishes pending, uploading, offline and acknowledged data", () => {
  const { run }=app();
  assert.equal(run('projectSyncSummary().label'),'已同步');
  run("dirtyProjectIds.add('p')");
  assert.equal(run('projectSyncSummary().label'),'待同步');
  run('syncState.saving=true');
  assert.equal(run('projectSyncSummary().label'),'同步中');
  run('navigator.onLine=false');
  assert.equal(run('projectSyncSummary().label'),'离线');
});

test("project deletion undo restores once and never overwrites an existing project", () => {
  const { run } = app();
  run(`saveProjects=()=>markDirtyProjects();let undoDelete;showToast=(message,undo)=>{if(undo)undoDelete=undo;};
    removeProjectWithUndo(projects[0]);`);
  assert.equal(run('projects.length'),0);
  run('undoDelete();undoDelete();');
  assert.equal(run('projects.length'),1);
  run(`removeProjectWithUndo(projects[0]);projects.push({id:'p',name:'新内容'});undoDelete();`);
  assert.equal(run('projects[0].name'),'新内容');
});

test("project deletion undo is invalid after account transition", () => {
  const { run } = app();
  run(`saveProjects=()=>{};let undoDelete;showToast=(message,undo)=>{if(undo)undoDelete=undo;};
    removeProjectWithUndo(projects[0]);accountEpoch+=1;undoDelete();`);
  assert.equal(run('projects.length'),0);
});

test("recycle bin is persistent, account isolated, bounded and restores without overwriting", () => {
  const {run,storage}=app();
  run(`saveProjects=()=>{};renderRecoveryHistory=()=>{};recycleProject(projects[0]);projects=[]`);
  assert.ok(storage.has('tl-recycle:test'));
  run(`restoreRecycledProject('p')`);
  assert.equal(run('projects.length'),1);
  run(`projects[0].name='newer';restoreRecycledProject('p')`);
  assert.equal(run('projects[0].name'),'newer');
  run(`activeAccountId='other'`);
  assert.equal(run('recycledProjects().length'),0);
  run(`activeAccountId='test';for(let i=0;i<105;i++)recycleProject({...projects[0],id:'item-'+i})`);
  assert.equal(run('recycledProjects().length'),100);
  run(`localStorage.setItem('tl-recycle:test',JSON.stringify([{project:projects[0],deletedAt:Date.now()-31*86400000}]))`);
  assert.equal(run('recycledProjects().length'),0);
});

test("deletion stops when the recycle bin cannot persist the project", () => {
  const {run}=app();
  run(`localStorage.setItem=()=>{throw Error('full')};removeProjectWithUndo(projects[0])`);
  assert.equal(run('projects.length'),1);
});

test("import preview classifies all changes and rejects duplicate identifiers", () => {
  const { run } = app();
  assert.equal(run(`importChanges([{id:'new',name:'新项目',milestones:{}}],projects).map(r=>r.kind).join(',')`), '新增,移除');
  assert.equal(run(`importChanges(projects,projects)[0].kind`), '不变');
  assert.equal(run(`importChanges([{...projects[0],name:'修改'}],projects)[0].kind`), '更新');
  assert.throws(() => run(`importChanges([projects[0],projects[0]],projects)`), /重复/);
  assert.throws(() => run(`importChanges([{name:'缺少编号'}],projects)`), /编号/);
});

test("import cannot replace projects when recovery storage fails", async () => {
  const { run } = app();
  run(`elements.importFile={value:'backup'};previewProjectImport=async()=>true;createLocalRecoveryPoint=()=>null;
    let importMessage='';showToast=message=>{importMessage=message;};`);
  await run(`importProjects({size:100,text:async()=>JSON.stringify([{id:'new',name:'新项目',milestones:{'发布':'2026-09-22'}}])})`);
  assert.equal(run('projects[0].id'),'p');
  assert.match(run('importMessage'),/无法保存导入前备份/);
});

test("import rejects impossible dates before preview", async () => {
  const { run } = app();
  run(`elements.importFile={value:'backup'};let previewed=false;previewProjectImport=async()=>{previewed=true;return true;};`);
  await run(`importProjects({size:100,text:async()=>JSON.stringify([{id:'new',name:'新项目',milestones:{'发布':'2026-02-30'}}])})`);
  assert.equal(run('previewed'),false);
  assert.equal(run('projects[0].id'),'p');
});

test("publication metadata survives cloud round trips and marks edits dirty", () => {
  const { run } = app();
  run(`projects[0].publication = {douyin:{count:2,date:"2026-09-07"},xiaohongshu:{count:1,date:"2026-09-08"}};
    projects[0].publicationGift = true;
    projects[0].shortName = "测试简称";
    const sentPublication = cloneProject(projects[0]);
    applySyncedCloudRow({project_id:"p",project:sentPublication,version:2,deleted:false},projectFingerprint(sentPublication),false);`);
  assert.equal(run("projects[0].publication.douyin.count"), 2);
  assert.equal(run("projects[0].publicationGift"), true);
  assert.equal(run("projects[0].shortName"), "测试简称");
  assert.equal(run("projects[0].publication.xiaohongshu.date"), "2026-09-08");
  run("projects[0].publication.douyin.count = 3; markDirtyProjects();");
  assert.equal(run("dirtyProjectIds.has('p')"), true);
});

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
