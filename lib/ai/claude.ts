import type { AIProvider, AIMessage } from "./provider";

export class ClaudeProvider implements AIProvider {
  async generateResponse(messages: AIMessage[], systemPrompt: string): Promise<string> {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    type SDKMessage = { content: Array<{ type: "text"; text: string }> };
    const response = (await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    })) as unknown as SDKMessage;

    const text = response.content.find((b) => b.type === "text");
    return text?.text ?? "";
  }
}
