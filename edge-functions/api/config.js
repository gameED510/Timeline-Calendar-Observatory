import {
  FALLBACK_SUPABASE_ANON_KEY,
  FALLBACK_SUPABASE_URL
} from "./_runtime-config.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff"
    }
  });
}

export default function onRequest(context) {
  return json({
    supabaseUrl: context.env.SUPABASE_URL || FALLBACK_SUPABASE_URL,
    supabaseAnonKey: context.env.SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY,
    supabaseProxyUrl: "/api/supabase-proxy"
  });
}
