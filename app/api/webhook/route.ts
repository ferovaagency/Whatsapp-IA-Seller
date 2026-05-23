import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { getProvider } from "@/lib/ai/provider";
import { searchKnowledge } from "@/lib/knowledge/search";
import { sendMessage, sendMedia } from "@/lib/evolution/client";
import { clientHasCatalog } from "@/lib/catalog/search";
import type { CatalogProduct } from "@/lib/catalog/search";
import { generateWithCatalog } from "@/lib/catalog/tool";

const HUMAN_SILENCE_MINUTES = 30;

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

  // Evolution API v2 envía body.data como objeto único; v1/otros como array
  let msg: any = null;
  if (Array.isArray(body.data)) {
    msg = body.data[0] ?? null;
  } else if (Array.isArray(body.data?.messages)) {
    msg = body.data.messages[0] ?? null;
  } else if (body.data?.key) {
    // v2: data es el mensaje directamente
    msg = body.data;
  }

  const instanceName: string = body.instance ?? "";
  const messageText = extractText(msg);
  const fromMe: boolean = !!msg?.key?.fromMe;

  console.log("[webhook]", { event, instanceName, fromMe, text: messageText?.slice(0, 80) });

  if (event !== "messages.upsert") return NextResponse.json({ ok: true });
  if (!msg) return NextResponse.json({ ok: true });

  // ── Mensajes del dueño ───────────────────────────────────────────────────────
  if (fromMe) {
    const remoteJid = msg.key?.remoteJid ?? "";
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
        if (remoteJid) {
          await sendMessage(instanceName, remoteJid,
            enable
              ? "✅ Bot activado. Tus clientes recibirán respuestas automáticas."
              : "⏸️ Bot desactivado. Responderás manualmente a tus clientes."
          );
        }
        console.log("[webhook] bot toggled:", { enable, instance: instanceName });
      }
    } else if (messageText && remoteJid && !remoteJid.endsWith("@g.us")) {
      // El dueño respondió manualmente a un cliente → pausar el bot 30 min para esa conversación
      const customerNumber = remoteJid.replace("@s.whatsapp.net", "");
      const { data: owner } = await supabaseAdmin
        .from("clients")
        .select("id")
        .eq("instance_name", instanceName)
        .single();

      if (owner) {
        await supabaseAdmin
          .from("conversations")
          .update({ last_human_reply_at: new Date().toISOString() })
          .eq("client_id", owner.id)
          .eq("whatsapp_number", customerNumber);
        console.log("[webhook] human reply detected, bot paused 30min:", { instanceName, customerNumber });
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
      // Continúa sin RAG si no está disponible
    }

    const systemPrompt = buildSystemPrompt(client, knowledge);
    const hasCatalog = await clientHasCatalog(client.id);
    const isClaudeProvider =
      (process.env.AI_PROVIDER || "gemini").trim() === "claude" && process.env.ANTHROPIC_API_KEY;

    let reply: string;
    let productToSend: CatalogProduct | null = null;

    if (hasCatalog && isClaudeProvider) {
      const result = await generateWithCatalog(client.id, messages, systemPrompt);
      reply = result.text;
      productToSend = result.product;
    } else {
      const ai = await getProvider();
      reply = await ai.generateResponse(messages, systemPrompt);
    }

    const recipientJid = fromNumber + "@s.whatsapp.net";
    await sendMessage(instanceName, recipientJid, reply);

    // Send product card if catalog search returned a result with an image
    if (productToSend && productToSend.imagen_url) {
      const caption =
        `*🛍️ ¡Te recomiendo este producto!*\n\n` +
        `*📌 ${productToSend.nombre}*\n` +
        (productToSend.precio ? `*💰 Precio:* ${productToSend.precio}\n` : "") +
        `\n🔗 *Ver en la web:* ${productToSend.url_producto}`;
      try {
        await sendMedia(instanceName, recipientJid, productToSend.imagen_url, caption);
      } catch (mediaErr) {
        console.warn("[webhook] sendMedia failed:", mediaErr);
      }
    }

    await supabaseAdmin.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: reply,
    });

    console.log("[webhook] replied OK", { instanceName, fromNumber, chars: reply.length, hasCatalog, sentProduct: !!productToSend });
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
