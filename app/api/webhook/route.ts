import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { getProvider } from "@/lib/ai/provider";
import { searchKnowledge } from "@/lib/knowledge/search";
import { sendMessage, getMediaBase64 } from "@/lib/evolution/client";

const HUMAN_SILENCE_MINUTES = 5;
const BOT_DELAY_SECONDS = 2;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.event !== "messages.upsert") return NextResponse.json({ ok: true });

    const msg = body.data?.messages?.[0];
    if (!msg) return NextResponse.json({ ok: true });

    const instanceName = body.instance;
    const remoteJid: string = msg.key?.remoteJid ?? "";
    const fromNumber = remoteJid.replace("@s.whatsapp.net", "");

    if (!fromNumber || remoteJid.endsWith("@g.us")) return NextResponse.json({ ok: true }); // ignorar grupos

    // Si es mensaje del dueño: actualizar last_human_reply_at y salir
    if (msg.key?.fromMe) {
      const { data: client } = await supabaseAdmin
        .from("clients")
        .select("id")
        .eq("instance_name", instanceName)
        .single();

      if (client) {
        await supabaseAdmin
          .from("conversations")
          .update({ last_human_reply_at: new Date().toISOString() })
          .eq("client_id", client.id)
          .eq("whatsapp_number", fromNumber);
      }
      return NextResponse.json({ ok: true });
    }

    // Detectar tipo de mensaje
    const isAudio = !!(msg.message?.audioMessage || msg.message?.pttMessage);
    let messageText: string =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      "";

    // Transcribir audio con Gemini
    if (isAudio && !messageText) {
      try {
        const mediaData = await getMediaBase64(instanceName, msg);
        if (mediaData?.base64) {
          messageText = await transcribeAudio(mediaData.base64, mediaData.mimetype ?? "audio/ogg");
        }
      } catch {
        // Si falla la transcripción, avisa al usuario
      }
    }

    if (!messageText) return NextResponse.json({ ok: true });

    // 1. Buscar cliente
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("*")
      .eq("instance_name", instanceName)
      .single();

    if (!client || !client.bot_enabled) return NextResponse.json({ ok: true });

    if (client.subscription_status === "suspended" || client.subscription_status === "cancelled") {
      return NextResponse.json({ ok: true });
    }

    // 2. Obtener o crear conversación
    const { data: conversation } = await supabaseAdmin
      .from("conversations")
      .upsert(
        { client_id: client.id, whatsapp_number: fromNumber, last_message_at: new Date().toISOString() },
        { onConflict: "client_id,whatsapp_number", ignoreDuplicates: false }
      )
      .select()
      .single();

    if (!conversation) return NextResponse.json({ ok: true });

    // 3. Guardar mensaje del usuario
    const contentToSave = isAudio ? `[Audio transcrito]: ${messageText}` : messageText;
    await supabaseAdmin.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: contentToSave,
      whatsapp_message_id: msg.key?.id,
    });

    // 4. Filtro híbrido — ¿respondió el dueño recientemente?
    if (conversation.last_human_reply_at) {
      const minutesSinceHuman =
        (Date.now() - new Date(conversation.last_human_reply_at).getTime()) / 60000;
      if (minutesSinceHuman < HUMAN_SILENCE_MINUTES) {
        return NextResponse.json({ ok: true });
      }
    }

    // 5. Esperar y re-verificar
    await new Promise((r) => setTimeout(r, BOT_DELAY_SECONDS * 1000));

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

    // 6. Historial reciente
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

    // 7. Conocimiento relevante (solo si hay documentos cargados)
    const { count } = await supabaseAdmin
      .from("knowledge_base")
      .select("id", { count: "exact", head: true })
      .eq("client_id", client.id);
    const knowledge = count && count > 0 ? await searchKnowledge(client.id, messageText) : "";

    // 8. Generar respuesta
    const systemPrompt = buildSystemPrompt(client, knowledge);
    const ai = await getProvider();
    const reply = await ai.generateResponse(messages, systemPrompt);

    // 9. Enviar y guardar
    await sendMessage(instanceName, remoteJid, reply);
    await supabaseAdmin.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: reply,
    });

    return NextResponse.json({ ok: true, replied: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ ok: true });
  }
}

async function transcribeAudio(base64: string, mimetype: string): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const audioData = base64.replace(/^data:[^;]+;base64,/, "");
  const cleanMime = mimetype.split(";")[0].trim() || "audio/ogg";

  const result = await model.generateContent([
    { inlineData: { mimeType: cleanMime, data: audioData } },
    "Transcribe este mensaje de audio. Devuelve únicamente el texto transcrito, sin comentarios adicionales.",
  ]);
  return result.response.text().trim();
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
