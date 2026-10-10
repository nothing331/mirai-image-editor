import { ArrowUpRight, Plus, Trash2 } from "lucide-react";
import { StudioIllustration } from "@/shared/ui/StudioIllustration";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ProjectShell } from "@/features/cloud-projects/ProjectShell";
import { ProjectLibrary } from "@/features/cloud-projects/ProjectLibrary";
import { CloudProjectError, listCloudProjects, type CloudProject } from "@/server/cloud-projects/cloud-projects";
import { resolveCurrentAccount } from "@/server/auth/account";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  if (process.env.MIRAI_AUTH_ENABLED !== "true") redirect("/");
  const account = await resolveCurrentAccount();
  if (!account) redirect("/sign-in?next=/projects");
  if (account.profile.status !== "active") redirect("/access");
  const unlimited = account.profile.account_role === "owner";
  let projects: CloudProject[];
  let error = false;
  try { projects = await listCloudProjects(account.profile.id); }
  catch (cause) {
    if (!(cause instanceof CloudProjectError)) throw cause;
    projects = [];
    error = true;
  }
  return <ProjectShell email={account.profile.email} ownerId={account.profile.id}>
    <div className="workspace-content">
      <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
        <div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Private workspace / {projects.length}{unlimited ? " projects · unlimited admin account" : " of 5 projects"}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">My projects</h1>
          <p className="mt-3 text-sm text-muted">Your saved images, ready to reopen.</p></div>
        {!error && projects.length > 0 && (unlimited || projects.length < 5) && <Link href="/projects/new" className="workspace-action"><Plus className="size-4" aria-hidden="true" />New project</Link>}
      </div>
      {error ? <div role="alert" className="rounded-lg border border-line bg-surface p-8"><h2 className="text-xl font-bold">Projects could not load.</h2><p className="mt-2 text-sm text-muted">Refresh to try again.</p></div>
        : projects.length === 0 ? <div className="grid overflow-hidden rounded-xl border border-line bg-surface/40 md:grid-cols-2"><div className="flex flex-col justify-center px-7 py-12 sm:px-10"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">No saved originals yet</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Start with one image.</h2><p className="mt-4 max-w-xs text-sm leading-6 text-muted">Upload an image to edit, or create one with AI. Every idea starts somewhere.</p><Link href="/projects/new" className="workspace-action mt-7 self-start">Start a new project<ArrowUpRight className="size-4" aria-hidden="true" /></Link></div><div className="hidden border-l border-line p-6 md:block"><StudioIllustration className="h-80 w-full rounded-lg" /></div></div>
        : <ProjectLibrary key={projects.map((project) => `${project.id}:${project.updatedAt}`).join("|")} initialProjects={projects} />}
      {!unlimited && projects.length >= 5 && <p className="mt-6 text-sm text-muted">The current beta limit is five active projects per account.</p>}
      <div className="mt-8 flex items-center justify-between border-t border-line pt-5"><Link href="/projects/trash" className="flex min-h-10 items-center gap-2 text-xs text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"><Trash2 className="size-3.5" aria-hidden="true" />View trash</Link><p className="text-xs text-muted">Your originals stay safe.</p></div>
    </div>
  </ProjectShell>;
}
