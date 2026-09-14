import { createClient } from "@supabase/supabase-js";
import { readAdminSupabaseConfiguration } from "./configuration";

export function createAdminSupabaseClient() {
  const { url, secretKey } = readAdminSupabaseConfiguration();
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}
