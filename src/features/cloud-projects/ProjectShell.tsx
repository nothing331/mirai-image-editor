import { MiraiBrand } from "@/shared/ui/MiraiBrand";
import { CloudSignOutForm } from "./CloudSignOutForm";
import { CloudAccountScope } from "./CloudAccountScope";
import { ProjectNavigation } from "./ProjectNavigation";

export function ProjectShell({ children, email, ownerId }: { children: React.ReactNode; email: string; ownerId: string }) {
  return <main className="account-surface public-page min-h-dvh bg-paper text-ink">
    <CloudAccountScope ownerId={ownerId} />
    <header className="flex h-16 items-center justify-between gap-2 border-b border-line px-4 sm:px-8">
      <MiraiBrand href="/projects" />
      <div className="flex min-w-0 items-center gap-2 sm:gap-5">
        <ProjectNavigation />
        <span className="hidden max-w-44 truncate text-xs text-muted xl:block" title={email}>{email}</span>
        <CloudSignOutForm />
      </div>
    </header>
    {children}
  </main>;
}
