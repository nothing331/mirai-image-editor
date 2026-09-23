"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { readRuntimeEnvironment } from "@/server/config/runtime-environment";
import { createServerSupabaseClient } from "@/server/supabase/server-client";
import { claimInvitation, createInvitation, decideAccess, requestAccess, revokeAccess } from "@/server/auth/access-service";
import { requireAccount } from "@/server/auth/account";
import { safeReturnPath } from "@/server/auth/return-path";

export interface InvitationActionState {
  inviteUrl: string | null;
  expiresAt: string | null;
  error: string | null;
}

export async function startGoogleSignIn(formData: FormData): Promise<void> {
  const environment = readRuntimeEnvironment();
  if (!environment.auth.enabled || !environment.canonicalUrl) redirect("/sign-in?error=unavailable");
  const returnPath = safeReturnPath(valueOf(formData, "next"));
  const callback = new URL("/auth/callback", environment.canonicalUrl);
  callback.searchParams.set("next", returnPath);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString(), scopes: "openid email profile" },
  });
  if (error || !data.url) redirect("/sign-in?error=provider");
  redirect(data.url);
}

export async function requestAccessAction(): Promise<void> {
  try {
    await requestAccess();
  } catch {
    redirect("/access?error=request");
  }
  revalidatePath("/access");
  redirect("/access?requested=1");
}

export async function claimInvitationAction(formData: FormData): Promise<void> {
  try {
    await claimInvitation(valueOf(formData, "invite") ?? "");
  } catch {
    redirect("/access?error=invite");
  }
  revalidatePath("/access");
  redirect("/welcome?approved=1");
}

export async function approveAccessAction(requestId: string): Promise<void> {
  await decideAccess(requestId, "approve");
  revalidatePath("/admin/access");
}

export async function rejectAccessAction(requestId: string): Promise<void> {
  await decideAccess(requestId, "reject");
  revalidatePath("/admin/access");
}

export async function revokeAccessAction(accountId: string): Promise<void> {
  await revokeAccess(accountId);
  revalidatePath("/admin/access");
}

export async function createInvitationAction(
  _previous: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  try {
    const environment = readRuntimeEnvironment();
    if (!environment.canonicalUrl) throw new Error("Missing canonical URL.");
    const invitation = await createInvitation(valueOf(formData, "email") ?? "");
    const inviteUrl = new URL("/access", environment.canonicalUrl);
    inviteUrl.searchParams.set("invite", invitation.token);
    revalidatePath("/admin/access");
    return { inviteUrl: inviteUrl.toString(), expiresAt: invitation.expiresAt, error: null };
  } catch {
    return { inviteUrl: null, expiresAt: null, error: "Invitation could not be created. Check the address and try again." };
  }
}

export async function completeOnboardingAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const account = await requireAccount("eligible", supabase);
  const { error } = await supabase.from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", account.profile.id);
  if (error) redirect("/welcome?error=save");
  revalidatePath("/");
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/sign-in?signedOut=1");
}

function valueOf(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}
