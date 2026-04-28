import { NextRequest, NextResponse } from "next/server";
import { getQR, getInstanceStatus } from "@/lib/evolution/client";
import { supabaseAdmin } from "@/lib/supabase/client";
import { requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ instanceName: string }> }) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { instanceName } = await params;

  try {
    const statusData = await getInstanceStatus(instanceName);
    const state = statusData?.instance?.state || statusData?.state;

    if (!state || statusData?.error || statusData?.response?.message) {
      return NextResponse.json({
        qr: null,
        status: "not_created",
        detail: Array.isArray(statusData?.response?.message)
          ? statusData.response.message[0]
          : "La instancia aún no existe en Evolution API. Créala desde el manager.",
      }, { status: 404 });
    }

    // Sync status to DB
    const dbStatus = state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
    supabaseAdmin.from("clients").update({ instance_status: dbStatus }).eq("instance_name", instanceName);

    if (state === "open") {
      return NextResponse.json({ qr: null, status: "open" });
    }

    const qrData = await getQR(instanceName);
    const qr = qrData?.base64 || qrData?.qrcode?.base64 || qrData?.code?.base64 || null;

    return NextResponse.json({ qr, status: state || "connecting" });
  } catch (err) {
    console.error("QR error:", err);
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }
}
