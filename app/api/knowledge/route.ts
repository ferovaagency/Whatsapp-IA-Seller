import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { ingestText } from "@/lib/knowledge/search";
import { requireAdmin } from "@/lib/auth";

// POST /api/knowledge — ingestar URL o texto plano
export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { client_id, url, text, source } = body;

  if (!client_id) return NextResponse.json({ error: "client_id required" }, { status: 400 });

  let content = text || "";

  // Si se proporciona URL, scrapear con Firecrawl
  if (url && !text) {
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) {
      return NextResponse.json({ error: "FIRECRAWL_API_KEY not configured" }, { status: 500 });
    }

    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${firecrawlKey}`,
      },
      body: JSON.stringify({ url, formats: ["markdown"] }),
    });

    const data = await res.json() as { success: boolean; data?: { markdown?: string } };
    if (!data.success || !data.data?.markdown) {
      return NextResponse.json({ error: "Failed to scrape URL" }, { status: 500 });
    }
    content = data.data.markdown;
  }

  if (!content) return NextResponse.json({ error: "No content to ingest" }, { status: 400 });

  // Eliminar conocimiento anterior de esta fuente
  await supabaseAdmin
    .from("knowledge_base")
    .delete()
    .eq("client_id", client_id)
    .eq("source", source || url || "manual");

  await ingestText(client_id, content, source || url || "manual");

  return NextResponse.json({ ok: true, characters: content.length });
}

// DELETE /api/knowledge — eliminar todo el conocimiento de un cliente
export async function DELETE(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { client_id } = await req.json();
  await supabaseAdmin.from("knowledge_base").delete().eq("client_id", client_id);
  return NextResponse.json({ ok: true });
}
