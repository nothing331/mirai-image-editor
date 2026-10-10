import { redirect } from "next/navigation";
import { AuthShell } from "@/features/account/AuthShell";
import { SubmitButton } from "@/features/account/SubmitButton";
import { resolveCurrentAccount } from "@/server/auth/account";
import { authorizedAccountReturnPath, safeReturnPath } from "@/server/auth/return-path";
import { invitationModeEnabled } from "@/server/config/invitation-mode";
import { startGoogleSignIn } from "@/app/auth/actions";

export const dynamic = "force-dynamic";

interface SignInPageProps {
  searchParams: Promise<{ error?: string; signedOut?: string; next?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const parameters = await searchParams;
  const invitationMode = invitationModeEnabled();
  const account = await resolveCurrentAccount();
  if (account && invitationMode) redirect(authorizedAccountReturnPath(account, safeReturnPath(parameters.next)));
  if (account) redirect(account.profile.status === "active" ? safeReturnPath(parameters.next, "/projects") : "/access");
  const error = errorMessage(parameters.error);
  return (
    <AuthShell eyebrow="SECURE ACCOUNT" title="Continue with Google." description={invitationMode ? "Sign in to request an invitation or check your access status." : "Your images, ideas, and every version. Sign in to pick up where you left off."}>
      <div className="max-w-md">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Sign in</p>
        <h2 className="mt-3 text-2xl font-bold tracking-[-0.04em]">{invitationMode ? "Join the invitation list" : "One account, private projects"}</h2>
        <p className="mt-3 text-sm leading-6 text-muted">Signing in does not automatically grant product access. New accounts can request approval from the Mirai owner.</p>
        {error && <p role="alert" className="mt-4 border-l-2 border-accent bg-[#ffd5cc] p-3 text-sm">{error}</p>}
        {parameters.signedOut === "1" && <p role="status" className="mt-4 border-l-2 border-acid bg-[#edf5c4] p-3 text-sm">You are signed out.</p>}
        <form action={startGoogleSignIn} className="mt-6">
          <input type="hidden" name="next" value={safeReturnPath(parameters.next)} />
          <SubmitButton idle="Continue with Google" pending="Opening Google…" className="w-full"><svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4h5.4a4.7 4.7 0 0 1-2 3c-.9.6-2 1-3.4 1A6 6 0 1 1 12 6c1.5 0 2.6.5 3.5 1.3L18.3 4A10 10 0 1 0 12 22c5.8 0 9.6-4.1 9.6-9.8Z" /></svg></SubmitButton>
        </form>
        <p className="mt-6 border-t border-line pt-4 text-xs leading-5 text-muted">Use the Google account associated with your invitation or access request. Closing Google’s consent screen returns you here without creating project data.</p>
      </div>
    </AuthShell>
  );
}

function errorMessage(error: string | undefined): string | null {
  if (error === "provider") return "Google sign-in is temporarily unavailable. Please try again.";
  if (error === "callback") return "The sign-in response was incomplete or expired. Start again.";
  if (error === "setup") return "Your identity was verified, but Mirai could not finish account setup. Please retry.";
  if (error === "unavailable") return "Cloud authentication is not configured yet.";
  return null;
}
