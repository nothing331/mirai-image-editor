import Image from "next/image";
import Link from "next/link";
import { CloudSignOutForm } from "./CloudSignOutForm";
import { CloudAccountScope } from "./CloudAccountScope";

export function ProjectShell({ children, email, ownerId }: { children: React.ReactNode; email: string; ownerId: string }) {
  return <main className="public-page min-h-dvh bg-paper text-ink">
    <CloudAccountScope ownerId={ownerId} />
    <header className="flex h-14 items-center justify-between gap-3 border-b border-line px-4 sm:px-6">
      <Link href="/projects" className="flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-acid">
        <Image src="/icon.png" alt="" width={28} height={28} priority />
        <span className="font-extrabold tracking-[-0.04em]">MIRAI</span>
        <span className="hidden font-mono text-[9px] tracking-[0.16em] text-muted sm:inline">MY PROJECTS</span>
      </Link>
      <div className="flex items-center gap-4">
        <span className="hidden max-w-48 truncate font-mono text-[10px] text-muted sm:block">{email}</span>
        <Link href="/settings" className="min-h-10 content-center font-mono text-[10px] uppercase tracking-[0.1em] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid">Settings</Link>
        <CloudSignOutForm />
      </div>
    </header>
    {children}
  </main>;
}
