import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ingestText } from "@/lib/knowledge/search";

async function extractPdfText(arrayBuffer: ArrayBuffer): Promise<string> {
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  // Try Gemini first
  if (process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent([
        { inlineData: { mimeType: "application/pdf", data: base64 } },
        "Extrae todo el contenido de texto de este PDF. Devuelve solo el texto, sin comentarios.",
      ]);
      const text = result.response.text();
      if (text?.trim()) return text;
    } catch {
      // Fall through to Claude
    }
  }

  // Fallback: Claude
  if (process.env.ANTHROPIC_API_KEY) {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: "Extrae todo el texto de este PDF. Devuelve solo el texto sin comentarios." },
          ] as Parameters<typeof client.messages.create>[0]["messages"][0]["content"],
        },
      ],
    });
    const block = resp.content.find((b) => b.type === "text");
    return (block as { type: "text"; text: string } | undefined)?.text ?? "";
  }

  throw new Error("No hay proveedor de IA disponible para procesar el PDF");
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const clientId = formData.get("client_id") as string;

  if (!file || !clientId) return NextResponse.json({ error: "file y client_id requeridos" }, { status: 400 });

  let content = "";

  if (file.type === "text/plain" || file.name.endsWith(".txt")) {
    content = await file.text();
  } else if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
    try {
      content = await extractPdfText(await file.arrayBuffer());
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: "Solo se aceptan archivos .txt y .pdf" }, { status: 400 });
  }

  if (!content.trim()) return NextResponse.json({ error: "No se pudo extraer contenido" }, { status: 400 });

  await ingestText(clientId, content, file.name);
  return NextResponse.json({ ok: true, characters: content.length });
}
