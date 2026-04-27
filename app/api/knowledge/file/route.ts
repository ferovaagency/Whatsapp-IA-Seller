import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ingestText } from "@/lib/knowledge/search";

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
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent([
      { inlineData: { mimeType: "application/pdf", data: base64 } },
      "Extrae todo el contenido de texto de este PDF. Devuelve solo el texto, sin comentarios.",
    ]);
    content = result.response.text();
  } else {
    return NextResponse.json({ error: "Solo se aceptan archivos .txt y .pdf" }, { status: 400 });
  }

  if (!content.trim()) return NextResponse.json({ error: "No se pudo extraer contenido" }, { status: 400 });

  await ingestText(clientId, content, file.name);

  return NextResponse.json({ ok: true, characters: content.length });
}
