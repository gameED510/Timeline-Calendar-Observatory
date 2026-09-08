import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("blank day selection preserves cards until collapse finishes", async () => {
  const app = await read('app.js');
  const handler = app.slice(app.indexOf('cell.addEventListener("click"'), app.indexOf('const head = document.createElement("div")', app.indexOf('cell.addEventListener("click"')));
  assert.match(handler, /renderCalendarDayDetails/);
  assert.doesNotMatch(handler, /render\(\)/);
  assert.match(await read('calendar-motion.js'), /onComplete: complete/);
  assert.match(await read('styles.css'), /has\(\.inline-pile\.closing\)/);
});

test("calendar motion is local, included in both builds and offline shell", async () => {
  for (const path of ["index.html", "sw.js", "scripts/build-netlify.mjs", "scripts/build-edgeone.mjs", "scripts/prepare-static.mjs"]) {
    assert.match(await read(path), /calendar-motion\.js/);
  }
  const motion = await read("calendar-motion.js");
  assert.doesNotMatch(motion, /localStorage|fetch\(/);
  assert.match(motion, /prefers-reduced-motion/);
  assert.match(motion, /pointercancel/);
  assert.match(motion, /layer !== owner/);
  assert.match(motion, /function mount/);
  assert.doesNotMatch(motion, /showPopover|document\.body\.append|role.*dialog/);
  assert.match(await read("app.js"), /items\.length >= 1/);
  assert.match(motion, /Flip\.from/);
  assert.doesNotMatch(motion, /pointerType==='mouse'\)open/);
});

test("browser dependencies are served locally", async () => {
  const [html, app] = await Promise.all([read("index.html"), read("app.js")]);

  assert.doesNotMatch(html, /unpkg\.com|cdn\.jsdelivr\.net/i);
  assert.match(html, /vendor\/lucide\.min\.js/);
  assert.match(app, /\.\/vendor\/supabase-client\.js/);
});

test("manual theme preference loads before the interface and stays local", async () => {
  const [html, theme, app] = await Promise.all([
    read("index.html"),
    read("theme.js"),
    read("app.js")
  ]);

  assert.match(html, /theme\.js\?v=1[\s\S]*styles\.css\?v=\d+/);
  assert.match(theme, /localStorage\.getItem\(key\)/);
  assert.match(theme, /document\.documentElement\.dataset\.theme/);
  assert.match(app, /localStorage\.setItem\(THEME_KEY, nextTheme\)/);
  assert.match(app, /aria-pressed/);
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
    assert.match(source, /shared\/proxy\.mjs/);
  }
  const shared = await read("shared/proxy.mjs");
  assert.match(shared, /MAX_BODY_BYTES/);
  assert.match(shared, /sec-fetch-site/i);
  assert.match(shared, /AbortSignal\.timeout/);
});

test("offline cache never stores API responses", async () => {
  const serviceWorker = await read("sw.js");

  assert.match(serviceWorker, /pathname\.includes\("\/api\/"\)/);
  assert.match(serviceWorker, /shellUrls\.has\(url\.href\)/);
  assert.match(serviceWorker, /if \(cached\) return cached/);
});
