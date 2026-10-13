import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readRuntimeEnvironment } from "@/server/config/runtime-environment";
import { createServerSupabaseClient } from "@/server/supabase/server-client";
import { requireAccount } from "./account";

export type AccessEmailStatus = "sent" | "disabled" | "failed" | "unknown" | "busy";
export type AccessEmailTarget = { kind: "approval"; requestId: string } |
  { kind: "invitation"; invitationId: string; token: string };

export interface AccessEmailMessage {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
}

class EmailSendError extends Error {
  constructor(readonly outcome: "failed" | "unknown") {
    super("Email delivery could not be confirmed.");
  }
}

/** Runs only after an owner command commits; email failure never reverses eligibility. */
export async function sendAccessEmail(target: AccessEmailTarget, client?: SupabaseClient): Promise<AccessEmailStatus> {
  const supabase = client ?? await createServerSupabaseClient();
  await requireAccount("owner", supabase);
  const referenceId = z.string().uuid().parse(target.kind === "approval" ? target.requestId : target.invitationId);
  if (target.kind === "invitation") z.string().regex(/^[a-f0-9]{64}$/).parse(target.token);
  if (process.env.MIRAI_EMAIL_ENABLED !== "true") return "disabled";

  let claim: { event_key: string; delivery_id: string; attempt_id: string } | undefined;
  try {
    const environment = readRuntimeEnvironment();
    if (!environment.canonicalUrl) return "failed";
    const sender = z.string().trim().email().parse(process.env.MIRAI_EMAIL_FROM);
    const apiKey = z.string().trim().min(1).parse(process.env.RESEND_API_KEY);
    let email: string;
    let expiresAt: string | undefined;
    if (target.kind === "approval") {
      const request = await supabase.from("access_requests").select("requester_id,status").eq("id", referenceId).single();
      if (request.error || request.data?.status !== "approved") return "failed";
      const profile = await supabase.from("profiles").select("email,status").eq("id", request.data.requester_id).single();
      if (profile.error || profile.data?.status !== "active") return "failed";
      email = z.string().email().parse(profile.data.email);
    } else {
      const invitation = await supabase.from("invitations").select("email,expires_at").eq("id", referenceId).single();
      if (invitation.error) return "failed";
      email = z.string().email().parse(invitation.data.email);
      expiresAt = z.string().datetime({ offset: true }).parse(invitation.data.expires_at);
    }
    const link = new URL("/access", environment.canonicalUrl);
    if (target.kind === "invitation") link.searchParams.set("invite", target.token);
    const message = buildAccessEmail({ kind: target.kind, email, sender, link: link.toString(), expiresAt,
      invitationMode: process.env.MIRAI_INVITATION_MODE === "true" });
    const begun = await supabase.rpc("mirai_begin_access_email", {
      email_kind: target.kind, reference_id: referenceId, expected_email: email,
      message_digest: createHash("sha256").update(JSON.stringify(message)).digest("hex"),
      invitation_token: target.kind === "invitation" ? target.token : null,
    });
    if (begun.error) return "failed";
    const receipt = z.object({ status: z.enum(["send", "sent", "busy", "unknown"]),
      event_key: z.string().optional(), delivery_id: z.string().uuid().optional(), attempt_id: z.string().uuid().optional(),
    }).parse(begun.data);
    if (receipt.status !== "send") return receipt.status;
    claim = z.object({ event_key: z.string(), delivery_id: z.string().uuid(), attempt_id: z.string().uuid() }).parse(receipt);
    const providerId = await deliverResendEmail(message, apiKey, `mirai-access/${claim.delivery_id}`);
    const finished = await supabase.rpc("mirai_finish_access_email", {
      email_event: claim.event_key, executor_id: claim.attempt_id, outcome: "sent", provider_reference: providerId,
    });
    return finished.error ? "unknown" : "sent";
  } catch (error) {
    const outcome = error instanceof EmailSendError ? error.outcome : claim ? "unknown" : "failed";
    if (claim) {
      try {
        await supabase.rpc("mirai_finish_access_email", {
          email_event: claim.event_key, executor_id: claim.attempt_id, outcome, provider_reference: null,
        });
      } catch { /* A failed receipt write leaves the lease for safe owner retry. */ }
    }
    return outcome;
  }
}

export function buildAccessEmail(input: {
  kind: "approval" | "invitation"; email: string; sender: string; link: string; expiresAt?: string; invitationMode: boolean;
}): AccessEmailMessage {
  const approval = input.kind === "approval";
  const subject = approval ? "Your Mirai access request is approved" : "You’re invited to Mirai";
  const introduction = approval ? "Your request to join Mirai has been approved." : "You’ve been invited to join Mirai.";
  const availability = input.invitationMode
    ? "Mirai is collecting invitations before the workspace opens. You can check your access status now; approval does not open the editor yet."
    : "Your private image workspace is ready.";
  const instruction = `Sign in with Google using ${input.email}.${approval ? "" : " Then choose Accept invitation."}`;
  const expiry = input.expiresAt ? `This invitation expires ${new Date(input.expiresAt).toISOString().slice(0, 10)} (UTC).` : "";
  const paragraphs = [introduction, availability, instruction, expiry].filter(Boolean);
  return { from: `Mirai <${input.sender}>`, to: [input.email], subject,
    text: `${paragraphs.join("\n\n")}\n\n${input.link}`,
    html: `<main style="font-family:Arial,sans-serif;color:#171714;max-width:560px;margin:auto;padding:24px"><h1>${escapeHtml(subject)}</h1>${paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join("")}<p><a href="${escapeHtml(input.link)}">${approval ? "Check your access" : "Accept your invitation"}</a></p></main>` };
}

async function deliverResendEmail(message: AccessEmailMessage, apiKey: string, idempotencyKey: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(message), signal: AbortSignal.timeout(10_000), cache: "no-store",
    });
  } catch { throw new EmailSendError("unknown"); }
  if (!response.ok) {
    // A transport/server error or concurrent idempotency request may already have sent mail.
    throw new EmailSendError(response.status >= 500 || response.status === 409 || response.status === 408 ? "unknown" : "failed");
  }
  try { return z.object({ id: z.string().min(1).max(200) }).parse(await response.json()).id; }
  catch { throw new EmailSendError("unknown"); }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
