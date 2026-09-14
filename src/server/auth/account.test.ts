import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { AccountAccessError, requireAccount, resolveCurrentAccount } from "./account";

const accountId = "11111111-1111-4111-8111-111111111111";

describe("account authorization", () => {
  it("treats a missing verified claim as signed out", async () => {
    await expect(resolveCurrentAccount(fakeClient({ signedIn: false }))).resolves.toBeNull();
  });

  it("resolves only database-owned eligibility and allowance fields", async () => {
    const account = await resolveCurrentAccount(fakeClient({ status: "active", role: "member", allowance: 5 }));
    expect(account).toMatchObject({
      profile: { id: accountId, status: "active", account_role: "member" },
      initialAiImageAllowance: 5,
    });
  });

  it("does not treat authentication alone as eligibility", async () => {
    await expect(requireAccount("eligible", fakeClient({ status: "pending" }))).rejects.toMatchObject({ reason: "ineligible" } satisfies Partial<AccountAccessError>);
  });

  it("requires the database owner role for owner commands", async () => {
    await expect(requireAccount("owner", fakeClient({ status: "active", role: "member" }))).rejects.toMatchObject({ reason: "owner-required" } satisfies Partial<AccountAccessError>);
    await expect(requireAccount("owner", fakeClient({ status: "active", role: "owner" }))).resolves.toMatchObject({ profile: { account_role: "owner" } });
  });

  it("blocks revoked accounts even for authenticated-only application access", async () => {
    await expect(requireAccount("authenticated", fakeClient({ status: "revoked" }))).rejects.toMatchObject({ reason: "revoked" } satisfies Partial<AccountAccessError>);
  });
});

function fakeClient(options: {
  signedIn?: boolean;
  status?: "pending" | "active" | "revoked";
  role?: "member" | "owner";
  allowance?: number;
} = {}): SupabaseClient {
  const signedIn = options.signedIn ?? true;
  const rows: Record<string, unknown> = {
    profiles: {
      id: accountId,
      email: "member@example.com",
      display_name: "Member",
      status: options.status ?? "pending",
      account_role: options.role ?? "member",
      onboarding_completed_at: null,
    },
    access_requests: null,
    account_allowance_grants: options.allowance === undefined ? null : { granted_quantity: options.allowance },
  };

  return {
    auth: {
      getClaims: async () => signedIn
        ? { data: { claims: { sub: accountId } }, error: null }
        : { data: { claims: null }, error: new Error("missing session") },
    },
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: rows[table], error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}
