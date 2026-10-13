import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAccessEmail, sendAccessEmail } from "./access-email";

vi.mock("./account", () => ({ requireAccount: vi.fn(async () => ({})) }));
vi.mock("@/server/config/runtime-environment", () => ({ readRuntimeEnvironment: () => ({ canonicalUrl: new URL("https://mirai.example") }) }));
const requestId = "11111111-1111-4111-8111-111111111111";
const deliveryId = "22222222-2222-4222-8222-222222222222";
const attemptId = "33333333-3333-4333-8333-333333333333";
const token = "a".repeat(64);
let fetchEmail: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("MIRAI_EMAIL_ENABLED", "true");
  vi.stubEnv("MIRAI_EMAIL_FROM", "hello@mirai.example");
  vi.stubEnv("RESEND_API_KEY", "test-api-key");
  vi.stubEnv("MIRAI_INVITATION_MODE", "false");
  fetchEmail = vi.fn(async () => Response.json({ id: "email-provider-id" }));
  vi.stubGlobal("fetch", fetchEmail);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function client(options: { status?: string; beginError?: boolean; finishError?: boolean; active?: boolean } = {}) {
  const rpc = vi.fn(async (name: string, parameters: Record<string, unknown>) => {
    expect(parameters).toBeDefined();
    return name === "mirai_begin_access_email"
      ? { data: { status: options.status ?? "send", event_key: "approval/event", delivery_id: deliveryId, attempt_id: attemptId }, error: options.beginError ? {} : null }
      : { data: null, error: options.finishError ? {} : null };
  });
  const fake = { rpc, from: (table: string) => {
    const row = table === "access_requests" ? { requester_id: requestId, status: "approved" }
      : table === "profiles" ? { email: "member@example.com", status: options.active === false ? "revoked" : "active" }
      : { email: "invitee@example.com", expires_at: "2026-11-01T00:00:00+00:00" };
    const builder = { select: () => builder, eq: () => builder, single: async () => ({ data: row, error: null }) };
    return builder;
  } } as unknown as SupabaseClient;
  return { fake, rpc };
}

describe("access email delivery", () => {
  it("authorizes the owner before any email side effect", async () => {
    const { requireAccount } = await import("./account");
    vi.mocked(requireAccount).mockRejectedValueOnce(new Error("owner required"));
    await expect(sendAccessEmail({ kind: "approval", requestId }, client().fake)).rejects.toThrow("owner required");
    expect(fetchEmail).not.toHaveBeenCalled();
  });
  it("keeps disabled delivery offline", async () => {
    vi.stubEnv("MIRAI_EMAIL_ENABLED", "false");
    const { fake, rpc } = client();
    expect(await sendAccessEmail({ kind: "approval", requestId }, fake)).toBe("disabled");
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchEmail).not.toHaveBeenCalled();
  });
  it("sends the database email and canonical link, then records provider acceptance", async () => {
    const { fake, rpc } = client();
    expect(await sendAccessEmail({ kind: "approval", requestId }, fake)).toBe("sent");
    const [url, request] = fetchEmail.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(request.headers).toMatchObject({ "Idempotency-Key": `mirai-access/${deliveryId}` });
    expect(JSON.parse(request.body as string)).toMatchObject({ to: ["member@example.com"], subject: "Your Mirai access request is approved" });
    expect(JSON.parse(request.body as string).text).toContain("https://mirai.example/access");
    expect(rpc).toHaveBeenLastCalledWith("mirai_finish_access_email", expect.objectContaining({ outcome: "sent", provider_reference: "email-provider-id", executor_id: attemptId }));
  });
  it("includes the matching invitation token and expiry without persisting the raw token in the receipt", async () => {
    const { fake, rpc } = client();
    expect(await sendAccessEmail({ kind: "invitation", invitationId: requestId, token }, fake)).toBe("sent");
    const request = fetchEmail.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string).text).toContain(`/access?invite=${token}`);
    expect(rpc).toHaveBeenCalledWith("mirai_begin_access_email", expect.objectContaining({ expected_email: "invitee@example.com", invitation_token: token }));
    expect(rpc.mock.calls.at(-1)?.[1]).not.toHaveProperty("invitation_token");
  });
  it.each(["sent", "busy", "unknown"])("does not dispatch for a %s receipt", async status => {
    expect(await sendAccessEmail({ kind: "approval", requestId }, client({ status }).fake)).toBe(status);
    expect(fetchEmail).not.toHaveBeenCalled();
  });
  it("does not send to a revoked account or without a successful claim", async () => {
    expect(await sendAccessEmail({ kind: "approval", requestId }, client({ active: false }).fake)).toBe("failed");
    expect(await sendAccessEmail({ kind: "approval", requestId }, client({ beginError: true }).fake)).toBe("failed");
    expect(fetchEmail).not.toHaveBeenCalled();
  });
  it.each([[422, "failed"], [429, "failed"], [500, "unknown"], [409, "unknown"]])("records HTTP %s as %s without exposing the provider body", async (status, outcome) => {
    fetchEmail.mockResolvedValueOnce(Response.json({ secret: "private-provider-error" }, { status: status as number }));
    const { fake, rpc } = client();
    expect(await sendAccessEmail({ kind: "approval", requestId }, fake)).toBe(outcome);
    expect(rpc).toHaveBeenLastCalledWith("mirai_finish_access_email", expect.objectContaining({ outcome, provider_reference: null }));
  });
  it("keeps a network timeout or failed receipt write uncertain", async () => {
    fetchEmail.mockRejectedValueOnce(new Error("timeout"));
    expect(await sendAccessEmail({ kind: "approval", requestId }, client().fake)).toBe("unknown");
    expect(await sendAccessEmail({ kind: "approval", requestId }, client({ finishError: true }).fake)).toBe("unknown");
  });
  it("rejects bad sender configuration before dispatch", async () => {
    vi.stubEnv("MIRAI_EMAIL_FROM", "invalid");
    expect(await sendAccessEmail({ kind: "approval", requestId }, client().fake)).toBe("failed");
    expect(fetchEmail).not.toHaveBeenCalled();
  });
});

describe("access email content", () => {
  it("does not promise workspace access during invitation mode", () => {
    const message = buildAccessEmail({ kind: "approval", email: "member@example.com", sender: "hello@mirai.example", link: "https://mirai.example/access", invitationMode: true });
    expect(message.text).toContain("approval does not open the editor yet");
    expect(message.text).not.toContain("workspace is ready");
  });
  it("escapes HTML and includes a plain text alternative", () => {
    const message = buildAccessEmail({ kind: "invitation", email: "a&b@example.com", sender: "hello@mirai.example", link: "https://mirai.example/access?x=1&y=2", invitationMode: false });
    expect(message.html).toContain("a&amp;b@example.com");
    expect(message.html).toContain("x=1&amp;y=2");
    expect(message.text).toContain("a&b@example.com");
  });
});
