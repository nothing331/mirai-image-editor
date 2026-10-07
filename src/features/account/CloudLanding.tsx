import type { AccountSnapshot } from "@/server/auth/account";
import { ProductLanding } from "@/features/landing/ProductLanding";

export function CloudLanding({ account }: { account: AccountSnapshot | null }) {
  const active = account?.profile.status === "active";
  return (
    <ProductLanding
      destination={
        !account ? "/sign-in?next=/projects" : active ? "/projects" : "/access"
      }
      action={
        !account
          ? "Sign in with Google"
          : active
            ? "Open my projects"
            : "View access status"
      }
      access={
        !account
          ? "Sign in to continue"
          : active
            ? "Account approved"
            : "Approval required"
      }
    />
  );
}
