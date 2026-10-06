import { createClient } from "@supabase/supabase-js";
const [id, outcome, reason] = process.argv.slice(2);
if (!/^[0-9a-f-]{36}$/.test(id ?? "") || !["ready", "failed"].includes(outcome) || (reason?.length ?? 0) < 10) throw new Error('Usage: node scripts/cloud-ai/reconcile.mjs <request-id> <ready|failed> "Evidence-backed reason"');
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error("Server-only maintenance credentials are required.");
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let bytes = 0;
if (outcome === "ready") {
  const attempt = await client.from("ai_attempts").select("result_key").eq("id", id).single();
  if (attempt.error) throw new Error("Attempt not found.");
  const stored = await client.storage.from("mirai-ai-results").download(attempt.data.result_key);
  if (stored.error || !stored.data) throw new Error("A private stored result is required.");
  const result = JSON.parse(await stored.data.text());
  if (!result.response || (!result.response.candidateBase64 && !result.response.candidates && !result.response.analysis)) throw new Error("The stored result has no reviewable candidate or analysis.");
  bytes = stored.data.size;
}
const reconciled = await client.rpc("mirai_reconcile_ai", { target_id: id, target_outcome: outcome, target_bytes: bytes, target_reason: reason });
if (reconciled.error) throw new Error("Reconciliation was rejected. Confirm that the lease expired and review the operator evidence.");
console.info("AI attempt reconciled; the provider spending ceiling remains recorded.");
