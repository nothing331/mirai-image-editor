import { redirect } from "next/navigation";
import { AuthShell } from "@/features/account/AuthShell";
import { SubmitButton } from "@/features/account/SubmitButton";
import { claimInvitationAction, requestAccessAction, signOutAction } from "@/app/auth/actions";
import { resolveCurrentAccount } from "@/server/auth/account";

export const dynamic = "force-dynamic";

interface AccessPageProps {
  searchParams: Promise<{ invite?: string; error?: string; requested?: string }>;
}

export default async function AccessPage({ searchParams }: AccessPageProps) {
  const parameters = await searchParams;
  const account = await resolveCurrentAccount();
  if (!account) redirect("/sign-in?next=/access");
  if (account.profile.status === "active") redirect("/welcome");
  const request = account.accessRequest;
  const canRequest = account.profile.status !== "revoked" && (!request || request.status === "rejected");
  return (
    <AuthShell
      eyebrow="CONTROLLED BETA"
      title={account.profile.status === "revoked" ? "Access revoked." : request?.status === "pending" ? "Request pending." : "Approval required."}
      description="Your Google identity is authenticated. Mirai keeps account eligibility separate so signing in alone never opens private APIs, storage, or paid tools."
      secondary={<form action={signOutAction}><button className="font-mono text-[9px] uppercase tracking-[0.12em] underline underline-offset-4">Sign out</button></form>}
    >
      <div className="max-w-md">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{account.profile.email}</p>
        <h2 className="mt-3 text-2xl font-bold tracking-[-0.04em]">{statusHeading(account)}</h2>
        <p className="mt-3 text-sm leading-6 text-muted">{statusDescription(account)}</p>
        {parameters.error && <p role="alert" className="mt-4 border-l-2 border-accent bg-[#ffd5cc] p-3 text-sm">{parameters.error === "invite" ? "That invitation is invalid, expired, or belongs to another Google email." : "Your request could not be saved. Please try again."}</p>}
        {parameters.requested === "1" && <p role="status" className="mt-4 border-l-2 border-acid bg-[#edf5c4] p-3 text-sm">Your access request is saved.</p>}
        {parameters.invite && account.profile.status !== "revoked" && (
          <form action={claimInvitationAction} className="mt-6 border border-ink bg-[#edf5c4] p-4">
            <input type="hidden" name="invite" value={parameters.invite} />
            <p className="mb-3 text-sm font-bold">An invitation link is ready to verify against this Google email.</p>
            <SubmitButton idle="Accept invitation" pending="Checking invitation…" />
          </form>
        )}
        {canRequest && (
          <form action={requestAccessAction} className="mt-6">
            <SubmitButton idle={request?.status === "rejected" ? "Request access again" : "Request access"} pending="Saving request…" />
          </form>
        )}
      </div>
    </AuthShell>
  );
}

function statusHeading(account: NonNullable<Awaited<ReturnType<typeof resolveCurrentAccount>>>): string {
  if (account.profile.status === "revoked") return "This account cannot use Mirai.";
  if (account.accessRequest?.status === "pending") return "The owner will review your request.";
  if (account.accessRequest?.status === "rejected") return "Your previous request was not approved.";
  return "Request access or use an invitation.";
}

function statusDescription(account: NonNullable<Awaited<ReturnType<typeof resolveCurrentAccount>>>): string {
  if (account.profile.status === "revoked") return "Signing in still proves your identity, but operational access remains blocked. Contact the owner if you believe this is incorrect.";
  if (account.accessRequest?.status === "pending") return "You can safely close this page and return later. Repeating the request will not create duplicate access or allowances.";
  if (account.accessRequest?.status === "rejected") return "You may submit a new request. Approval remains an explicit owner decision.";
  return "A request creates a pending record only. It cannot approve itself.";
}
