import Image from "next/image";
import Link from "next/link";

export function MiraiBrand({ href = "/" }: { href?: string }) {
  return <Link href={href} aria-label="Mirai home" className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink">
    <span className="grid size-9 place-items-center overflow-hidden"><Image src="/icon.png" alt="" width={36} height={36} priority className="scale-[1.45]" /></span>
    <span className="flex flex-col"><span className="text-xl font-extrabold leading-none tracking-[-0.06em]">MIRAI</span><span className="mt-1 hidden font-mono text-[8px] tracking-[0.15em] text-muted sm:block">IMAGE STUDIO</span></span>
  </Link>;
}
