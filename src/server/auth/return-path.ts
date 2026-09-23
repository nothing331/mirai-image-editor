const allowedDestinations = new Set(["/", "/access", "/welcome", "/admin/access"]);

export function safeReturnPath(candidate: string | null | undefined, fallback = "/access"): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return fallback;
  }
  const parsed = new URL(candidate, "https://mirai.invalid");
  return allowedDestinations.has(parsed.pathname) ? `${parsed.pathname}${parsed.search}` : fallback;
}
