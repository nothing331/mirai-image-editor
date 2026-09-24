import type { AccountSnapshot } from "./account";

const allowedDestinations = new Set(["/", "/access", "/welcome", "/admin/access"]);

export function safeReturnPath(candidate: string | null | undefined, fallback = "/access"): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return fallback;
  }
  const parsed = new URL(candidate, "https://mirai.invalid");
  return allowedDestinations.has(parsed.pathname) ? `${parsed.pathname}${parsed.search}` : fallback;
}

export function authorizedAccountReturnPath(
  account: AccountSnapshot | null,
  requestedPath: string,
): string {
  const requestedUrl = new URL(requestedPath, "https://mirai.invalid");
  if (!account || account.profile.status !== "active") {
    return requestedUrl.pathname === "/access" ? requestedPath : "/access";
  }
  if (requestedUrl.pathname === "/admin/access" && account.profile.account_role !== "owner") {
    return "/welcome";
  }
  return requestedUrl.pathname === "/access" ? "/welcome" : requestedPath;
}
