import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("browser dependencies are served locally", async () => {
  const [html, app] = await Promise.all([read("index.html"), read("app.js")]);

  assert.doesNotMatch(html, /unpkg\.com|cdn\.jsdelivr\.net/i);
  assert.match(html, /vendor\/lucide\.min\.js/);
  assert.match(app, /\.\/vendor\/supabase-client\.js/);
});

test("cloud sync uses project versions, snapshots, and authenticated RPC access", async () => {
  const [app, migration] = await Promise.all([
    read("app.js"),
    read("supabase/migrations/20260830143000_versioned_project_sync.sql")
  ]);

  for (const rpc of [
    "sync_timeline_project",
    "create_timeline_snapshot",
    "bootstrap_timeline_projects",
    "restore_timeline_snapshot"
  ]) {
    assert.match(app, new RegExp(rpc));
    assert.match(migration, new RegExp(`function public\\.${rpc}`));
  }

  assert.match(migration, /p_base_version bigint/i);
  assert.match(migration, /grant execute[\s\S]*to authenticated/i);
  assert.match(migration, /revoke all[\s\S]*from public, anon/i);
});

test("deployment proxies enforce request limits and timeouts", async () => {
  const proxyFiles = [
    "netlify-functions/supabase-proxy.mjs",
    "edge-functions/api/supabase-proxy.js",
    "api/supabase-proxy.js"
  ];

  for (const path of proxyFiles) {
    const source = await read(path);
    assert.match(source, /MAX_BODY_BYTES/);
    assert.match(source, /sec-fetch-site/i);
    assert.match(source, /AbortSignal\.timeout/);
  }
});

test("offline cache never stores API responses", async () => {
  const serviceWorker = await read("sw.js");

  assert.match(serviceWorker, /pathname\.includes\("\/api\/"\)/);
  assert.match(serviceWorker, /request\.mode === "navigate"[\s\S]*fetch\(request\)[\s\S]*caches\.match\("\.\/index\.html"\)/);
  assert.match(serviceWorker, /caches\.match\(request\)[\s\S]*const refresh = fetch\(request\)/);
});
