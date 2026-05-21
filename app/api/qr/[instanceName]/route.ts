import { NextRequest, NextResponse } from "next/server";
import { getQR, getInstanceStatus, provisionInstance, isInstanceNotFound } from "@/lib/evolution/client";
import { supabaseAdmin } from "@/lib/supabase/client";
import { requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ instanceName: string }> }) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { instanceName } = await params;

  try {
    let [qrData, statusData] = await Promise.all([
      getQR(instanceName),
      getInstanceStatus(instanceName),
    ]);

    // Si la instancia no existe en Evolution API, crearla automáticamente
    if (isInstanceNotFound(qrData) || isInstanceNotFound(statusData)) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      const webhookUrl = appUrl ? `${appUrl}/api/webhook` : "";
      const provisioned = await provisionInstance(instanceName, webhookUrl);

      // Actualizar estado en Supabase
      const newStatus = provisioned ? "ready" : "error";
      await supabaseAdmin
        .from("clients")
        .update({ instance_status: newStatus })
        .eq("instance_name", instanceName);

      if (!provisioned) {
        return NextResponse.json({ error: "No se pudo crear la instancia en Evolution API" }, { status: 503 });
      }

      // Esperar que la instancia inicialice antes de pedir el QR
      await new Promise((r) => setTimeout(r, 3000));

      [qrData, statusData] = await Promise.all([
        getQR(instanceName),
        getInstanceStatus(instanceName),
      ]);
    }

    // Evolution API v2 devuelve { instance: { state: "..." } }, no { state: "..." }
    const state =
      statusData?.instance?.state ||
      statusData?.state ||
      "unknown";

    // El QR puede venir en varias posiciones según la versión de Evolution API
    const qr =
      qrData?.base64 ||
      qrData?.qrcode?.base64 ||
      qrData?.qr?.base64 ||
      null;

    return NextResponse.json({ qr, status: state });
  } catch {
    return NextResponse.json({ error: "Evolution API not available" }, { status: 503 });
  }
}
