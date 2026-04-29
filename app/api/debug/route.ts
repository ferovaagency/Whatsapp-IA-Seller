import { NextResponse } from "next/server";

export async function GET() {
  const evolutionUrl = (process.env.EVOLUTION_API_URL || "").trim().replace(/\/$/, "");
  const evolutionKey = (process.env.EVOLUTION_API_KEY || "").trim();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();

  // Probar conectividad real con Evolution API
  let evolutionPing: unknown = "no probado (faltan env vars)";
  if (evolutionUrl && evolutionKey) {
    try {
      const res = await fetch(`${evolutionUrl}/instance/fetchInstances`, {
        headers: { apikey: evolutionKey },
        signal: AbortSignal.timeout(8000),
      });
      const body = await res.json().catch(() => null);
      evolutionPing = { status: res.status, ok: res.ok, instances: Array.isArray(body) ? body.map((i: { instance?: { instanceName?: string; state?: string } }) => ({ name: i.instance?.instanceName, state: i.instance?.state })) : body };
    } catch (e) {
      evolutionPing = { error: String(e) };
    }
  }

  return NextResponse.json({
    ADMIN_SECRET: process.env.ADMIN_SECRET ? "✅ set" : "❌ missing",
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? "✅ set" : "❌ missing",
    SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE_KEY ? "✅ set" : "❌ missing",
    EVOLUTION_URL: evolutionUrl || "❌ missing",
    EVOLUTION_KEY: evolutionKey ? "✅ set" : "❌ missing",
    APP_URL: appUrl || "❌ missing (webhook no funcionará)",
    evolution_ping: evolutionPing,
  });
}
