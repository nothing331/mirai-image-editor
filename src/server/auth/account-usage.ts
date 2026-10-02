import "server-only";
import { z } from "zod";
import { aiUsageSchema } from "@/shared/cloud-ai";
import { createAdminSupabaseClient } from "@/server/supabase/admin-client";
import { AccountAccessError } from "./account";

const usageSchema = z.object({
  ai: aiUsageSchema,
  usedBytes: z.number().int().nonnegative(),
  limitBytes: z.number().int().positive().nullable(),
  activeProjects: z.number().int().nonnegative(),
  projectLimit: z.number().int().positive().nullable(),
});

export async function readAccountUsage(ownerId: string) {
  const { data, error } = await createAdminSupabaseClient().rpc("mirai_account_usage", { target_owner: ownerId });
  if (error) throw new AccountAccessError("unavailable");
  return usageSchema.parse(data);
}
