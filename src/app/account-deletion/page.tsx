import { AuthShell } from "@/features/account/AuthShell";
import Link from "next/link";
import { z } from "zod";

export default async function AccountDeletionPage({ searchParams }: {
  searchParams: Promise<{ receipt?: string }>;
}) {
  const receipt = z.uuid().safeParse((await searchParams).receipt);
  return <AuthShell eyebrow="ACCOUNT DELETION" title="Deletion requested." description="Your account is blocked from new work. Private files and account records are queued for permanent deletion."><div><h2 className="text-2xl font-semibold tracking-tight">Your request is saved.</h2><p className="mt-4 text-sm leading-6 text-muted">Previously issued short-lived image links may remain usable until they expire.</p>{receipt.success && <p className="mt-6 break-all rounded-lg border border-line bg-surface p-4 font-mono text-xs leading-6">Support reference: {receipt.data}</p>}<Link href="/" className="workspace-quiet-action mt-7">Return to Mirai</Link></div></AuthShell>;
}
