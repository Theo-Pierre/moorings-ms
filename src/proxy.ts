import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

function buildLoginUrl(request: NextRequest): URL {
  const url = new URL("/login", request.url);
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (nextPath && nextPath !== "/") {
    url.searchParams.set("next", nextPath);
  }
  return url;
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (pathname === "/login") {
    if (sessionToken) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!sessionToken) {
    return NextResponse.redirect(buildLoginUrl(request));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/schedule/:path*",
    "/vessels/:path*",
    "/riggers/:path*",
    "/shipwrights/:path*",
    "/reports/:path*",
    "/login",
  ],
};
