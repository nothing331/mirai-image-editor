import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ decide: vi.fn(), create: vi.fn(), send: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("@/server/auth/access-service", () => ({ decideAccess: mocks.decide, createInvitation: mocks.create }));
vi.mock("@/server/auth/access-email", () => ({ sendAccessEmail: mocks.send }));
vi.mock("@/server/config/runtime-environment", () => ({ readRuntimeEnvironment: () => ({ canonicalUrl: new URL("https://mirai.example") }) }));
import { approveAccessAction, createInvitationAction, retryApprovalEmailAction, type InvitationActionState } from "./actions";
const initial: InvitationActionState = { inviteUrl: null, expiresAt: null, error: null, invitationId: null, emailStatus: null };
afterEach(() => vi.resetAllMocks());

describe("owner access email actions", () => {
  it("sends approval only after the access transaction succeeds", async () => {
    mocks.decide.mockRejectedValueOnce(new Error("not approved"));
    await expect(approveAccessAction("request-id")).rejects.toThrow("not approved");
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.decide.mockResolvedValueOnce(undefined);
    mocks.send.mockResolvedValueOnce("failed");
    await expect(approveAccessAction("request-id")).rejects.toThrow("redirect:/admin/access?email=failed");
    expect(mocks.decide).toHaveBeenLastCalledWith("request-id", "approve");
    expect(mocks.send).toHaveBeenCalledWith({ kind: "approval", requestId: "request-id" });
    expect(mocks.refresh).toHaveBeenCalled();
  });
  it("retrying an approval email does not grant access or credits again", async () => {
    mocks.send.mockResolvedValueOnce("sent");
    await expect(retryApprovalEmailAction("request-id")).rejects.toThrow("email=sent");
    expect(mocks.decide).not.toHaveBeenCalled();
  });
  it("preserves the created invitation when email fails", async () => {
    mocks.create.mockResolvedValueOnce({ invitationId: "invitation-id", token: "a".repeat(64), expiresAt: "2026-11-01T00:00:00Z" });
    mocks.send.mockResolvedValueOnce("unknown");
    const form = new FormData(); form.set("email", "invitee@example.com");
    const state = await createInvitationAction(initial, form);
    expect(state).toMatchObject({ invitationId: "invitation-id", emailStatus: "unknown", error: null });
    expect(state.inviteUrl).toBe(`https://mirai.example/access?invite=${"a".repeat(64)}`);
  });
  it("retrying invitation mail reuses its token and never replaces the link", async () => {
    mocks.send.mockResolvedValueOnce("sent");
    const form = new FormData(); form.set("intent", "retry-email"); form.set("invitationId", "invitation-id"); form.set("token", "a".repeat(64));
    const state = await createInvitationAction(initial, form);
    expect(state.emailStatus).toBe("sent");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledWith({ kind: "invitation", invitationId: "invitation-id", token: "a".repeat(64) });
  });
  it("preserves access and the new link if email authorization becomes unavailable after commit", async () => {
    mocks.decide.mockResolvedValueOnce(undefined);
    mocks.send.mockRejectedValueOnce(new Error("session expired"));
    await expect(approveAccessAction("request-id")).rejects.toThrow("email=failed");
    mocks.create.mockResolvedValueOnce({ invitationId: "invitation-id", token: "a".repeat(64), expiresAt: "2026-11-01T00:00:00Z" });
    mocks.send.mockRejectedValueOnce(new Error("session unavailable"));
    const form = new FormData(); form.set("email", "invitee@example.com");
    expect(await createInvitationAction(initial, form)).toMatchObject({ invitationId: "invitation-id", emailStatus: "failed", error: null, inviteUrl: `https://mirai.example/access?invite=${"a".repeat(64)}` });
  });
});
