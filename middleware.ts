import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

function deriveToken(secret: string): string {
  return createHash("sha256").update(`ferova:${secret}`).digest("hex");
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/dashboard") && !pathname.startsWith("/dashboard/login")) {
    const session = req.cookies.get("admin_session")?.value;
    const secret = process.env.ADMIN_SECRET;
    if (!session || !secret || session !== deriveToken(secret)) {
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
