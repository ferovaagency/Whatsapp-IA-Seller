import { NextRequest, NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { getProvider } from "@/lib/ai/provider";
import { searchKnowledge } from "@/lib/knowledge/search";
import { sendMessage } from "@/lib/evolution/client";

const HUMAN_SILENCE_MINUTES = 15;
// Delay reducido a 3s — el sleep de 30s mataba la función en Vercel (timeout 10s hobby / 60s pro)
const BOT_DELAY_MS = 3000;

// Extrae el texto de cualquier tipo de mensaje de WhatsApp
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

// Normaliza el comando para que no falle por tildes, espacios extra, etc.
function normalizeCmd(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // quita tildes
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

  console.log("[webhook]", { event, instanceName, fromMe, text: messageText, remoteJid: msg?.key?.remoteJid });

  if (event !== "messages.upsert") return NextResponse.json({ ok: true });
  if (!msg) return NextResponse.json({ ok: true });

  // ── Comandos del dueño ─────────────────────────────────────────────────────
  if (fromMe) {
    const cmd = normalizeCmd(messageText);

    if (cmd === "activar bot" || cmd === "apagar bot") {
      const { data: owner, error: ownerErr } = await supabaseAdmin
        .from("clients")
        .select("id, bot_enabled")
        .eq("instance_name", instanceName)
        .single();

      console.log("[webhook] owner lookup:", { owner, ownerErr, instanceName });

      if (owner) {
        const enable = cmd === "activar bot";
        const { error: updateErr } = await supabaseAdmin
          .from("clients")
          .update({ bot_enabled: enable })
          .eq("id", owner.id);

        console.log("[webhook] bot toggle:", { enable, updateErr });

        const remoteJid = msg.key?.remoteJid ?? "";
        if (remoteJid) {
          await sendMessage(
            instanceName,
            remoteJid,
            enable
              ? "✅ Bot activado. Tus clientes recibirán respuestas automáticas."
              : "⏸️ Bot desactivado. Responderás manualmente a tus clientes.",
          );
        }
      }
    }

    return NextResponse.json({ ok: true });
  }

  // ── Mensaje de cliente ──────────────────────────────────────────────────────
  const fromNumber = msg.key?.remoteJid?.replace("@s.whatsapp.net", "");
  if (!fromNumber || !messageText) return NextResponse.json({ ok: true });

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("*")
    .eq("instance_name", instanceName)
    .single();

  if (!client || !client.bot_enabled) return NextResponse.json({ ok: true });

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

  await supabaseAdmin.from("messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: messageText,
    whatsapp_message_id: msg.key?.id,
  });

  if (conversation.last_human_reply_at) {
    const minutesSinceHuman =
      (Date.now() - new Date(conversation.last_human_reply_at).getTime()) / 60000;
    if (minutesSinceHuman < HUMAN_SILENCE_MINUTES) {
      return NextResponse.json({ ok: true });
    }
  }

  // Respondemos a Evolution API de inmediato para evitar el timeout de Vercel.
  // El procesamiento de IA sigue corriendo en background con waitUntil.
  const response = NextResponse.json({ ok: true });

  after(processAndReply({
    client,
    conversation,
    messageText,
    instanceName,
    fromNumber,
  }));

  return response;
}

async function processAndReply({
  client,
  conversation,
  messageText,
  instanceName,
  fromNumber,
}: {
  client: any;
  conversation: any;
  messageText: string;
  instanceName: string;
  fromNumber: string;
}) {
  try {
    // Pequeño delay para simular que alguien está escribiendo, sin bloquear Vercel
    await new Promise((r) => setTimeout(r, BOT_DELAY_MS));

    const { data: freshConv } = await supabaseAdmin
      .from("conversations")
      .select("last_human_reply_at")
      .eq("id", conversation.id)
      .single();

    if (freshConv?.last_human_reply_at) {
      const minutesSince =
        (Date.now() - new Date(freshConv.last_human_reply_at).getTime()) / 60000;
      if (minutesSince < HUMAN_SILENCE_MINUTES) return;
    }

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

    // Si el embedding falla (ej. GEMINI_API_KEY no configurada), seguimos sin RAG
    let knowledge = "";
    try {
      knowledge = await searchKnowledge(client.id, messageText);
    } catch (kErr) {
      console.warn("[webhook] searchKnowledge failed, continuing without RAG:", kErr);
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

    console.log("[webhook] replied", { instanceName, fromNumber, chars: reply.length });
  } catch (err) {
    console.error("[webhook] processAndReply error:", err);
  }
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
