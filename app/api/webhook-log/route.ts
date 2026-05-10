import { NextRequest, NextResponse } from "next/server";

// Buffer en memoria — guarda los últimos 10 payloads recibidos
const log: { ts: string; event: string; fromMe: boolean; text: string; instance: string }[] = [];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawMessages: any[] =
      Array.isArray(body.data) ? body.data :
      Array.isArray(body.data?.messages) ? body.data.messages :
      [];
    const msg = rawMessages[0];
    const text =
      msg?.message?.conversation ||
      msg?.message?.extendedTextMessage?.text || "";

    log.unshift({
      ts: new Date().toISOString(),
      event: body.event ?? "?",
      fromMe: !!msg?.key?.fromMe,
      text,
      instance: body.instance ?? "",
    });
    if (log.length > 10) log.pop();
  } catch { /* ignore */ }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json(log);
}
