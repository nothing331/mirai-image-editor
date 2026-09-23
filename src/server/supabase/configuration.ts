export interface PublicSupabaseConfiguration {
  url: string;
  publishableKey: string;
}

export interface AdminSupabaseConfiguration extends PublicSupabaseConfiguration {
  secretKey: string;
}

export function readPublicSupabaseConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): PublicSupabaseConfiguration {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) throw new Error("Supabase public configuration is unavailable.");
  return { url, publishableKey };
}

export function readAdminSupabaseConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AdminSupabaseConfiguration {
  const publicConfiguration = readPublicSupabaseConfiguration(environment);
  const secretKey = environment.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) throw new Error("Supabase server configuration is unavailable.");
  return { ...publicConfiguration, secretKey };
}
