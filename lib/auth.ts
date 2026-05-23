import { NextRequest } from "next/server";
import { createHash } from "crypto";

function deriveToken(secret: string): string {
  return createHash("sha256").update(`ferova:${secret}`).digest("hex");
}

export function requireAdmin(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;

  const expectedToken = deriveToken(secret);

  // Cookie httpOnly (middleware / requests that carry it)
  const session = req.cookies.get("admin_session")?.value;
  if (session === expectedToken) return true;

  // Bearer token enviado por el dashboard JS (sessionStorage → header)
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${expectedToken}`) return true;

  // Compatibilidad hacia atrás: Bearer con el secret directo
  if (auth === `Bearer ${secret}`) return true;

  return false;
}
