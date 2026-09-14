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
      description="Your identity and eligibility are now verified. Private image storage and cloud projects arrive in the next Wave B delivery units."
      secondary={<form action={signOutAction}><button className="font-mono text-[9px] uppercase tracking-[0.12em] underline underline-offset-4">Sign out</button></form>}
    >
      <div className="max-w-md">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Access confirmed</p>
        <h2 className="mt-3 text-2xl font-bold tracking-[-0.04em]">Your Mirai account is active.</h2>
        <dl className="mt-5 divide-y divide-line border-y border-line text-sm">
          <div className="flex justify-between gap-4 py-3"><dt className="text-muted">Role</dt><dd className="font-mono uppercase">{account.profile.account_role}</dd></div>
          <div className="flex justify-between gap-4 py-3"><dt className="text-muted">Initial AI allowance</dt><dd className="font-mono">{account.initialAiImageAllowance} images</dd></div>
          <div className="flex justify-between gap-4 py-3"><dt className="text-muted">Cloud projects</dt><dd className="font-mono uppercase">Not enabled yet</dd></div>
        </dl>
        {account.profile.account_role === "owner" && <Link href="/admin/access" className="mt-5 inline-flex min-h-10 items-center border border-line px-4 text-sm font-bold hover:border-ink hover:bg-[#e8e5dc]">Manage beta access</Link>}
        {!account.profile.onboarding_completed_at && <form action={completeOnboardingAction} className="mt-6"><SubmitButton idle="Acknowledge and continue" pending="Saving…" /></form>}
      </div>
    </AuthShell>
  );
}
