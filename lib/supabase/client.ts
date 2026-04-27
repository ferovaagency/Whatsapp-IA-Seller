import { createClient } from "@supabase/supabase-js";

function getUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

function getServiceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export function createSupabaseAdmin() {
  const url = getUrl();
  const key = getServiceKey();
  if (!url) throw new Error("SUPABASE_URL env var not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY env var not set");
  return createClient(url, key);
}

export const supabaseAdmin = {
  from: (table: string) => createSupabaseAdmin().from(table),
  rpc: (fn: string, params?: Record<string, unknown>) => createSupabaseAdmin().rpc(fn, params),
};
