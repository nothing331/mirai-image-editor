"use client";

import { useActionState } from "react";
import { createInvitationAction, type InvitationActionState } from "@/app/auth/actions";
import { SubmitButton } from "./SubmitButton";

const initialState: InvitationActionState = { inviteUrl: null, expiresAt: null, error: null };

export function InvitationForm() {
  const [state, action] = useActionState(createInvitationAction, initialState);
  return (
    <div className="border-t border-line pt-5">
      <h2 className="text-lg font-bold tracking-[-0.03em]">Create invitation</h2>
      <p className="mt-1 text-sm leading-5 text-muted">The link works only for the matching Google email and expires after 14 days.</p>
      <form action={action} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
          Google email
          <input name="email" type="email" required autoComplete="email" className="h-10 border border-line bg-[#e8e5dc] px-3 font-sans text-sm normal-case tracking-normal text-ink outline-none focus:border-ink focus:ring-2 focus:ring-acid" />
        </label>
        <div className="self-end"><SubmitButton idle="Create link" pending="Creating…" /></div>
      </form>
      {state.error && <p role="alert" className="mt-3 border-l-2 border-accent bg-[#ffd5cc] p-3 text-sm">{state.error}</p>}
      {state.inviteUrl && (
        <div role="status" className="mt-3 border border-ink bg-[#edf5c4] p-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em]">Invitation ready</p>
          <input readOnly aria-label="Invitation link" value={state.inviteUrl} className="mt-2 w-full border border-line bg-paper px-3 py-2 font-mono text-xs" />
          <p className="mt-2 text-xs text-muted">Expires {new Date(state.expiresAt!).toLocaleString()}.</p>
        </div>
      )}
    </div>
  );
}
