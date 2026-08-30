import {
  FALLBACK_SUPABASE_ANON_KEY,
  FALLBACK_SUPABASE_URL
} from "./_runtime-config.mjs";

export default async function handler() {
  return Response.json(
    {
      supabaseUrl: process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY,
      supabaseProxyUrl: "/api/supabase-proxy"
    },
    { headers: { "cache-control": "no-store" } }
  );
}

export const config = { path: "/api/config" };
