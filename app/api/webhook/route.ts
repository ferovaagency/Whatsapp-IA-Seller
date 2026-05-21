import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { getProvider } from "@/lib/ai/provider";
import { searchKnowledge } from "@/lib/knowledge/search";
import { sendMessage } from "@/lib/evolution/client";

const HUMAN_SILENCE_MINUTES = 15;

function extractText(msg: any): string {
  return (
    msg?.message?.conversation ||
    msg?.message?.extendedTextMessage?.text ||
    msg?.message?.ephemeralMessage?.message?.conversation ||
    msg?.message?.ephemeralMessage?.message?.extendedTextMessage?.text ||
    msg?.message?.viewOnceMessage?.message?.conversation ||
    msg?.message?.imageMessage?.caption ||
    msg?.message?.videoMessage?.caption ||
    msg?.message?.documentMessage?.caption ||
    ""
  );
}

function normalizeCmd(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const event = body.event;
  const rawMessages: any[] =
    Array.isArray(body.data) ? body.data :
    Array.isArray(body.data?.messages) ? body.data.messages :
    [];

  const msg = rawMessages[0];
  const instanceName: string = body.instance ?? "";
  const messageText = extractText(msg);
  const fromMe: boolean = !!msg?.key?.fromMe;

  console.log("[webhook]", { event, instanceName, fromMe, text: messageText?.slice(0, 80) });

  if (event !== "messages.upsert") return NextResponse.json({ ok: true });
  if (!msg) return NextResponse.json({ ok: true });

  // ── Comandos del dueño ───────────────────────────────────────────────────────
  if (fromMe) {
    const cmd = normalizeCmd(messageText);
    if (cmd === "activar bot" || cmd === "apagar bot") {
      const { data: owner } = await supabaseAdmin
        .from("clients")
        .select("id")
        .eq("instance_name", instanceName)
        .single();

      if (owner) {
        const enable = cmd === "activar bot";
        await supabaseAdmin.from("clients").update({ bot_enabled: enable }).eq("id", owner.id);
        const remoteJid = msg.key?.remoteJid ?? "";
        if (remoteJid) {
          await sendMessage(instanceName, remoteJid,
            enable
              ? "✅ Bot activado. Tus clientes recibirán respuestas automáticas."
              : "⏸️ Bot desactivado. Responderás manualmente a tus clientes."
          );
        }
        console.log("[webhook] bot toggled:", { enable, instance: instanceName });
      }
    }
    return NextResponse.json({ ok: true });
  }

  // ── Mensaje de cliente ───────────────────────────────────────────────────────
  const fromNumber = msg.key?.remoteJid?.replace("@s.whatsapp.net", "");
  if (!fromNumber || !messageText) return NextResponse.json({ ok: true });

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("*")
    .eq("instance_name", instanceName)
    .single();

  if (!client) {
    console.warn("[webhook] no client for instance:", instanceName);
    return NextResponse.json({ ok: true });
  }
  if (!client.bot_enabled) {
    console.log("[webhook] bot disabled for:", instanceName);
    return NextResponse.json({ ok: true });
  }
  if (client.subscription_status === "suspended" || client.subscription_status === "cancelled") {
    return NextResponse.json({ ok: true });
  }

  const { data: conversation } = await supabaseAdmin
    .from("conversations")
    .upsert(
      { client_id: client.id, whatsapp_number: fromNumber, last_message_at: new Date().toISOString() },
      { onConflict: "client_id,whatsapp_number", ignoreDuplicates: false },
    )
    .select()
    .single();

  if (!conversation) return NextResponse.json({ ok: true });

  // Deduplicar por whatsapp_message_id
  const msgId = msg.key?.id;
  if (msgId) {
    const { count } = await supabaseAdmin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("whatsapp_message_id", msgId);
    if (count && count > 0) {
      console.log("[webhook] duplicate message ignored:", msgId);
      return NextResponse.json({ ok: true });
    }
  }

  await supabaseAdmin.from("messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: messageText,
    whatsapp_message_id: msgId ?? null,
  });

  // Si el dueño respondió recientemente, el bot no interrumpe
  if (conversation.last_human_reply_at) {
    const minutesSince = (Date.now() - new Date(conversation.last_human_reply_at).getTime()) / 60000;
    if (minutesSince < HUMAN_SILENCE_MINUTES) {
      console.log("[webhook] human active, skipping bot reply");
      return NextResponse.json({ ok: true });
    }
  }

  // ── Generar y enviar respuesta ───────────────────────────────────────────────
  try {
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

    let knowledge = "";
    try {
      knowledge = await searchKnowledge(client.id, messageText);
    } catch {
      // Continúa sin RAG si Gemini no está disponible
    }

    const systemPrompt = buildSystemPrompt(client, knowledge);
    const ai = await getProvider();
    const reply = await ai.generateResponse(messages, systemPrompt);

    await sendMessage(instanceName, fromNumber + "@s.whatsapp.net", reply);

    await supabaseAdmin.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: reply,
    });

    console.log("[webhook] replied OK", { instanceName, fromNumber, chars: reply.length });
  } catch (err) {
    console.error("[webhook] reply error:", err);
  }

  return NextResponse.json({ ok: true, replied: true });
}

function buildSystemPrompt(
  client: { business_name: string; custom_prompt: string | null },
  knowledge: string,
): string {
  const base =
    client.custom_prompt ||
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
