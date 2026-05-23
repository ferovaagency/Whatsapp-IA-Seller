import { NextRequest } from "next/server";
import { createHash } from "crypto";

export function requireAdmin(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;

  // Cookie httpOnly (middleware sessions)
  const session = req.cookies.get("admin_session")?.value;
  if (session === secret) return true;

  const auth = req.headers.get("authorization");
  if (!auth) return false;

  // Bearer token derivado (dashboard JS)
  const expectedToken = createHash("sha256").update(`ferova:${secret}`).digest("hex");
  if (auth === `Bearer ${expectedToken}`) return true;

  // Compatibilidad: Bearer con secret directo
  if (auth === `Bearer ${secret}`) return true;

  return false;
}
