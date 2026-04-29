import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { requireAdmin } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data: client, error: fetchError } = await supabaseAdmin
    .from("clients")
    .select("instance_name")
    .eq("id", id)
    .single();

  if (fetchError || !client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const evolutionUrl = (process.env.EVOLUTION_API_URL || "").trim().replace(/\/$/, "");
  const evolutionKey = (process.env.EVOLUTION_API_KEY || "").trim();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();

  if (!evolutionUrl || !evolutionKey) {
    return NextResponse.json({ error: "EVOLUTION_API_URL o EVOLUTION_API_KEY no configuradas" }, { status: 500 });
  }
  if (!appUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL no configurada — necesaria para el webhook" }, { status: 500 });
  }

  try {
    const res = await fetch(`${evolutionUrl}/webhook/set/${client.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evolutionKey },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: `${appUrl}/api/webhook`,
          events: ["MESSAGES_UPSERT"],
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    const result = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: result?.message ?? "Error al configurar webhook" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, webhookUrl: `${appUrl}/api/webhook`, instance: client.instance_name });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }
}

// GET — verificar webhook actual configurado en Evolution API
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data: client, error: fetchError } = await supabaseAdmin
    .from("clients")
    .select("instance_name")
    .eq("id", id)
    .single();

  if (fetchError || !client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const evolutionUrl = (process.env.EVOLUTION_API_URL || "").trim().replace(/\/$/, "");
  const evolutionKey = (process.env.EVOLUTION_API_KEY || "").trim();

  if (!evolutionUrl || !evolutionKey) {
    return NextResponse.json({ error: "Evolution API no configurada" }, { status: 500 });
  }

  try {
    const res = await fetch(`${evolutionUrl}/webhook/find/${client.instance_name}`, {
      headers: { apikey: evolutionKey },
      signal: AbortSignal.timeout(8000),
    });

    const result = await res.json();
    return NextResponse.json({ instance: client.instance_name, webhook: result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }
}
