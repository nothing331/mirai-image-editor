import { redirect } from "next/navigation";
import { resolveCurrentAccount } from "@/server/auth/account";
import { readAccountUsage } from "@/server/auth/account-usage";
import { AccountSettings } from "@/features/account/AccountSettings";
import { ProjectShell } from "@/features/cloud-projects/ProjectShell";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (process.env.MIRAI_AUTH_ENABLED !== "true") redirect("/");
  const account = await resolveCurrentAccount();
  if (!account) redirect("/sign-in?next=/settings");
  if (account.profile.status !== "active") redirect("/access");
  const usage = await readAccountUsage(account.profile.id);
  return <ProjectShell email={account.profile.email} ownerId={account.profile.id}><AccountSettings
    displayName={account.profile.display_name} email={account.profile.email}
    usage={usage} aiAllowance={account.initialAiImageAllowance} /></ProjectShell>;
}
