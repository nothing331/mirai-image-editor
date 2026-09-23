import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { initializeAuthenticatedAccount, resolveCurrentAccount } from "@/server/auth/account";
import { safeReturnPath } from "@/server/auth/return-path";
import { readRuntimeEnvironment } from "@/server/config/runtime-environment";
import { readPublicSupabaseConfiguration } from "@/server/supabase/configuration";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const returnPath = safeReturnPath(requestUrl.searchParams.get("next"));
  const redirectOrigin = readRuntimeEnvironment().canonicalUrl ?? requestUrl;
  let response = redirectResponse(redirectOrigin, "/sign-in?error=callback");
  if (!code) return response;

  const { url, publishableKey } = readPublicSupabaseConfiguration();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, cacheHeaders) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = redirectResponse(redirectOrigin, "/sign-in?error=callback");
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(cacheHeaders).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) return response;
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return response;

  try {
    await initializeAuthenticatedAccount(userData.user);
    const account = await resolveCurrentAccount(supabase);
    const destination = account?.profile.status === "active"
      ? (returnPath === "/access" ? "/welcome" : returnPath)
      : returnPath;
    const successfulResponse = redirectResponse(redirectOrigin, destination);
    response.cookies.getAll().forEach((cookie) => successfulResponse.cookies.set(cookie));
    copyPrivateCacheHeaders(response, successfulResponse);
    return successfulResponse;
  } catch {
    return redirectResponse(redirectOrigin, "/sign-in?error=setup");
  }
}

function redirectResponse(origin: URL, pathname: string): NextResponse {
  const response = NextResponse.redirect(new URL(pathname, origin));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function copyPrivateCacheHeaders(source: NextResponse, target: NextResponse): void {
  for (const name of ["cache-control", "expires", "pragma"]) {
    const value = source.headers.get(name);
    if (value) target.headers.set(name, value);
  }
}
