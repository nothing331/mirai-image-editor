import Link from "next/link";
import { z } from "zod";

export default async function AccountDeletionPage({ searchParams }: {
  searchParams: Promise<{ receipt?: string }>;
}) {
  const receipt = z.uuid().safeParse((await searchParams).receipt);
  return <main className="public-page min-h-dvh bg-paper px-6 py-20 text-ink"><div className="mx-auto max-w-xl border-t-4 border-accent pt-8"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">Account deletion</p><h1 className="mt-4 text-4xl font-bold tracking-tight">Deletion requested.</h1><p className="mt-5 text-sm leading-6 text-muted">Your account is blocked from new work. Private files and account records are queued for permanent deletion. Previously issued short-lived image links may remain usable until they expire.</p>{receipt.success && <p className="mt-6 border border-line p-3 font-mono text-xs">Support reference: {receipt.data}</p>}<Link href="/" className="mt-8 inline-block text-xs underline underline-offset-4">Return to Mirai</Link></div></main>;
}
