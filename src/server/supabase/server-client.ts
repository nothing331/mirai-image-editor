import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { readPublicSupabaseConfiguration } from "./configuration";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = readPublicSupabaseConfiguration();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; the request Proxy owns refresh writes.
        }
      },
    },
  });
}
