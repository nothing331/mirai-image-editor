import Image from "next/image";
import Link from "next/link";

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  secondary?: React.ReactNode;
}

export function AuthShell({ eyebrow, title, description, children, secondary }: AuthShellProps) {
  return (
    <main className="public-page min-h-dvh bg-paper text-ink">
      <header className="flex h-14 items-center justify-between border-b border-line px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-acid">
          <Image src="/icon.png" alt="" width={28} height={28} priority />
          <span className="font-extrabold tracking-[-0.04em]">MIRAI</span>
          <span className="hidden font-mono text-[9px] tracking-[0.16em] text-muted sm:inline">REVERSIBLE AI IMAGE EDITOR</span>
        </Link>
        {secondary}
      </header>
      <section className="mx-auto grid min-h-[calc(100dvh-56px)] max-w-6xl items-stretch border-x border-line lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex min-h-72 flex-col justify-between border-b border-line bg-ink p-6 text-paper sm:p-10 lg:border-b-0 lg:border-r">
          <p className="font-mono text-[10px] tracking-[0.18em] text-acid">{eyebrow}</p>
          <div className="max-w-xl py-12">
            <h1 className="max-w-2xl text-4xl font-bold leading-[0.98] tracking-[-0.055em] sm:text-6xl">{title}</h1>
            <p className="mt-6 max-w-lg text-sm leading-6 text-[#cfcdc5] sm:text-base">{description}</p>
          </div>
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8e8b82]">Private beta · Cloud foundation</p>
        </div>
        <div className="flex items-center p-6 sm:p-10">
          <div className="w-full">{children}</div>
        </div>
      </section>
    </main>
  );
}
