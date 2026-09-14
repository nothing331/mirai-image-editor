import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./return-path";

describe("safeReturnPath", () => {
  it.each([
    ["/", "/"],
    ["/access?invite=abc", "/access?invite=abc"],
    ["/welcome", "/welcome"],
    ["/admin/access", "/admin/access"],
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
