import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  const secret = process.env.ADMIN_SECRET;

  if (!secret || !password || password !== secret) {
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }

  // Token derivado para el dashboard JS — nunca expone el secret real
  const token = createHash("sha256").update(`ferova:${secret}`).digest("hex");

  const res = NextResponse.json({ ok: true, token });
  // Cookie httpOnly guarda el secret para validación en middleware (Edge Runtime, solo string compare)
  res.cookies.set("admin_session", secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return res;
}
