import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
function worker(fetch) {
  const handlers = {};
  const stored = new Map();
  const deleted = [];
  const cache = {
    match: async (key) => stored.get(typeof key === "string" ? key : key.url)?.clone(),
    put: async (key, response) => stored.set(typeof key === "string" ? key : key.url, response),
    addAll: async () => {}
  };
  vm.runInNewContext(source, {
    URL, Response, fetch,
    self: { location: new URL("https://calendar.example/sw.js"), addEventListener: (name, fn) => { handlers[name] = fn; }, clients: { claim() {} }, skipWaiting() {} },
    caches: { open: async () => cache, keys: async () => ["unrelated-cache", "tl-calendar-shell-v9", "tl-calendar-shell-v12"], delete: async (key) => deleted.push(key) }
  });
  return { stored, deleted, handlers, request(path, mode = "cors") {
    let response;
    handlers.fetch({ request: { url: `https://calendar.example${path}`, method: "GET", mode }, respondWith: (promise) => { response = promise; } });
    return response;
  } };
}

test("API and non-shell resources bypass the offline cache", () => {
  const sw = worker(() => { throw Error("must not fetch through worker"); });
  assert.equal(sw.request("/api/config"), undefined);
  assert.equal(sw.request("/api/supabase-proxy?path=/rest/v1"), undefined);
  assert.equal(sw.request("/private-export.json"), undefined);
});

test("cached versioned resources do not make redundant background requests", async () => {
  const sw = worker(() => { throw Error("must use cache"); });
  sw.stored.set("https://calendar.example/app.js?v=12", new Response("cached script"));
  assert.equal(await (await sw.request("/app.js?v=12")).text(), "cached script");
});

test("server errors never replace a usable offline page", async () => {
  const sw = worker(async () => new Response("unavailable", { status: 503 }));
  sw.stored.set("./index.html", new Response("offline page"));
  assert.equal(await (await sw.request("/", "navigate")).text(), "offline page");
  assert.equal(await sw.stored.get("./index.html").clone().text(), "offline page");
});

test("activation removes only this application's previous cache", async () => {
  const sw = worker(async () => new Response("ok"));
  let work;
  sw.handlers.activate({ waitUntil: (promise) => { work = promise; } });
  await work;
  assert.deepEqual(sw.deleted, ["tl-calendar-shell-v9"]);
});
