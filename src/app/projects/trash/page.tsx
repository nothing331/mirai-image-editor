import { Trash2 } from "lucide-react";
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
  return <ProjectShell email={account.profile.email} ownerId={account.profile.id}><div className="workspace-content max-w-5xl">
    <div className="mb-8 border-b border-line pb-8"><Link href="/projects" className="font-mono text-[10px] uppercase underline underline-offset-4">← My projects</Link><h1 className="mt-5 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">Trash</h1><p className="mt-3 text-sm text-muted">Projects remain private and count toward storage until permanent deletion finishes.</p></div>
    {projects.length === 0 ? <div className="rounded-xl border border-dashed border-line bg-surface/30 px-6 py-16 text-center"><Trash2 className="mx-auto size-7 text-muted" aria-hidden="true" /><h2 className="mt-4 text-xl font-semibold tracking-tight">Trash is empty.</h2><p className="mt-3 text-sm text-muted">Projects you move here can be restored for 30 days.</p><Link href="/projects" className="workspace-quiet-action mt-6">Back to projects</Link></div>
      : <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">{projects.map((project) => <li key={project.id} className="flex flex-wrap items-center justify-between gap-4 min-w-0 px-5 py-5"><div className="min-w-0"><strong className="block break-words text-base font-semibold">{project.name}</strong><p className="mt-1 text-xs leading-5 text-muted">Deleted {project.deleted_at && new Date(project.deleted_at).toLocaleDateString()} · Restore until {project.purge_after && new Date(project.purge_after).toLocaleDateString()}</p></div><div className="flex gap-5"><ProjectLifecycleAction projectId={project.id} action="restore" name={project.name} /><ProjectLifecycleAction projectId={project.id} action="purge" name={project.name} /></div></li>)}</ul>}
  </div></ProjectShell>;
}
