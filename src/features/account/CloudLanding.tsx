import Link from "next/link";
import type { AccountSnapshot } from "@/server/auth/account";
import { AuthShell } from "./AuthShell";

export function CloudLanding({ account }: { account: AccountSnapshot | null }) {
  const destination = !account ? "/sign-in" : account.profile.status === "active" ? "/welcome" : "/access";
  const action = !account ? "Sign in with Google" : account.profile.status === "active" ? "Open account" : "View access status";
  return (
    <AuthShell
      eyebrow="ONE IMAGE · EVERY VERSION REVERSIBLE"
      title="Edit boldly. Keep the original."
      description="Mirai is becoming a private cloud image editor. Sign in to join the controlled beta; project storage and editing will open in the next Wave B steps."
      secondary={account ? <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">{account.profile.email}</span> : null}
    >
      <div className="max-w-md">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Current access</p>
        <p className="mt-3 text-2xl font-bold tracking-[-0.04em]">
          {!account ? "Sign in to continue" : account.profile.status === "active" ? "Account approved" : "Approval required"}
        </p>
        <p className="mt-3 text-sm leading-6 text-muted">Authentication identifies you. Mirai separately checks whether the owner has approved your account before private product APIs become available.</p>
        <Link href={destination} className="mt-6 inline-flex min-h-10 items-center border border-ink bg-acid px-5 text-sm font-bold hover:bg-ink hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid">{action}</Link>
      </div>
    </AuthShell>
  );
}
