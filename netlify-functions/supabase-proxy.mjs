import {
  FALLBACK_SUPABASE_ANON_KEY,
  FALLBACK_SUPABASE_URL
} from "./_runtime-config.mjs";

const ALLOWED_PATH = /^\/(auth|rest)\/v1(?:\/|$)/;
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map();
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "apikey",
  "authorization",
  "content-type",
  "prefer",
  "range",
  "x-client-info",
  "x-supabase-api-version"
];
const FORWARDED_RESPONSE_HEADERS = [
  "content-location",
  "content-range",
  "content-type",
  "preference-applied",
  "range-unit",
  "x-supabase-api-version"
];

function json(data, status) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" }
  });
}

function getClientIp(request) {
  return request.headers.get("x-nf-client-connection-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

function isRateLimited(request, path) {
  const now = Date.now();
  const key = `${getClientIp(request)}:${path.startsWith("/auth/v1") ? "auth" : "data"}`;
  const limit = path.startsWith("/auth/v1") ? 40 : 240;
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

export default async function handler(request) {
  const method = request.method.toUpperCase();
  const requestUrl = new URL(request.url);
  const path = requestUrl.searchParams.get("path") || "";
  const supabaseUrl = String(
    process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL
  ).replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return json({ message: "云同步服务尚未配置" }, 503);
  }
  if (request.headers.get("x-tl-calendar-proxy") !== "1") {
    return json({ message: "请求来源无效" }, 403);
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) {
    return json({ message: "请求来源无效" }, 403);
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== requestUrl.host) {
        return json({ message: "请求来源无效" }, 403);
      }
    } catch {
      return json({ message: "请求来源无效" }, 403);
    }
  }

  if (!ALLOWED_METHODS.has(method) || !ALLOWED_PATH.test(path)) {
    return json({ message: "不支持的云服务请求" }, 400);
  }
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
    return json({ message: "请求内容过大" }, 413);
  }
  if (isRateLimited(request, path)) {
    return json({ message: "请求过于频繁，请稍后再试" }, 429);
  }

  const headers = new Headers();
  FORWARDED_REQUEST_HEADERS.forEach((name) => {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  });
  headers.set("apikey", anonKey);

  try {
    const upstream = await fetch(`${supabaseUrl}${path}`, {
      method,
      headers,
      body: method === "GET" ? undefined : request.body,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000)
    });
    const responseHeaders = new Headers({ "cache-control": "no-store" });
    FORWARDED_RESPONSE_HEADERS.forEach((name) => {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders
    });
  } catch (error) {
    console.error("Supabase proxy unavailable", error);
    return json({ message: "云服务暂时无法连接，请稍后重试" }, 502);
  }
}

export const config = { path: "/api/supabase-proxy" };
