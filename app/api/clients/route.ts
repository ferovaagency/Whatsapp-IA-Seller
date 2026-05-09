import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { requireAdmin } from "@/lib/auth";
import { provisionInstance } from "@/lib/evolution/client";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data, error } = await supabaseAdmin
      .from("clients")
      .select("id, name, business_name, email, phone, instance_name, instance_status, bot_enabled, plan, custom_prompt, subscription_status, subscription_expires_at, created_at")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { name, business_name, email, phone, custom_prompt, plan } = body;

    const instanceName = `ferova_${Date.now()}`;

    const { data, error } = await supabaseAdmin
      .from("clients")
      .insert({
        name,
        business_name,
        email,
        phone: phone || null,
        custom_prompt: custom_prompt || null,
        plan: plan || "starter",
        instance_name: instanceName,
        instance_status: "pending",
        subscription_status: "trial",
        subscription_expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Crear instancia en Evolution API de forma sincrónica
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const webhookUrl = appUrl ? `${appUrl}/api/webhook` : "";
    const provisioned = await provisionInstance(instanceName, webhookUrl);

    // Actualizar estado en Supabase según resultado
    const newStatus = provisioned ? "ready" : "error";
    await supabaseAdmin
      .from("clients")
      .update({ instance_status: newStatus })
      .eq("id", data.id);

    return NextResponse.json({ ...data, instance_status: newStatus });
  } catch (err: unknown) {
    return NextResponse.json({ error: `Error interno: ${String(err)}` }, { status: 500 });
  }
}
