import { ArrowUpRight, Layers3, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { AccountSnapshot } from "@/server/auth/account";
import { AuthShell } from "./AuthShell";

export function CloudLanding({ account }: { account: AccountSnapshot | null }) {
  const destination = !account ? "/sign-in?next=/projects" : account.profile.status === "active" ? "/projects" : "/access";
  const action = !account ? "Sign in with Google" : account.profile.status === "active" ? "Open my projects" : "View access status";
  return (
    <AuthShell
      eyebrow="ONE IMAGE · EVERY VERSION REVERSIBLE"
      title="Edit boldly. Keep the original."
      description="A little refinement. A whole new direction. Create and edit images in a workspace that keeps every version yours."
      secondary={account ? <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">{account.profile.email}</span> : null}
    >
      <div className="max-w-md">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Current access</p>
        <p className="mt-3 text-2xl font-bold tracking-[-0.04em]">
          {!account ? "Sign in to continue" : account.profile.status === "active" ? "Account approved" : "Approval required"}
        </p>
        <p className="mt-3 text-sm leading-6 text-muted">Keep your projects together, explore edits with AI, and return to any saved version. Mirai is in private beta; new accounts need an invitation or approval.</p>
        <Link href={destination} className="workspace-action mt-7 w-full">{action}<ArrowUpRight className="size-4" aria-hidden="true" /></Link>
        <div className="mt-8 space-y-3 border-t border-line pt-6 text-xs text-muted"><p className="flex items-center gap-3"><Layers3 className="size-4" aria-hidden="true" />Every accepted edit saves a new version.</p><p className="flex items-center gap-3"><ShieldCheck className="size-4" aria-hidden="true" />Private projects. An untouched original.</p></div>
      </div>
    </AuthShell>
  );
}
