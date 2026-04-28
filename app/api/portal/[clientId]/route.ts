import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";

async function getClient(clientId: string) {
  const { data } = await supabaseAdmin
    .from("clients")
    .select("id, business_name, bot_enabled, instance_status, subscription_status, custom_prompt")
    .eq("id", clientId)
    .single();
  return data;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client = await getClient(clientId);
  if (!client) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(client);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client = await getClient(clientId);
  if (!client) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json();
  const allowed = ["bot_enabled", "custom_prompt"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  const { error } = await supabaseAdmin.from("clients").update(update).eq("id", clientId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
