import type { AccountSnapshot } from "./account";
import { invitationModeEnabled } from "@/server/config/invitation-mode";

const allowedDestinations = new Set(["/", "/access", "/welcome", "/admin/access", "/settings", "/projects/trash"]);
const projectDestination = /^\/projects\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const invitationDestinations = new Set(["/", "/access", "/admin/access"]);

export function safeReturnPath(candidate: string | null | undefined, fallback = "/access"): string {
  if (invitationModeEnabled()) {
    fallback = invitationDestinations.has(fallback) ? fallback : "/access";
  }
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return fallback;
  }
  const parsed = new URL(candidate, "https://mirai.invalid");
  if (invitationModeEnabled()) {
    return invitationDestinations.has(parsed.pathname) ? `${parsed.pathname}${parsed.search}` : fallback;
  }
  return allowedDestinations.has(parsed.pathname) || parsed.pathname === "/projects" ||
    parsed.pathname === "/projects/new" || projectDestination.test(parsed.pathname)
    ? `${parsed.pathname}${parsed.search}` : fallback;
}

export function authorizedAccountReturnPath(
  account: AccountSnapshot | null,
  requestedPath: string,
): string {
  const requestedUrl = new URL(requestedPath, "https://mirai.invalid");
  if (invitationModeEnabled()) {
    if (requestedUrl.pathname === "/admin/access" && account?.profile.status === "active" && account.profile.account_role === "owner") {
      return requestedPath;
    }
    return requestedUrl.pathname === "/access" ? requestedPath : "/access";
  }
  if (!account || account.profile.status !== "active") {
    return requestedUrl.pathname === "/access" ? requestedPath : "/access";
  }
  if (requestedUrl.pathname === "/admin/access" && account.profile.account_role !== "owner") {
    return "/welcome";
  }
  return requestedUrl.pathname === "/access" ? "/welcome" : requestedPath;
}
