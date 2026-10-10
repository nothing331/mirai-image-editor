import Link from "next/link";
import { redirect } from "next/navigation";
import { completeOnboardingAction, signOutAction } from "@/app/auth/actions";
import { AuthShell } from "@/features/account/AuthShell";
import { SubmitButton } from "@/features/account/SubmitButton";
import { resolveCurrentAccount } from "@/server/auth/account";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const account = await resolveCurrentAccount();
  if (!account) redirect("/sign-in?next=/welcome");
  if (account.profile.status !== "active") redirect("/access");
  return (
    <AuthShell
      eyebrow="ACCOUNT READY"
      title={`Welcome, ${account.profile.display_name}.`}
      description="Make room for your next idea. Your private workspace is ready."
      secondary={<form action={signOutAction}><button className="workspace-quiet-action">Sign out</button></form>}
    >
      <div className="max-w-md">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Access confirmed</p>
        <h2 className="mt-3 text-2xl font-bold tracking-[-0.04em]">Your Mirai account is active.</h2>
        <dl className="mt-5 divide-y divide-line border-y border-line text-sm">
          <div className="flex justify-between gap-4 py-3"><dt className="text-muted">Role</dt><dd className="font-mono uppercase">{account.profile.account_role}</dd></div>
          <div className="flex justify-between gap-4 py-3"><dt className="text-muted">Welcome AI credits</dt><dd className="font-mono">{account.profile.account_role === "owner" ? "Unlimited" : `${account.initialAiImageAllowance} credits`}</dd></div>
          <div className="flex justify-between gap-4 py-3"><dt className="text-muted">Cloud projects</dt><dd><Link href="/projects" className="font-mono uppercase underline underline-offset-4">Open my projects</Link></dd></div>
        </dl>
        <p className="mt-4 text-xs leading-5 text-muted">{account.profile.account_role === "owner" ? "Your admin account has unlimited projects, AI previews, and account storage. Service availability still applies." : "Your beta includes 5 active projects and 25 welcome AI credits shared across all projects. Each generated preview uses 1 credit. Local edits and exports use no credits. Welcome credits do not reset monthly."}</p>
        {account.profile.account_role === "owner" && <Link href="/admin/access" className="mt-5 workspace-quiet-action">Manage beta access</Link>}
        {!account.profile.onboarding_completed_at && <form action={completeOnboardingAction} className="mt-6"><SubmitButton idle="Acknowledge and continue" pending="Saving…" /></form>}
      </div>
    </AuthShell>
  );
}
