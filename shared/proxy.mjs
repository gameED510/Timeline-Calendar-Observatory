const MAX_BODY_BYTES = 2 * 1024 * 1024;
const rateBuckets = new Map();
const requestHeaders = ["accept", "authorization", "content-type", "prefer", "range", "x-client-info", "x-supabase-api-version"];
const responseHeaders = ["content-location", "content-range", "content-type", "preference-applied", "range-unit", "x-supabase-api-version"];

function json(message, status) {
  return new Response(JSON.stringify({ message }), { status, headers: { "cache-control": "no-store", "content-type": "application/json" } });
}

export function isRateLimited(ip, path, now = Date.now()) {
  // Expire inactive clients and cap per-instance memory in long-lived workers.
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.startedAt >= 60000) rateBuckets.delete(key);
    else break;
  }
  const isAuth = path.startsWith("/auth/v1");
  const key = `${ip}:${isAuth ? "auth" : "data"}`;
  let bucket = rateBuckets.get(key);
  if (bucket && now - bucket.startedAt >= 60000) {
    rateBuckets.delete(key);
    bucket = null;
  }
  if (!bucket) {
    if (rateBuckets.size >= 5000) rateBuckets.delete(rateBuckets.keys().next().value);
    bucket = { startedAt: now, count: 0 };
    rateBuckets.set(key, bucket);
  }
  return ++bucket.count > (isAuth ? 40 : 240);
}

export async function readBody(request) {
  if (request.method === "GET" || !request.body) return undefined;
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError("Request body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function proxyRequest(request, { supabaseUrl, anonKey, ip = "unknown" }) {
  if (!supabaseUrl || !anonKey || supabaseUrl.includes("__SUPABASE")) return json("云同步服务尚未配置", 503);
  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "";
  if (request.headers.get("x-tl-calendar-proxy") !== "1") return json("请求来源无效", 403);
  const site = request.headers.get("sec-fetch-site");
  if (site && !["same-origin", "none"].includes(site)) return json("请求来源无效", 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return json("请求来源无效", 403);
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return json("不支持的云服务请求", 400);
  let target;
  try {
    target = new URL(path, supabaseUrl);
    if (target.origin !== new URL(supabaseUrl).origin || !/^\/(auth|rest)\/v1(?:\/|$)/.test(target.pathname)) {
      return json("不支持的云服务请求", 400);
    }
  } catch {
    return json("不支持的云服务请求", 400);
  }
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return json("请求内容过大", 413);
  if (isRateLimited(ip, target.pathname)) return json("请求过于频繁，请稍后再试", 429);
  const headers = new Headers({ apikey: anonKey });
  for (const name of requestHeaders) {
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const body = await readBody(request);
    const upstream = await fetch(target, {
      method: request.method, headers, body, redirect: "manual", signal: controller.signal
    });
    const forwarded = new Headers({ "cache-control": "no-store" });
    for (const name of responseHeaders) {
      if (upstream.headers.has(name)) forwarded.set(name, upstream.headers.get(name));
    }
    return new Response(upstream.body, { status: upstream.status, headers: forwarded });
  } catch (error) {
    if (error instanceof RangeError) return json("请求内容过大", 413);
    return json("云服务暂时无法连接，请稍后重试", 502);
  } finally {
    clearTimeout(timeout);
  }
}
