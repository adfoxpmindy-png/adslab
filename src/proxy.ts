import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "adslab_session";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Cookie-existence check only. We don't decrypt at the edge — the
  // server component layer (`requireTenantMember` → `requireSession`) does
  // the authoritative session check. The proxy just keeps unauthenticated
  // users from loading tenant routes at all.
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);
  if (hasSessionCookie) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Match anything under /t/...
  matcher: ["/t/:path*"],
};
