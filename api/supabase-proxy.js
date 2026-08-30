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

function getRequestBody(request) {
  if (request.body == null) return undefined;
  if (Buffer.isBuffer(request.body) || typeof request.body === "string") return request.body;
  return JSON.stringify(request.body);
}

function getClientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  return (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : request.socket?.remoteAddress) || "unknown";
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

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  const method = String(request.method || "GET").toUpperCase();
  const path = Array.isArray(request.query.path) ? request.query.path[0] : request.query.path;
  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY || "";

  if (!supabaseUrl || !anonKey) {
    return response.status(503).json({ message: "云同步服务尚未配置" });
  }

  if (request.headers["x-tl-calendar-proxy"] !== "1") {
    return response.status(403).json({ message: "请求来源无效" });
  }

  const fetchSite = request.headers["sec-fetch-site"];
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) {
    return response.status(403).json({ message: "请求来源无效" });
  }

  const origin = request.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.host) {
        return response.status(403).json({ message: "请求来源无效" });
      }
    } catch {
      return response.status(403).json({ message: "请求来源无效" });
    }
  }

  if (!ALLOWED_METHODS.has(method) || typeof path !== "string" || !ALLOWED_PATH.test(path)) {
    return response.status(400).json({ message: "不支持的云服务请求" });
  }
  if (Number(request.headers["content-length"] || 0) > MAX_BODY_BYTES) {
    return response.status(413).json({ message: "请求内容过大" });
  }
  if (isRateLimited(request, path)) {
    return response.status(429).json({ message: "请求过于频繁，请稍后再试" });
  }

  const headers = new Headers();
  FORWARDED_REQUEST_HEADERS.forEach((name) => {
    const value = request.headers[name];
    if (typeof value === "string") headers.set(name, value);
  });
  headers.set("apikey", anonKey);

  try {
    const upstream = await fetch(`${supabaseUrl}${path}`, {
      method,
      headers,
      body: method === "GET" ? undefined : getRequestBody(request),
      redirect: "manual",
      signal: AbortSignal.timeout(15_000)
    });

    FORWARDED_RESPONSE_HEADERS.forEach((name) => {
      const value = upstream.headers.get(name);
      if (value) response.setHeader(name, value);
    });

    const body = Buffer.from(await upstream.arrayBuffer());
    return response.status(upstream.status).send(body);
  } catch (error) {
    console.error("Supabase proxy unavailable", error);
    if (error?.cause?.code === "ENOTFOUND") {
      return response.status(502).json({
        code: "SUPABASE_PROJECT_UNAVAILABLE",
        message: "云数据库地址已失效，请检查 Supabase 项目是否已暂停或删除"
      });
    }
    return response.status(502).json({ message: "云服务暂时无法连接，请稍后重试" });
  }
};
