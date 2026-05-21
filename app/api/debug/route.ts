import { NextResponse } from "next/server";

export async function GET() {
  const evolutionUrl = (process.env.EVOLUTION_API_URL || "").trim().replace(/\/$/, "");
  const evolutionKey = (process.env.EVOLUTION_API_KEY || "").trim();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
  const geminiKey = process.env.GEMINI_API_KEY || "";
  const anthropicKey = process.env.ANTHROPIC_API_KEY || "";
  const aiProvider = (process.env.AI_PROVIDER || "gemini").trim();

  // Probar Evolution API
  let evolutionPing: unknown = "no probado (faltan env vars)";
  if (evolutionUrl && evolutionKey) {
    try {
      const res = await fetch(`${evolutionUrl}/instance/fetchInstances`, {
        headers: { apikey: evolutionKey },
        signal: AbortSignal.timeout(8000),
      });
      const body = await res.json().catch(() => null);
      const instances = Array.isArray(body)
        ? body.map((i: Record<string, unknown>) => ({
            name: (i.instanceName ?? i.instance?.instanceName) as string | undefined,
            state: (i.connectionStatus ?? i.instance?.state) as string | undefined,
          }))
        : body;
      evolutionPing = { status: res.status, ok: res.ok, instances };
    } catch (e) {
      evolutionPing = { error: String(e) };
    }
  }

  // Probar IA
  let aiTest: unknown = "no probado";
  const activeKey = aiProvider === "claude" ? anthropicKey : geminiKey;
  if (activeKey) {
    try {
      if (aiProvider === "claude" && anthropicKey) {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic({ apiKey: anthropicKey });
        const resp = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 20,
          messages: [{ role: "user", content: "di solo: ok" }],
        });
        aiTest = { ok: true, provider: "claude", reply: (resp.content[0] as { text: string }).text };
      } else if (geminiKey) {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent("di solo: ok");
        aiTest = { ok: true, provider: "gemini", reply: result.response.text().slice(0, 50) };
      }
    } catch (e) {
      aiTest = { ok: false, error: String(e) };
    }
  } else {
    aiTest = { ok: false, error: "Sin API key de IA configurada" };
  }

  return NextResponse.json({
    ADMIN_SECRET: process.env.ADMIN_SECRET ? "✅ set" : "❌ missing",
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? "✅ set" : "❌ missing",
    SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE_KEY ? "✅ set" : "❌ missing",
    EVOLUTION_URL: evolutionUrl || "❌ missing",
    EVOLUTION_KEY: evolutionKey ? "✅ set" : "❌ missing",
    APP_URL: appUrl || "❌ missing (webhook no funcionará)",
    AI_PROVIDER: aiProvider,
    GEMINI_KEY: geminiKey ? "✅ set" : "❌ missing",
    ANTHROPIC_KEY: anthropicKey ? "✅ set" : "❌ missing",
    evolution_ping: evolutionPing,
    ai_test: aiTest,
  });
}
