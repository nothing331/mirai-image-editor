import type { AccountSnapshot } from "@/server/auth/account";
import { ProductLanding } from "@/features/landing/ProductLanding";
import { invitationModeEnabled } from "@/server/config/invitation-mode";

export function CloudLanding({ account }: { account: AccountSnapshot | null }) {
  const active = account?.profile.status === "active";
  const invitationMode = invitationModeEnabled();
  return (
    <ProductLanding
      signedOut={!account}
      invitationMode={invitationMode}
      destination={
        !account ? "/sign-in?next=/access" : active && !invitationMode ? "/projects" : "/access"
      }
      action={
        !account
          ? "Request an invite"
          : active && !invitationMode
            ? "Open my projects"
            : "Check access status"
      }
      access={
        !account
          ? "Request access to join the early launch"
          : active
            ? invitationMode ? "Access approved; the workspace opens at launch" : "Account approved"
            : "Your access status is available"
      }
    />
  );
}
