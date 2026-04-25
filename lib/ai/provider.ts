export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIProvider {
  generateResponse(messages: AIMessage[], systemPrompt: string): Promise<string>;
}

export async function getProvider(): Promise<AIProvider> {
  const name = (process.env.AI_PROVIDER || "gemini").trim();

  if (name === "claude" && process.env.ANTHROPIC_API_KEY) {
    const { ClaudeProvider } = await import("./claude");
    return new ClaudeProvider();
  }

  if (process.env.GEMINI_API_KEY) {
    const { GeminiProvider } = await import("./gemini");
    return new GeminiProvider();
  }

  throw new Error("No AI provider configured. Set GEMINI_API_KEY or ANTHROPIC_API_KEY.");
}
