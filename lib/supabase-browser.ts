import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
}

if (!supabaseAnonKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
}

/*
 * Isang browser client lamang ang gagamitin ng buong application.
 */
const browserSupabase: SupabaseClient = createBrowserClient(
  supabaseUrl,
  supabaseAnonKey
);

export function createClient(): SupabaseClient {
  return browserSupabase;
}