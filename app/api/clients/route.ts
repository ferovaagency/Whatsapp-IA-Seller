import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { createInstance, setWebhook } from "@/lib/evolution/client";
import { requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("id, name, business_name, email, instance_name, instance_status, bot_enabled, plan, subscription_status, subscription_expires_at, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, business_name, email, phone, custom_prompt, plan } = body;

  const instanceName = `ferova_${Date.now()}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  // Crear instancia en Evolution API sin bloquear — se hace en background
  const setupEvolution = async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      await createInstance(instanceName);
      await setWebhook(instanceName, `${appUrl}/api/webhook`);
      clearTimeout(timer);
    } catch { /* ignorar */ }
  };
  setupEvolution();

  const { data, error } = await supabaseAdmin
    .from("clients")
    .insert({
      name,
      business_name,
      email,
      phone,
      custom_prompt,
      plan: plan || "starter",
      instance_name: instanceName,
      subscription_status: "trial",
      subscription_expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 días trial
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
