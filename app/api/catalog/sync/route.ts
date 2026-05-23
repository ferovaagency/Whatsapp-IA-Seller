import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";

interface SyncPayload {
  clientId: string;
  url_producto: string;
  nombre: string;
  precio?: string;
  imagen_url?: string;
  categoria?: string;
  hash: string;
}

export async function POST(req: NextRequest) {
  let body: SyncPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { clientId, url_producto, nombre, precio, imagen_url, categoria, hash } = body;

  if (!clientId || !url_producto || !nombre || !hash) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Check if hash changed — skip upsert if identical
  const { data: existing } = await supabaseAdmin
    .from("product_catalog")
    .select("hash")
    .eq("url_producto", url_producto)
    .eq("client_id", clientId)
    .maybeSingle();

  if (existing?.hash === hash) {
    return NextResponse.json({ ok: true, updated: false });
  }

  const { error } = await supabaseAdmin.from("product_catalog").upsert(
    {
      url_producto,
      client_id: clientId,
      nombre,
      precio: precio ?? "",
      imagen_url: imagen_url ?? "",
      categoria: categoria ?? "",
      hash,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "url_producto" },
  );

  if (error) {
    console.error("[catalog/sync] upsert error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: true });
}
