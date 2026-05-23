import { supabaseAdmin } from "../supabase/client";

export async function searchKnowledge(clientId: string, query: string, limit = 5): Promise<string> {
  const { count } = await supabaseAdmin
    .from("knowledge_base")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .then((r) => ({ count: r.count ?? 0 }));

  if (!count) return "";

  // Try vector search if embedding is available
  let embedding: number[] | null = null;
  try {
    embedding = await generateEmbedding(query);
  } catch {
    // Gemini unavailable — fall through to FTS
  }

  if (embedding) {
    const { data, error } = await supabaseAdmin.rpc("match_knowledge", {
      client_id_input: clientId,
      query_embedding: embedding,
      match_count: limit,
    });
    if (!error && data?.length) {
      return data.map((d: { content: string }) => d.content).join("\n\n---\n\n");
    }
  }

  // FTS fallback (works without Gemini)
  const { data: ftsData } = await supabaseAdmin
    .from("knowledge_base")
    .select("content")
    .eq("client_id", clientId)
    .textSearch("content", query, { type: "websearch", config: "spanish" })
    .limit(limit);

  if (ftsData?.length) {
    return ftsData.map((d: { content: string }) => d.content).join("\n\n---\n\n");
  }

  // ILIKE last resort
  const { data: likeData } = await supabaseAdmin
    .from("knowledge_base")
    .select("content")
    .eq("client_id", clientId)
    .ilike("content", `%${query}%`)
    .limit(limit);

  return (likeData ?? []).map((d: { content: string }) => d.content).join("\n\n---\n\n");
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
    let embedding: number[] | null = null;
    try {
      embedding = await generateEmbedding(chunk);
    } catch {
      // Store without embedding — FTS will still find it
    }

    const row: Record<string, unknown> = {
      client_id: clientId,
      content: chunk,
      source,
    };
    if (embedding) row.embedding = embedding;

    await supabaseAdmin.from("knowledge_base").insert(row);
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
