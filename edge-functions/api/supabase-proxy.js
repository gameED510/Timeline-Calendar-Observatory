import { proxyRequest } from "../../shared/proxy.mjs";
import { FALLBACK_SUPABASE_URL, FALLBACK_SUPABASE_ANON_KEY } from "./_runtime-config.js";

export function onRequest(context) {
  return proxyRequest(context.request, {
    supabaseUrl: context.env.SUPABASE_URL || FALLBACK_SUPABASE_URL,
    anonKey: context.env.SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY,
    ip: context.request.headers.get("eo-connecting-ip") || "unknown"
  });
}

export default onRequest;
