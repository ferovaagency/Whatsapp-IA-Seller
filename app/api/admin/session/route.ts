import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

function deriveToken(secret: string): string {
  return createHash("sha256").update(`ferova:${secret}`).digest("hex");
}

// El dashboard llama esto al montar para recuperar el token desde la cookie httpOnly
export async function GET(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const session = req.cookies.get("admin_session")?.value;
  const expectedToken = deriveToken(secret);

  if (session !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ token: expectedToken });
}
