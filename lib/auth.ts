import { NextRequest } from "next/server";

export function requireAdmin(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  return auth === `Bearer ${secret}`;
}
