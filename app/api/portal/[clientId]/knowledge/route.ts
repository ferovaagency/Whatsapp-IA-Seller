import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { ingestText } from "@/lib/knowledge/search";

async function verifyClient(clientId: string) {
  const { data } = await supabaseAdmin.from("clients").select("id").eq("id", clientId).single();
  return !!data;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (!await verifyClient(clientId)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { data } = await supabaseAdmin
    .from("knowledge_base")
    .select("source, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  // Group by source
  const sources: Record<string, { source: string; chunks: number; added_at: string }> = {};
  for (const row of data ?? []) {
    const key = row.source ?? "manual";
    if (!sources[key]) sources[key] = { source: key, chunks: 0, added_at: row.created_at };
    sources[key].chunks++;
  }

  return NextResponse.json(Object.values(sources));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (!await verifyClient(clientId)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json();
  const { text, url, source } = body;

  let content = text;
  if (url) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const html = await res.text();
      content = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 50000);
    } catch {
      return NextResponse.json({ error: "No se pudo cargar la URL" }, { status: 400 });
    }
  }

  if (!content?.trim()) return NextResponse.json({ error: "Contenido vacío" }, { status: 400 });

  await ingestText(clientId, content, source ?? url ?? "manual");
  return NextResponse.json({ ok: true, characters: content.length });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (!await verifyClient(clientId)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const query = supabaseAdmin.from("knowledge_base").delete().eq("client_id", clientId);

  if (body.source) {
    const { error } = await query.eq("source", body.source);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
