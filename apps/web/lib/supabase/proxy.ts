import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/auth"];
const AUTH_PAGES = ["/sign-in", "/sign-up"];

function matches(path: string, prefixes: string[]) {
  return prefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Runs on every request: refreshes the Supabase session cookie, then redirects signed-out users
 * to /sign-in and signed-in users away from the auth pages. This is an optimistic check only;
 * pages and actions verify the user again before reading data.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet)
            request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers))
            response.headers.set(key, value);
        },
      },
    },
  );

  // Validates the JWT. Keep this directly after creating the client.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const path = request.nextUrl.pathname;

  // API routes answer JSON, so a signed-out call gets a 401 rather than the sign-in page.
  if (!signedIn && path.startsWith("/api/"))
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!signedIn && !matches(path, PUBLIC_PATHS))
    return redirectTo(request, response, "/sign-in");
  if (signedIn && matches(path, AUTH_PAGES))
    return redirectTo(request, response, "/home");
  return response;
}

/** Redirect while keeping any refreshed session cookies and no-cache headers. */
function redirectTo(
  request: NextRequest,
  from: NextResponse,
  pathname: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";

  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(header);
    if (value) redirect.headers.set(header, value);
  }
  return redirect;
}
