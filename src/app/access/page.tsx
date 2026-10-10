import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/features/account/AuthShell";
import { SubmitButton } from "@/features/account/SubmitButton";
import { claimInvitationAction, requestAccessAction, signOutAction } from "@/app/auth/actions";
import { resolveCurrentAccount } from "@/server/auth/account";
import { invitationModeEnabled } from "@/server/config/invitation-mode";

export const dynamic = "force-dynamic";

interface AccessPageProps {
  searchParams: Promise<{ invite?: string; error?: string; requested?: string }>;
}

export default async function AccessPage({ searchParams }: AccessPageProps) {
  const parameters = await searchParams;
  const invitationMode = invitationModeEnabled();
  const account = await resolveCurrentAccount();
  if (!account) redirect("/sign-in?next=/access");
  if (account.profile.status === "active" && !invitationMode) redirect("/welcome");
  const request = account.accessRequest;
  const canRequest = account.profile.status === "pending" && (!request || request.status === "rejected");
  return (
    <AuthShell
      eyebrow={invitationMode ? "INVITATION LAUNCH" : "CONTROLLED BETA"}
      title={account.profile.status === "revoked" ? "Access revoked." : account.profile.status === "active" ? "Access approved." : request?.status === "pending" ? "Request pending." : "Approval required."}
      description={invitationMode ? "Request an invitation and check its status. The workspace is not open yet." : "You’re signed in. One more step brings you into your private image workspace."}
      secondary={<form action={signOutAction}><button className="workspace-quiet-action">Sign out</button></form>}
    >
      <div className="max-w-md">
        <p className="font-mono text-[10px] break-all uppercase tracking-[0.16em] text-muted">{account.profile.email}</p>
        <h2 className="mt-3 text-2xl font-bold tracking-[-0.04em]">{statusHeading(account)}</h2>
        <p className="mt-3 text-sm leading-6 text-muted">{statusDescription(account)}</p>
        {invitationMode && account.profile.status === "active" && account.profile.account_role === "owner" && (
          <Link href="/admin/access" className="workspace-quiet-action mt-4 inline-block">Manage invitations</Link>
        )}
        {parameters.error && <p role="alert" className="mt-4 border-l-2 border-accent bg-[#ffd5cc] p-3 text-sm">{parameters.error === "invite" ? "That invitation is invalid, expired, or belongs to another Google email." : "Your request could not be saved. Please try again."}</p>}
        {parameters.requested === "1" && <p role="status" className="mt-4 border-l-2 border-acid bg-[#edf5c4] p-3 text-sm">Your access request is saved.</p>}
        {parameters.invite && account.profile.status === "pending" && (
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
  if (account.profile.status === "active") return "Your invitation is approved.";
  if (account.accessRequest?.status === "pending") return "The owner will review your request.";
  if (account.accessRequest?.status === "rejected") return "Your previous request was not approved.";
  return "Request access or use an invitation.";
}

function statusDescription(account: NonNullable<Awaited<ReturnType<typeof resolveCurrentAccount>>>): string {
  if (account.profile.status === "revoked") return "This account no longer has workspace access. Contact the owner if you believe this is incorrect.";
  if (account.profile.status === "active") return "Your access is approved. The workspace will open when Mirai launches.";
  if (account.accessRequest?.status === "pending") return "You can safely close this page and return later. Your request is already with the owner.";
  if (account.accessRequest?.status === "rejected") return "You may submit a new request. Approval remains an explicit owner decision.";
  return "Send a request to the owner, or open your invitation link to get started.";
}
