"use client";

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
  }}><button disabled={busy} className="min-h-10 font-mono text-[10px] uppercase tracking-[0.1em] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid disabled:opacity-50">{busy ? "Signing out…" : "Sign out"}</button></form>;
}
