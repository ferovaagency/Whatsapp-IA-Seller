import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data, error } = await supabaseAdmin
      .from("clients")
      .select("id, name, business_name, email, phone, instance_name, instance_status, bot_enabled, plan, custom_prompt, subscription_status, subscription_expires_at, created_at")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { name, business_name, email, phone, custom_prompt, plan } = body;

    const instanceName = `ferova_${Date.now()}`;

    const { data, error } = await supabaseAdmin
      .from("clients")
      .insert({
        name,
        business_name,
        email,
        phone: phone || null,
        custom_prompt: custom_prompt || null,
        plan: plan || "starter",
        instance_name: instanceName,
        subscription_status: "trial",
        subscription_expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Crear instancia en Evolution API
    const evolutionUrl = (process.env.EVOLUTION_API_URL || "").trim().replace(/\/$/, "");
    const evolutionKey = (process.env.EVOLUTION_API_KEY || "").trim();
    let evolutionResult: { ok: boolean; status?: number; body?: unknown; error?: string } = { ok: false, error: "Evolution API no configurada (faltan env vars)" };

    if (evolutionUrl && evolutionKey) {
      try {
        const evoRes = await fetch(`${evolutionUrl}/instance/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evolutionKey },
          body: JSON.stringify({ instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
          signal: AbortSignal.timeout(10000),
        });
        const evoBody = await evoRes.json().catch(() => null);
        evolutionResult = { ok: evoRes.ok, status: evoRes.status, body: evoBody };

        // Webhook: solo si la instancia se creó bien y tenemos appUrl
        if (evoRes.ok) {
          const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
          if (appUrl) {
            fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evolutionKey },
              body: JSON.stringify({ webhook: { enabled: true, url: `${appUrl}/api/webhook`, events: ["MESSAGES_UPSERT"] } }),
              signal: AbortSignal.timeout(5000),
            }).catch(() => {});
          }
        }
      } catch (e) {
        evolutionResult = { ok: false, error: String(e) };
      }
    }

    return NextResponse.json({ ...data, _evolution: evolutionResult });
  } catch (err: unknown) {
    return NextResponse.json({ error: `Error interno: ${String(err)}` }, { status: 500 });
  }
}
