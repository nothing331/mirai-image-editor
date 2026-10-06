"use client";

import { LogOut } from "lucide-react";
import { useRef, useState } from "react";
import { signOutAction } from "@/app/auth/actions";
import { clearAllCloudDrafts } from "./cloud-draft-cache";

export function CloudSignOutForm() {
  const ready = useRef(false);
  const [busy, setBusy] = useState(false);
  return <form action={signOutAction} onSubmit={(event) => {
    if (ready.current) return;
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    void clearAllCloudDrafts().catch(() => {}).finally(() => { ready.current = true; form.requestSubmit(); });
  }}><button disabled={busy} aria-label={busy ? "Signing out…" : "Sign out"} title="Sign out" className="flex min-h-10 min-w-10 items-center justify-center gap-2 px-2 text-xs font-semibold text-muted hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"><LogOut className="size-4" aria-hidden="true" /><span className="hidden sm:inline">{busy ? "Signing out…" : "Sign out"}</span></button></form>;
}
