import Link from "next/link";
import { redirect } from "next/navigation";
import { ProjectShell } from "@/features/cloud-projects/ProjectShell";
import { CloudProjectError, listCloudProjects, type CloudProject } from "@/server/cloud-projects/cloud-projects";
import { resolveCurrentAccount } from "@/server/auth/account";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  if (process.env.MIRAI_AUTH_ENABLED !== "true") redirect("/");
  const account = await resolveCurrentAccount();
  if (!account) redirect("/sign-in?next=/projects");
  if (account.profile.status !== "active") redirect("/access");
  let projects: CloudProject[];
  let error = false;
  try { projects = await listCloudProjects(account.profile.id); }
  catch (cause) {
    if (!(cause instanceof CloudProjectError)) throw cause;
    projects = [];
    error = true;
  }
  return <ProjectShell email={account.profile.email}>
    <div className="mx-auto max-w-6xl border-x border-line">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line px-6 py-10 sm:px-10">
        <div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Private workspace / {projects.length} of 5 projects</p>
          <h1 className="mt-3 text-4xl font-bold tracking-[-0.055em] sm:text-5xl">My projects</h1>
          <p className="mt-3 text-sm text-muted">Your saved originals, ready to reopen.</p></div>
        {!error && projects.length > 0 && projects.length < 5 && <Link href="/projects/new" className="inline-flex min-h-11 items-center border border-ink bg-acid px-5 text-sm font-bold hover:bg-ink hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid">New project <span aria-hidden="true" className="ml-3">↗</span></Link>}
      </div>
      {error ? <div role="alert" className="border-b border-line px-6 py-12 sm:px-10"><h2 className="text-xl font-bold">Projects could not load.</h2><p className="mt-2 text-sm text-muted">Refresh to try again.</p></div>
        : projects.length === 0 ? <div className="grid min-h-80 place-content-center border-b border-line px-6 py-16 text-center"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">No saved originals yet</p><h2 className="mt-4 text-2xl font-bold tracking-tight">Start with one image.</h2><p className="mt-3 text-sm text-muted">Upload a PNG or JPEG to create your first private project.</p><Link href="/projects/new" className="mx-auto mt-6 inline-flex min-h-11 items-center border border-ink bg-acid px-5 text-sm font-bold">Upload image</Link></div>
        : <ul className="divide-y divide-line border-b border-line">{projects.map((project, index) => <li key={project.id}>
          <Link href={`/projects/${project.id}`} className="group grid gap-3 px-6 py-5 hover:bg-[#e8e5dc] focus-visible:bg-[#e8e5dc] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-acid sm:grid-cols-[3rem_1fr_auto] sm:items-center sm:px-10">
            <span className="font-mono text-xs text-muted">{String(index + 1).padStart(2, "0")}</span>
            <span className="min-w-0"><strong className="block truncate text-lg tracking-tight">{project.name}</strong><span className="mt-1 block truncate font-mono text-[10px] text-muted">{project.width} × {project.height} PX · {project.originalName}</span></span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em]">Open <span aria-hidden="true" className="ml-2 group-hover:translate-x-1">↗</span></span>
          </Link></li>)}</ul>}
      {projects.length >= 5 && <p className="px-6 py-6 text-sm text-muted sm:px-10">The current beta limit is five active projects per account.</p>}
    </div>
  </ProjectShell>;
}
