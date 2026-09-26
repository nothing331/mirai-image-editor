import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveCurrentAccount } from "@/server/auth/account";
import { listTrashedProjects } from "@/server/cloud-projects/cloud-lifecycle";
import { ProjectLifecycleAction } from "@/features/cloud-projects/ProjectLifecycleAction";
import { ProjectShell } from "@/features/cloud-projects/ProjectShell";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  if (process.env.MIRAI_AUTH_ENABLED !== "true") redirect("/");
  const account = await resolveCurrentAccount();
  if (!account) redirect("/sign-in?next=/projects/trash");
  if (account.profile.status !== "active") redirect("/access");
  const projects = await listTrashedProjects(account.profile.id);
  return <ProjectShell email={account.profile.email} ownerId={account.profile.id}><div className="mx-auto min-h-[calc(100dvh-56px)] max-w-5xl border-x border-line">
    <div className="border-b border-line px-6 py-10 sm:px-10"><Link href="/projects" className="font-mono text-[10px] uppercase underline underline-offset-4">← My projects</Link><h1 className="mt-5 text-4xl font-bold tracking-tight">Trash</h1><p className="mt-3 text-sm text-muted">Projects remain private and count toward storage until permanent deletion finishes.</p></div>
    {projects.length === 0 ? <p className="border-b border-line px-6 py-14 text-sm text-muted sm:px-10">Trash is empty.</p>
      : <ul className="divide-y divide-line border-b border-line">{projects.map((project) => <li key={project.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 sm:px-10"><div className="min-w-0"><strong className="block truncate text-lg">{project.name}</strong><p className="mt-1 font-mono text-[10px] text-muted">Deleted {project.deleted_at && new Date(project.deleted_at).toLocaleDateString()} · Restore until {project.purge_after && new Date(project.purge_after).toLocaleDateString()}</p></div><div className="flex gap-5"><ProjectLifecycleAction projectId={project.id} action="restore" name={project.name} /><ProjectLifecycleAction projectId={project.id} action="purge" name={project.name} /></div></li>)}</ul>}
  </div></ProjectShell>;
}
