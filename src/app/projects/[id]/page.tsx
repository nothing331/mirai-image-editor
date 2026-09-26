import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { resolveCurrentAccount } from "@/server/auth/account";
import { CloudProjectError, getCloudProject, getCloudProjectImage } from "@/server/cloud-projects/cloud-projects";
import { ProjectShell } from "@/features/cloud-projects/ProjectShell";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  if (process.env.MIRAI_AUTH_ENABLED !== "true") redirect("/");
  const account = await resolveCurrentAccount();
  if (!account) redirect(`/sign-in?next=/projects/${encodeURIComponent(id)}`);
  if (account.profile.status !== "active") redirect("/access");
  let project;
  let imageUrl;
  try {
    project = await getCloudProject(account.profile.id, id);
    imageUrl = await getCloudProjectImage(account.profile.id, project);
  } catch (error) {
    if (error instanceof CloudProjectError && error.code === "not-found") notFound();
    throw error;
  }
  return <ProjectShell email={account.profile.email}>
    <section className="mx-auto flex min-h-[calc(100dvh-56px)] max-w-6xl flex-col border-x border-line">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-4 sm:px-10">
        <div className="min-w-0"><Link href="/projects" className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted underline underline-offset-4">← My projects</Link><h1 className="mt-2 truncate text-2xl font-bold tracking-tight">{project.name}</h1></div>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Original saved · version 1</span>
      </div>
      <div className="flex min-h-80 flex-1 items-center justify-center bg-ink p-6 sm:p-10">
        {/* A fresh private URL is signed on every open; this page is never cached. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={`${project.name} original`} width={project.width} height={project.height} className="max-h-[68dvh] max-w-full object-contain" />
      </div>
      <div className="flex flex-wrap justify-between gap-2 border-t border-line px-6 py-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted sm:px-10"><span>{project.width} × {project.height} px</span><span>Original: {project.originalName}</span></div>
    </section>
  </ProjectShell>;
}
