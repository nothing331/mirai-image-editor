import { describe, expect, it } from "vitest";
import type { AccountSnapshot } from "./account";
import { authorizedAccountReturnPath, safeReturnPath } from "./return-path";

describe("safeReturnPath", () => {
  it.each([
    ["/", "/"],
    ["/access?invite=abc", "/access?invite=abc"],
    ["/welcome", "/welcome"],
    ["/admin/access", "/admin/access"],
    ["/projects", "/projects"],
    ["/projects/new", "/projects/new"],
    ["/projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "/projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
  ])("accepts the owned destination %s", (candidate, expected) => {
    expect(safeReturnPath(candidate)).toBe(expected);
  });

  it.each([
    "https://attacker.example",
    "//attacker.example/path",
    "/\\attacker.example",
    "/api/projects",
    "/projects/foreign-id",
  ])("rejects the unsafe or unsupported destination %s", (candidate) => {
    expect(safeReturnPath(candidate)).toBe("/access");
  });
});

describe("authorizedAccountReturnPath", () => {
  it("sends a new pending account to access instead of an owner-only return path", () => {
    expect(authorizedAccountReturnPath(account("pending", "member"), "/admin/access")).toBe("/access");
  });

  it("preserves an invitation for a pending account", () => {
    expect(authorizedAccountReturnPath(account("pending", "member"), "/access?invite=invite-token")).toBe(
      "/access?invite=invite-token",
    );
  });

  it("sends a revoked account to its access status page", () => {
    expect(authorizedAccountReturnPath(account("revoked", "member"), "/welcome")).toBe("/access");
  });

  it("keeps active members out of the owner page after login", () => {
    expect(authorizedAccountReturnPath(account("active", "member"), "/admin/access")).toBe("/welcome");
  });

  it("allows an active owner to return to owner administration", () => {
    expect(authorizedAccountReturnPath(account("active", "owner"), "/admin/access")).toBe("/admin/access");
  });

  it("returns an active member to the requested project after login", () => {
    expect(authorizedAccountReturnPath(account("active", "member"), "/projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"))
      .toBe("/projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("moves an already active account past the access page", () => {
    expect(authorizedAccountReturnPath(account("active", "member"), "/access")).toBe("/welcome");
  });
});

function account(
  status: AccountSnapshot["profile"]["status"],
  role: AccountSnapshot["profile"]["account_role"],
): AccountSnapshot {
  return {
    profile: {
      id: "fe213012-63b0-4e64-bb51-8807bf5f6807",
      email: "member@example.com",
      display_name: "Member",
      status,
      account_role: role,
      onboarding_completed_at: null,
    },
    accessRequest: null,
    initialAiImageAllowance: status === "active" ? 5 : 0,
  };
}
