import { supabaseAdmin } from "../supabase/client";

export async function searchKnowledge(clientId: string, query: string, limit = 5): Promise<string> {
  // Generate embedding for the query using Gemini or OpenAI
  const embedding = await generateEmbedding(query);

  const { data, error } = await supabaseAdmin.rpc("match_knowledge", {
    client_id_input: clientId,
    query_embedding: embedding,
    match_count: limit,
  });

  if (error || !data?.length) return "";

  return data.map((d: { content: string }) => d.content).join("\n\n---\n\n");
}

async function generateEmbedding(text: string): Promise<number[]> {
  // Use Gemini embedding model
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

export async function ingestText(clientId: string, content: string, source: string) {
  // Split into chunks of ~500 words
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
