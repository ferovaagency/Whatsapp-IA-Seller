import { NextRequest, NextResponse } from "next/server";
import { getQR, getInstanceStatus } from "@/lib/evolution/client";
import { requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ instanceName: string }> }) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { instanceName } = await params;

  try {
    const [qrData, status] = await Promise.all([
      getQR(instanceName),
      getInstanceStatus(instanceName),
    ]);

    return NextResponse.json({
      qr: qrData?.base64 || qrData?.qrcode?.base64 || null,
      status: status?.state || "unknown",
    });
  } catch {
    return NextResponse.json({ error: "Evolution API not available" }, { status: 503 });
  }
}
