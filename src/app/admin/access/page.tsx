import { notFound, redirect } from "next/navigation";
import { approveAccessAction, rejectAccessAction, revokeAccessAction, signOutAction } from "@/app/auth/actions";
import { AuthShell } from "@/features/account/AuthShell";
import { InvitationForm } from "@/features/account/InvitationForm";
import { SubmitButton } from "@/features/account/SubmitButton";
import { listOwnerAccess } from "@/server/auth/access-service";
import { resolveCurrentAccount } from "@/server/auth/account";

export const dynamic = "force-dynamic";

export default async function AccessManagementPage() {
  const account = await resolveCurrentAccount();
  if (!account) redirect("/sign-in?next=/admin/access");
  if (account.profile.status !== "active" || account.profile.account_role !== "owner") notFound();
  const overview = await listOwnerAccess();
  const profiles = new Map(overview.profiles.map((profile) => [profile.id, profile]));
  const pending = overview.requests.filter((request) => request.status === "pending");
  const activeMembers = overview.profiles.filter((profile) => profile.status === "active" && profile.role === "member");
  return (
    <AuthShell
      eyebrow="OWNER CONTROL"
      title="Manage beta access."
      description="Invitations and approvals converge on one durable account grant. Repeating an approval cannot replenish the five-image allowance."
      secondary={<form action={signOutAction}><button className="font-mono text-[9px] uppercase tracking-[0.12em] underline underline-offset-4">Sign out</button></form>}
    >
      <div className="w-full max-w-xl space-y-7 py-4">
        <section>
          <div className="flex items-baseline justify-between gap-4"><h2 className="text-lg font-bold tracking-[-0.03em]">Pending requests</h2><span className="font-mono text-[10px] text-muted">{pending.length}</span></div>
          <div className="mt-3 divide-y divide-line border-y border-line">
            {pending.length === 0 && <p className="py-4 text-sm text-muted">No requests need review.</p>}
            {pending.map((request) => {
              const profile = profiles.get(request.requesterId);
              return <article key={request.id} className="py-4">
                <p className="font-bold">{profile?.displayName ?? "Unknown account"}</p>
                <p className="mt-1 font-mono text-[10px] text-muted">{profile?.email}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={approveAccessAction.bind(null, request.id)}><SubmitButton idle="Approve" pending="Approving…" /></form>
                  <form action={rejectAccessAction.bind(null, request.id)}><SubmitButton idle="Reject" pending="Rejecting…" variant="secondary" /></form>
                </div>
              </article>;
            })}
          </div>
        </section>
        <InvitationForm />
        <section className="border-t border-line pt-5">
          <div className="flex items-baseline justify-between gap-4"><h2 className="text-lg font-bold tracking-[-0.03em]">Active members</h2><span className="font-mono text-[10px] text-muted">{activeMembers.length}</span></div>
          <div className="mt-3 divide-y divide-line border-y border-line">
            {activeMembers.length === 0 && <p className="py-4 text-sm text-muted">No approved members yet.</p>}
            {activeMembers.map((profile) => <article key={profile.id} className="flex items-center justify-between gap-4 py-4">
              <div><p className="font-bold">{profile.displayName}</p><p className="mt-1 font-mono text-[10px] text-muted">{profile.email}</p></div>
              <form action={revokeAccessAction.bind(null, profile.id)}><SubmitButton idle="Revoke" pending="Revoking…" variant="danger" /></form>
            </article>)}
          </div>
        </section>
        <section className="border-t border-line pt-5">
          <h2 className="text-lg font-bold tracking-[-0.03em]">Invitations</h2>
          <div className="mt-3 divide-y divide-line border-y border-line">
            {overview.invitations.length === 0 && <p className="py-4 text-sm text-muted">No invitations created.</p>}
            {overview.invitations.map((invitation) => <div key={invitation.id} className="flex justify-between gap-4 py-3 text-sm"><span>{invitation.email}</span><span className="font-mono text-[9px] uppercase text-muted">{invitation.status}</span></div>)}
          </div>
        </section>
      </div>
    </AuthShell>
  );
}
