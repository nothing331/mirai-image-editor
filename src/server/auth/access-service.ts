import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createServerSupabaseClient } from "@/server/supabase/server-client";
import { requireAccount } from "./account";

export interface InvitationResult {
  invitationId: string;
  token: string;
  expiresAt: string;
}

export interface OwnerAccessOverview {
  profiles: Array<{
    id: string;
    email: string;
    displayName: string;
    status: "pending" | "active" | "revoked";
    role: "member" | "owner";
  }>;
  requests: Array<{
    id: string;
    requesterId: string;
    status: "pending" | "approved" | "rejected" | "revoked";
    requestedAt: string;
  }>;
  invitations: Array<{
    id: string;
    email: string;
    status: "pending" | "claimed" | "revoked";
    expiresAt: string;
  }>;
}

export async function requestAccess(client?: SupabaseClient): Promise<void> {
  const supabase = client ?? await createServerSupabaseClient();
  await requireAccount("authenticated", supabase);
  const { error } = await supabase.rpc("mirai_request_access");
  if (error) throw new Error("Access request could not be saved.");
}

export async function claimInvitation(token: string, client?: SupabaseClient): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invitation is invalid or expired.");
  const supabase = client ?? await createServerSupabaseClient();
  await requireAccount("authenticated", supabase);
  const { error } = await supabase.rpc("mirai_claim_invitation", { invite_token: token });
  if (error) throw new Error("Invitation is invalid or expired.");
}

export async function decideAccess(
  requestId: string,
  decision: "approve" | "reject",
  client?: SupabaseClient,
): Promise<void> {
  const parsedId = z.string().uuid().parse(requestId);
  const supabase = client ?? await createServerSupabaseClient();
  await requireAccount("owner", supabase);
  const { error } = await supabase.rpc("mirai_decide_access", { request_id: parsedId, decision });
  if (error) throw new Error("Access decision could not be saved.");
}

export async function revokeAccess(accountId: string, client?: SupabaseClient): Promise<void> {
  const parsedId = z.string().uuid().parse(accountId);
  const supabase = client ?? await createServerSupabaseClient();
  await requireAccount("owner", supabase);
  const { error } = await supabase.rpc("mirai_revoke_access", { target_account_id: parsedId });
  if (error) throw new Error("Account access could not be revoked.");
}

export async function createInvitation(email: string, client?: SupabaseClient): Promise<InvitationResult> {
  const normalizedEmail = z.string().trim().toLowerCase().email().max(320).parse(email);
  const supabase = client ?? await createServerSupabaseClient();
  await requireAccount("owner", supabase);
  const { data, error } = await supabase.rpc("mirai_create_invitation", { invited_email: normalizedEmail });
  if (error) throw new Error("Invitation could not be created.");
  const row = z.array(z.object({
    invitation_id: z.string().uuid(),
    invite_token: z.string().regex(/^[a-f0-9]{64}$/),
    expires_at: z.string(),
  })).min(1).parse(data)[0];
  return { invitationId: row.invitation_id, token: row.invite_token, expiresAt: row.expires_at };
}

export async function listOwnerAccess(client?: SupabaseClient): Promise<OwnerAccessOverview> {
  const supabase = client ?? await createServerSupabaseClient();
  await requireAccount("owner", supabase);
  const [profilesResult, requestsResult, invitationsResult] = await Promise.all([
    supabase.from("profiles").select("id,email,display_name,status,account_role").order("created_at", { ascending: true }),
    supabase.from("access_requests").select("id,requester_id,status,requested_at").order("requested_at", { ascending: true }),
    supabase.from("invitations").select("id,email,status,expires_at").order("created_at", { ascending: false }),
  ]);
  if (profilesResult.error || requestsResult.error || invitationsResult.error) {
    throw new Error("Access management is temporarily unavailable.");
  }

  const profileRows = z.array(z.object({
    id: z.string().uuid(), email: z.string().email(), display_name: z.string(),
    status: z.enum(["pending", "active", "revoked"]), account_role: z.enum(["member", "owner"]),
  })).parse(profilesResult.data);
  const requestRows = z.array(z.object({
    id: z.string().uuid(), requester_id: z.string().uuid(),
    status: z.enum(["pending", "approved", "rejected", "revoked"]), requested_at: z.string(),
  })).parse(requestsResult.data);
  const invitationRows = z.array(z.object({
    id: z.string().uuid(), email: z.string().email(),
    status: z.enum(["pending", "claimed", "revoked"]), expires_at: z.string(),
  })).parse(invitationsResult.data);

  return {
    profiles: profileRows.map((row) => ({
      id: row.id, email: row.email, displayName: row.display_name, status: row.status, role: row.account_role,
    })),
    requests: requestRows.map((row) => ({
      id: row.id, requesterId: row.requester_id, status: row.status, requestedAt: row.requested_at,
    })),
    invitations: invitationRows.map((row) => ({
      id: row.id, email: row.email, status: row.status, expiresAt: row.expires_at,
    })),
  };
}
