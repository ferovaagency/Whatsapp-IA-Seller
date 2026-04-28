import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";

export async function POST(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .single();

  if (!client) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { description } = await req.json();
  if (!description?.trim()) return NextResponse.json({ error: "Descripción requerida" }, { status: 400 });

  const { error } = await supabaseAdmin.from("problem_reports").insert({
    client_id: clientId,
    description: description.trim(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { data } = await supabaseAdmin
    .from("problem_reports")
    .select("id, description, resolved, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(20);
  return NextResponse.json(data ?? []);
}
