import type { AccountSnapshot } from "@/server/auth/account";
import { ProductLanding } from "@/features/landing/ProductLanding";

export function CloudLanding({ account }: { account: AccountSnapshot | null }) {
  const active = account?.profile.status === "active";
  return (
    <ProductLanding
      signedOut={!account}
      destination={
        !account ? "/sign-in?next=/access" : active ? "/projects" : "/access"
      }
      action={
        !account
          ? "Request an invite"
          : active
            ? "Open my projects"
            : "Check access status"
      }
      access={
        !account
          ? "Request access to join the early launch"
          : active
            ? "Account approved"
            : "Your access status is available"
      }
    />
  );
}
