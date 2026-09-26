import { redirect } from "next/navigation";
import { resolveCurrentAccount } from "@/server/auth/account";
import { ProjectShell } from "@/features/cloud-projects/ProjectShell";
import { NewProjectForm } from "@/features/cloud-projects/NewProjectForm";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  if (process.env.MIRAI_AUTH_ENABLED !== "true") redirect("/");
  const account = await resolveCurrentAccount();
  if (!account) redirect("/sign-in?next=/projects/new");
  if (account.profile.status !== "active") redirect("/access");
  return <ProjectShell email={account.profile.email}><NewProjectForm ownerId={account.profile.id} /></ProjectShell>;
}
