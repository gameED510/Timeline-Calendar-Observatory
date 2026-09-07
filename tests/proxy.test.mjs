import assert from "node:assert/strict";
import test from "node:test";
import { proxyRequest, isRateLimited } from "../shared/proxy.mjs";

const config = { supabaseUrl: "https://database.example", anonKey: "public-key", ip: "test" };
function request(path = "/rest/v1/timeline_projects", options = {}) {
  return new Request(`https://calendar.example/api/supabase-proxy?path=${encodeURIComponent(path)}`, {
    ...options, headers: { "x-tl-calendar-proxy": "1", ...options.headers }
  });
}

test("proxy forwards POST bytes and only approved headers", async (t) => {
  let forwarded;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    forwarded = { url, init };
    return new Response('{"ok":true}', { status: 201, headers: { "content-type": "application/json", "set-cookie": "private=1", "content-range": "0-1/2" } });
  });
  const result = await proxyRequest(request("/rest/v1/rpc/sync_timeline_project", {
    method: "POST", body: '{"name":"项目"}', headers: { authorization: "Bearer test", cookie: "private", "content-type": "application/json" }
  }), config);
  assert.equal(result.status, 201);
  assert.equal(new TextDecoder().decode(forwarded.init.body), '{"name":"项目"}');
  assert.equal(forwarded.init.headers.get("authorization"), "Bearer test");
  assert.equal(forwarded.init.headers.get("apikey"), "public-key");
  assert.equal(forwarded.init.headers.get("cookie"), null);
  assert.equal(result.headers.get("set-cookie"), null);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(result.headers.get("content-range"), "0-1/2");
  assert.deepEqual(await result.json(), { ok: true });
});

test("proxy rejects origin mismatch, traversal and external targets before fetch", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () => { throw Error("must not fetch"); });
  assert.equal((await proxyRequest(request(undefined, { headers: { origin: "https://evil.example" } }), config)).status, 403);
  assert.equal((await proxyRequest(request(undefined, { headers: { "sec-fetch-site": "cross-site" } }), config)).status, 403);
  for (const path of ["https://evil.example/rest/v1", "/rest/v1/../../admin", "/storage/v1", "//evil.example/auth/v1"]) {
    assert.equal((await proxyRequest(request(path), config)).status, 400);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("body limit works without Content-Length; upstream failures remain uncached", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () => { throw Error("private upstream detail"); });
  assert.equal((await proxyRequest(request(undefined, { method: "POST", body: "x".repeat(2 * 1024 * 1024 + 1) }), config)).status, 413);
  assert.equal(fetch.mock.callCount(), 0);
  const response = await proxyRequest(request(), config);
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /private upstream/);
});

test("rate limits isolate auth and data and reset after one minute", () => {
  for (let i = 0; i < 40; i++) assert.equal(isRateLimited("rate-test", "/auth/v1/token", 1000), false);
  assert.equal(isRateLimited("rate-test", "/auth/v1/token", 1000), true);
  assert.equal(isRateLimited("rate-test", "/rest/v1", 1000), false);
  assert.equal(isRateLimited("rate-test", "/auth/v1/token", 61000), false);
});
