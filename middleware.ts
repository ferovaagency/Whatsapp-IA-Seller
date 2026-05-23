import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/dashboard") && !pathname.startsWith("/dashboard/login")) {
    const session = req.cookies.get("admin_session")?.value;
    const secret = process.env.ADMIN_SECRET;
    if (!session || !secret || session !== secret) {
      const loginUrl = new URL("/dashboard/login", req.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
