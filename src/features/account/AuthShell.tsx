import { ShieldCheck } from "lucide-react";
import { MiraiBrand } from "@/shared/ui/MiraiBrand";
import { StudioIllustration } from "@/shared/ui/StudioIllustration";

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  secondary?: React.ReactNode;
}

export function AuthShell({ eyebrow, title, description, children, secondary }: AuthShellProps) {
  return (
    <main className="account-surface public-page min-h-dvh bg-paper text-ink">
      <header className="flex h-16 items-center justify-between gap-4 border-b border-line px-5 sm:px-8">
        <MiraiBrand />
        <div className="min-w-0 max-w-[55%] truncate text-xs text-muted">{secondary ?? <span className="font-mono text-[10px] uppercase tracking-[0.12em]">Private beta</span>}</div>
      </header>
      <section className="mx-auto grid min-h-[calc(100dvh-64px)] max-w-7xl lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative flex flex-col justify-center border-b border-line bg-surface/60 px-6 py-9 sm:px-12 sm:py-12 lg:border-b-0 lg:border-r lg:px-16">
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted"><span className="size-1.5 rounded-full bg-ink" aria-hidden="true" />{eyebrow}</p>
          <h1 className="mt-5 max-w-lg break-words text-4xl font-semibold leading-[1.08] tracking-[-0.055em] sm:text-5xl xl:text-[58px]">{title}</h1>
          <p className="mt-5 max-w-md text-sm leading-6 text-muted">{description}</p>
          <figure className="relative mt-9 hidden w-full max-w-md overflow-hidden rounded-xl border border-ink/10 bg-workspace sm:block">
            <StudioIllustration className="h-56 w-full object-cover" />
            <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-ink/75 px-4 py-3 font-mono text-[9px] uppercase tracking-[0.14em] text-paper"><span>Select · Edit · Review</span><span aria-hidden="true">01 / ∞</span></figcaption>
          </figure>
          <p className="mt-7 flex items-center gap-2 text-xs text-muted"><ShieldCheck className="size-4 shrink-0" aria-hidden="true" />Your original stays untouched. Always.</p>
        </div>
        <div className="flex min-w-0 items-center justify-center px-6 py-10 sm:px-12 sm:py-14 lg:px-14">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </section>
    </main>
  );
}
