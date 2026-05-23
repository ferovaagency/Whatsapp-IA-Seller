import type { AIMessage } from "../ai/provider";
import type { CatalogProduct } from "./search";
import { searchCatalog } from "./search";

export interface CatalogReply {
  text: string;
  product: CatalogProduct | null;
}

const CATALOG_TOOL = {
  name: "buscar_en_catalogo",
  description:
    "Busca productos en el catálogo del negocio. Úsala cuando el cliente pregunte por productos, precios, disponibilidad o recomendaciones.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Términos de búsqueda del producto (nombre, categoría, descripción)",
      },
    },
    required: ["query"],
  },
};

export async function generateWithCatalog(
  clientId: string,
  messages: AIMessage[],
  systemPrompt: string,
): Promise<CatalogReply> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // First turn: let Claude decide whether to call the tool
  const firstResponse = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: systemPrompt,
    tools: [CATALOG_TOOL],
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  // No tool call — return text directly
  if (firstResponse.stop_reason !== "tool_use") {
    const textBlock = firstResponse.content.find((b) => b.type === "text");
    return { text: (textBlock as { type: "text"; text: string } | undefined)?.text ?? "", product: null };
  }

  // Find the tool use block
  const toolUseBlock = firstResponse.content.find((b) => b.type === "tool_use") as
    | { type: "tool_use"; id: string; name: string; input: { query: string } }
    | undefined;

  if (!toolUseBlock) {
    const textBlock = firstResponse.content.find((b) => b.type === "text");
    return { text: (textBlock as { type: "text"; text: string } | undefined)?.text ?? "", product: null };
  }

  // Execute the catalog search
  const results = await searchCatalog(clientId, toolUseBlock.input.query);
  const topProduct = results[0] ?? null;

  const toolResultContent =
    results.length > 0
      ? results
          .map(
            (p, i) =>
              `${i + 1}. **${p.nombre}** — Precio: ${p.precio}${p.categoria ? ` | Categoría: ${p.categoria}` : ""}\n   Link: ${p.url_producto}`,
          )
          .join("\n")
      : "No se encontraron productos para esa búsqueda.";

  // Second turn: give Claude the tool result
  const secondResponse = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: systemPrompt,
    tools: [CATALOG_TOOL],
    messages: [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "assistant" as const, content: firstResponse.content },
      {
        role: "user" as const,
        content: [
          {
            type: "tool_result" as const,
            tool_use_id: toolUseBlock.id,
            content: toolResultContent,
          },
        ],
      },
    ],
  });

  const finalText = secondResponse.content.find((b) => b.type === "text");
  return {
    text: (finalText as { type: "text"; text: string } | undefined)?.text ?? "",
    product: topProduct,
  };
}
