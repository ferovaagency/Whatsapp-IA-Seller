import { NextRequest, NextResponse } from "next/server";
import { getQR, getInstanceStatus, createInstance, setWebhook } from "@/lib/evolution/client";
import { requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ instanceName: string }> }) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { instanceName } = await params;

  try {
    // Check if instance exists; if not, create it
    const statusData = await getInstanceStatus(instanceName);
    const state = statusData?.instance?.state || statusData?.state;

    if (!state || statusData?.error || statusData?.response?.message) {
      // Instance doesn't exist — create it and set webhook
      await createInstance(instanceName);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      if (appUrl) await setWebhook(instanceName, `${appUrl}/api/webhook`);
    }

    if (state === "open") {
      return NextResponse.json({ qr: null, status: "open" });
    }

    const qrData = await getQR(instanceName);
    const qr = qrData?.base64 || qrData?.qrcode?.base64 || qrData?.code?.base64 || null;

    return NextResponse.json({
      qr,
      status: state || "connecting",
    });
  } catch (err) {
    console.error("QR error:", err);
    return NextResponse.json({ error: "Evolution API not available" }, { status: 503 });
  }
}
