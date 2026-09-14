import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";
import { readRuntimeEnvironment } from "@/server/config/runtime-environment";
import { createAdminSupabaseClient } from "@/server/supabase/admin-client";
import { createServerSupabaseClient } from "@/server/supabase/server-client";

const profileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  display_name: z.string().min(1).max(80),
  status: z.enum(["pending", "active", "revoked"]),
  account_role: z.enum(["member", "owner"]),
  onboarding_completed_at: z.string().nullable(),
});

const accessRequestSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "approved", "rejected", "revoked"]),
  requested_at: z.string(),
  decided_at: z.string().nullable(),
});

export type AccountProfile = z.infer<typeof profileSchema>;
export type AccountAccessRequest = z.infer<typeof accessRequestSchema>;

export interface AccountSnapshot {
  profile: AccountProfile;
  accessRequest: AccountAccessRequest | null;
  initialAiImageAllowance: number;
}

export type AccountRequirement = "authenticated" | "eligible" | "owner";

export class AccountAccessError extends Error {
  constructor(readonly reason: "unauthenticated" | "ineligible" | "revoked" | "owner-required" | "unavailable") {
    super(`Account access denied: ${reason}`);
    this.name = "AccountAccessError";
  }
}

export async function resolveCurrentAccount(
  client?: SupabaseClient,
): Promise<AccountSnapshot | null> {
  const supabase = client ?? await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const accountId = claimsData?.claims?.sub;
  if (claimsError || !accountId) return null;

  const [profileResult, requestResult, allowanceResult] = await Promise.all([
    supabase.from("profiles").select("id,email,display_name,status,account_role,onboarding_completed_at").eq("id", accountId).maybeSingle(),
    supabase.from("access_requests").select("id,status,requested_at,decided_at").eq("requester_id", accountId).maybeSingle(),
    supabase.from("account_allowance_grants").select("granted_quantity").eq("account_id", accountId).eq("allowance_key", "initial-ai-images").maybeSingle(),
  ]);

  if (profileResult.error || requestResult.error || allowanceResult.error || !profileResult.data) {
    throw new AccountAccessError("unavailable");
  }

  return {
    profile: profileSchema.parse(profileResult.data),
    accessRequest: requestResult.data ? accessRequestSchema.parse(requestResult.data) : null,
    initialAiImageAllowance: z.object({ granted_quantity: z.number().int().nonnegative() }).nullable().parse(allowanceResult.data)?.granted_quantity ?? 0,
  };
}

export async function requireAccount(
  requirement: AccountRequirement,
  client?: SupabaseClient,
): Promise<AccountSnapshot> {
  const account = await resolveCurrentAccount(client);
  if (!account) throw new AccountAccessError("unauthenticated");
  if (account.profile.status === "revoked") throw new AccountAccessError("revoked");
  if (requirement !== "authenticated" && account.profile.status !== "active") {
    throw new AccountAccessError("ineligible");
  }
  if (requirement === "owner" && account.profile.account_role !== "owner") {
    throw new AccountAccessError("owner-required");
  }
  return account;
}

export async function initializeAuthenticatedAccount(user: User): Promise<void> {
  if (!user.email) throw new AccountAccessError("unavailable");
  const admin = createAdminSupabaseClient();
  const displayName = readDisplayName(user);
  const { error: profileError } = await admin.from("profiles").upsert(
    { id: user.id, email: user.email.toLowerCase(), display_name: displayName },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (profileError) throw new AccountAccessError("unavailable");

  const environment = readRuntimeEnvironment();
  if (!environment.auth.ownerEmails.includes(user.email.toLowerCase())) return;
  const { error: ownerError } = await admin.rpc("mirai_bootstrap_owner", { target_account_id: user.id });
  if (ownerError) throw new AccountAccessError("unavailable");
}

function readDisplayName(user: User): string {
  const metadata = user.user_metadata;
  const proposed = typeof metadata.full_name === "string"
    ? metadata.full_name
    : typeof metadata.name === "string"
      ? metadata.name
      : user.email?.split("@")[0] ?? "Mirai user";
  const normalized = proposed.trim();
  return (normalized || "Mirai user").slice(0, 80);
}
