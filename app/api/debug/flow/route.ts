import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { getProvider } from "@/lib/ai/provider";
import { sendMessage } from "@/lib/evolution/client";
import { requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const log: Record<string, unknown> = {};
  const instance = req.nextUrl.searchParams.get("instance");

  // 1. Cliente
  try {
    const baseQuery = supabaseAdmin
      .from("clients")
      .select("id, business_name, bot_enabled, instance_name, subscription_status");

    const { data: client, error } = await (
      instance ? baseQuery.eq("instance_name", instance).single() : baseQuery.single()
    );
    log.step1_client = error ? { error: error.message } : {
      ok: true,
      business_name: client?.business_name,
      bot_enabled: client?.bot_enabled,
      instance: client?.instance_name,
      subscription_status: client?.subscription_status,
    };
    if (!client) return NextResponse.json({ log, failed_at: "step1_client" });

    // 2. IA - generar respuesta de prueba
    try {
      const ai = await getProvider();
      const reply = await ai.generateResponse(
        [{ role: "user", content: "Hola, prueba de diagnóstico" }],
        `Eres el asistente de ${client.business_name}. Responde solo: "Bot funcionando correctamente."`
      );
      log.step2_ai = { ok: true, reply };

      // 3. Evolution API - enviar mensaje
      try {
        const testNumber = "573158885961@s.whatsapp.net";
        const result = await sendMessage(client.instance_name, testNumber, `[DIAGNÓSTICO] ${reply}`);
        log.step3_send = result?.key ? { ok: true, messageId: result.key.id, status: result.status } : { error: result };
      } catch (e) {
        log.step3_send = { error: String(e) };
      }
    } catch (e) {
      log.step2_ai = { error: String(e) };
    }
  } catch (e) {
    log.step1_client = { error: String(e) };
  }

  return NextResponse.json(log);
}
