module.exports = async function handler(request, response) {
  const { proxyRequest } = await import("../shared/proxy.mjs");
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === "string") headers.set(name, value);
  }
  const method = String(request.method || "GET").toUpperCase();
  const url = new URL("/api/supabase-proxy", `https://${request.headers.host}`);
  url.searchParams.set("path", Array.isArray(request.query.path) ? request.query.path[0] : request.query.path || "");
  const body = request.body == null ? undefined
    : Buffer.isBuffer(request.body) || typeof request.body === "string" ? request.body : JSON.stringify(request.body);
  const upstream = await proxyRequest(new Request(url, {
    method, headers, body: method === "GET" ? undefined : body
  }), {
    supabaseUrl: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    ip: request.socket?.remoteAddress || "unknown"
  });
  upstream.headers.forEach((value, name) => response.setHeader(name, value));
  response.status(upstream.status);
  if (upstream.body) {
    const { Readable } = await import("node:stream");
    const { pipeline } = await import("node:stream/promises");
    await pipeline(Readable.fromWeb(upstream.body), response);
  } else response.end();
};
