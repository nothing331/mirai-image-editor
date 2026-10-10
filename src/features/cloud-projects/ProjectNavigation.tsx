"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, Settings2, Trash2 } from "lucide-react";

const destinations = [
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/projects/trash", label: "Trash", icon: Trash2 },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function ProjectNavigation() {
  const pathname = usePathname();
  return <nav aria-label="Workspace navigation" className="flex items-center gap-1">
    {destinations.map(({ href, label, icon: Icon }) => {
      const active = href === "/projects" ? pathname.startsWith("/projects") && pathname !== "/projects/trash" : pathname === href;
      return <Link key={href} href={href} aria-label={label} aria-current={active ? "page" : undefined} title={label} className={`flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-md px-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:px-3 ${active ? "bg-surface text-ink" : "text-muted hover:bg-surface hover:text-ink"}`}><Icon className="size-4" aria-hidden="true" /><span className="hidden md:inline">{label}</span></Link>;
    })}
  </nav>;
}
