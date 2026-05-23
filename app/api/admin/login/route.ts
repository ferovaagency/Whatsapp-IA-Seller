import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

// Token derivado del secret — no expone el secret real al browser
export function deriveToken(secret: string): string {
  return createHash("sha256").update(`ferova:${secret}`).digest("hex");
}

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  const secret = process.env.ADMIN_SECRET;

  if (!secret || !password || password !== secret) {
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }

  const token = deriveToken(secret);

  const res = NextResponse.json({ ok: true, token });
  // Cookie httpOnly para que el middleware proteja las páginas del dashboard
  res.cookies.set("admin_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return res;
}
