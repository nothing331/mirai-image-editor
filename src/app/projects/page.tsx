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
    <div className="mx-auto max-w-6xl border-x border-line">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line px-6 py-10 sm:px-10">
        <div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Private workspace / {projects.length}{unlimited ? " projects · unlimited admin account" : " of 5 projects"}</p>
          <h1 className="mt-3 text-4xl font-bold tracking-[-0.055em] sm:text-5xl">My projects</h1>
          <p className="mt-3 text-sm text-muted">Your saved images, ready to reopen.</p></div>
        {!error && projects.length > 0 && (unlimited || projects.length < 5) && <Link href="/projects/new" className="inline-flex min-h-11 items-center border border-ink bg-acid px-5 text-sm font-bold hover:bg-ink hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid">New project <span aria-hidden="true" className="ml-3">↗</span></Link>}
      </div>
      {error ? <div role="alert" className="border-b border-line px-6 py-12 sm:px-10"><h2 className="text-xl font-bold">Projects could not load.</h2><p className="mt-2 text-sm text-muted">Refresh to try again.</p></div>
        : projects.length === 0 ? <div className="grid min-h-80 place-content-center border-b border-line px-6 py-16 text-center"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">No saved originals yet</p><h2 className="mt-4 text-2xl font-bold tracking-tight">Start with one image.</h2><p className="mt-3 text-sm text-muted">Upload an image to edit, or create one with AI.</p><Link href="/projects/new" className="mx-auto mt-6 inline-flex min-h-11 items-center border border-ink bg-acid px-5 text-sm font-bold">Start a new project</Link></div>
        : <ProjectLibrary key={projects.map((project) => `${project.id}:${project.updatedAt}`).join("|")} initialProjects={projects} />}
      {!unlimited && projects.length >= 5 && <p className="px-6 py-6 text-sm text-muted sm:px-10">The current beta limit is five active projects per account.</p>}
      <div className="border-b border-line px-6 py-6 sm:px-10"><Link href="/projects/trash" className="text-xs underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-acid">View trash</Link></div>
    </div>
  </ProjectShell>;
}
