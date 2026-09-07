import { proxyRequest } from "../shared/proxy.mjs";
import { FALLBACK_SUPABASE_URL, FALLBACK_SUPABASE_ANON_KEY } from "./_runtime-config.mjs";

export default function handler(request) {
  return proxyRequest(request, {
    supabaseUrl: process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY,
    ip: request.headers.get("x-nf-client-connection-ip") || "unknown"
  });
}

export const config = { path: "/api/supabase-proxy" };
