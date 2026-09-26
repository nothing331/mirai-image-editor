import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { CloudEditorWorkspace } from "@/features/cloud-projects/CloudEditorWorkspace";
import { ProjectShell } from "@/features/cloud-projects/ProjectShell";
import { resolveCurrentAccount } from "@/server/auth/account";
import { CloudProjectError, getCloudProject } from "@/server/cloud-projects/cloud-projects";
import { cloudOriginalVersionId } from "@/server/cloud-projects/cloud-edit-history";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  if (process.env.MIRAI_AUTH_ENABLED !== "true") redirect("/");
  const account = await resolveCurrentAccount();
  if (!account) redirect(`/sign-in?next=/projects/${encodeURIComponent(id)}`);
  if (account.profile.status !== "active") redirect("/access");
  let project;
  let originalVersionId;
  try {
    project = await getCloudProject(account.profile.id, id);
    originalVersionId = await cloudOriginalVersionId(account.profile.id, id);
  } catch (error) {
    if (error instanceof CloudProjectError && error.code === "not-found") notFound();
    throw error;
  }
  return <ProjectShell email={account.profile.email}>
      <CloudEditorWorkspace projectId={project.id} projectName={project.name}
        originalVersionId={originalVersionId} initialCurrentVersionId={project.currentVersionId}
        initialHeadVersionId={project.headVersionId} />
    </ProjectShell>;
}
