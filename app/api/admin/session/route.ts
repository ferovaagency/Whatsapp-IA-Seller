import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

export async function GET(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const session = req.cookies.get("admin_session")?.value;
  if (session !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = createHash("sha256").update(`ferova:${secret}`).digest("hex");
  return NextResponse.json({ token });
}
