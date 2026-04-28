import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { getProvider } from "@/lib/ai/provider";
import { searchKnowledge } from "@/lib/knowledge/search";
import { sendMessage } from "@/lib/evolution/client";

const HUMAN_SILENCE_MINUTES = 15; // Si el dueño respondió hace menos de esto, la IA no habla
const BOT_DELAY_SECONDS = 4;      // Pausa breve antes de responder (evita timeout de Vercel)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Evolution API webhook format
    const event = body.event;
    if (event !== "messages.upsert") return NextResponse.json({ ok: true });

    const msg = body.data?.messages?.[0];
    if (!msg || msg.key?.fromMe) return NextResponse.json({ ok: true }); // Ignorar mensajes propios

    const instanceName = body.instance;
    const fromNumber = msg.key?.remoteJid?.replace("@s.whatsapp.net", "");
    const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";

    if (!fromNumber || !messageText) return NextResponse.json({ ok: true });

    // 1. Buscar el cliente por instance name
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("*")
      .eq("instance_name", instanceName)
      .single();

    if (!client || !client.bot_enabled) return NextResponse.json({ ok: true });

    // 2. Verificar suscripción activa
    if (client.subscription_status === "suspended" || client.subscription_status === "cancelled") {
      return NextResponse.json({ ok: true });
    }

    // 3. Obtener o crear conversación
    const { data: conversation } = await supabaseAdmin
      .from("conversations")
      .upsert(
        { client_id: client.id, whatsapp_number: fromNumber, last_message_at: new Date().toISOString() },
        { onConflict: "client_id,whatsapp_number", ignoreDuplicates: false }
      )
      .select()
      .single();

    if (!conversation) return NextResponse.json({ ok: true });

    // 4. Guardar mensaje del usuario final
    await supabaseAdmin.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: messageText,
      whatsapp_message_id: msg.key?.id,
    });

    // 5. FILTRO HÍBRIDO — ¿respondió el dueño recientemente?
    if (conversation.last_human_reply_at) {
      const minutesSinceHuman =
        (Date.now() - new Date(conversation.last_human_reply_at).getTime()) / 60000;
      if (minutesSinceHuman < HUMAN_SILENCE_MINUTES) {
        return NextResponse.json({ ok: true }); // El dueño está activo, IA se calla
      }
    }

    // 6. Esperar BOT_DELAY_SECONDS antes de responder (da chance al dueño)
    await new Promise((r) => setTimeout(r, BOT_DELAY_SECONDS * 1000));

    // Re-verificar si el dueño respondió durante la espera
    const { data: freshConv } = await supabaseAdmin
      .from("conversations")
      .select("last_human_reply_at")
      .eq("id", conversation.id)
      .single();

    if (freshConv?.last_human_reply_at) {
      const minutesSince =
        (Date.now() - new Date(freshConv.last_human_reply_at).getTime()) / 60000;
      if (minutesSince < HUMAN_SILENCE_MINUTES) {
        return NextResponse.json({ ok: true });
      }
    }

    // 7. Recuperar historial reciente (últimos 10 mensajes)
    const { data: history } = await supabaseAdmin
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(10);

    const messages = (history ?? [])
      .reverse()
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // 8. Buscar contexto relevante en la base de conocimiento
    const knowledge = await searchKnowledge(client.id, messageText);

    // 9. Construir system prompt personalizado
    const systemPrompt = buildSystemPrompt(client, knowledge);

    // 10. Generar respuesta con IA
    const ai = await getProvider();
    const reply = await ai.generateResponse(messages, systemPrompt);

    // 11. Enviar respuesta por WhatsApp
    await sendMessage(instanceName, fromNumber + "@s.whatsapp.net", reply);

    // 12. Guardar respuesta en historial
    await supabaseAdmin.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: reply,
    });

    return NextResponse.json({ ok: true, replied: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ ok: true }); // Siempre 200 para que Evolution no reintente
  }
}

function buildSystemPrompt(client: { business_name: string; custom_prompt: string | null }, knowledge: string): string {
  const base = client.custom_prompt ||
    `Eres el asistente de ventas de ${client.business_name}. Tu misión es ayudar a los clientes, responder preguntas y cerrar ventas con calidez y honestidad.`;

  if (!knowledge) return base;

  return `${base}

Usa ÚNICAMENTE la siguiente información del negocio para responder. No inventes datos:

${knowledge}

Reglas:
- Responde en el mismo idioma que el cliente.
- Sé conciso (máximo 3 párrafos cortos).
- Si no sabes algo, di que lo vas a consultar con el equipo.
- Nunca menciones que eres una IA a menos que te lo pregunten directamente.`;
}
