import { supabaseAdmin } from "../supabase/client";

export async function searchKnowledge(clientId: string, query: string, limit = 5): Promise<string> {
  // Check if knowledge base has any content first — avoids embedding calls when empty
  const { count } = await supabaseAdmin
    .from("knowledge_base")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .then((r) => ({ count: r.count ?? 0 }));

  if (!count) return "";

  let embedding: number[];
  try {
    embedding = await generateEmbedding(query);
  } catch {
    // Embedding provider unavailable — skip RAG rather than crashing the bot
    return "";
  }

  const { data, error } = await supabaseAdmin.rpc("match_knowledge", {
    client_id_input: clientId,
    query_embedding: embedding,
    match_count: limit,
  });

  if (error || !data?.length) return "";
  return data.map((d: { content: string }) => d.content).join("\n\n---\n\n");
}

async function generateEmbedding(text: string): Promise<number[]> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("GEMINI_API_KEY not set");

  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

export async function ingestText(clientId: string, content: string, source: string) {
  const chunks = splitIntoChunks(content, 500);
  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk);
    await supabaseAdmin.from("knowledge_base").insert({
      client_id: clientId,
      content: chunk,
      source,
      embedding,
    });
  }
}

function splitIntoChunks(text: string, wordsPerChunk: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(" "));
  }
  return chunks;
}
